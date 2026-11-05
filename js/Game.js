// Game.js — «Find a Legendary Needle»: игра от первого лица. Игрок хватает сено из огромного стога
// (GamePile), носит его в рюкзаке, продаёт в Сенопрессе, покупает инструменты и улучшения в мастерской
// и ищет спрятанную в стоге легендарную иглу (компас в левой руке указывает на неё). Нашёл — награда,
// игла на полку трофеев, следующий стог больше. Точки мира — маркеры карты farm (Maps.js).

/** @satisfies {Record<string, any>} */
const Game = {
    /** @type {any} */ app: null,
    /** @type {any} */ save: null,
    /** @type {GamePile | null} */ pile: null,
    /** @type {GamePlayer | null} */ player: null,
    /** @type {GameViewModel | null} */ vm: null,
    state: 'boot',
    aim: '',
    /** @type {any} */ aimHit: null,
    /** @type {any} */ target: null,
    cd: 0, cdMax: 1,
    boomCd: 0,
    coinsShown: 0,
    menuA: 0,
    glintT: 2, lastGlint: -99, sparkT: 0,
    compassPhase: 0, compassPulse: 0,
    vacAcc: 0, vacDig: 0, vacLoop: null,
    saveT: 0, dirty: false,
    toastT: {},
    tutGrabs: 0,
    time: 0,
    exposed: 0,

    // =====================================================================================
    // Сохранение
    // =====================================================================================

    defaultSave() {
        const bag = {}, found = {};
        for (const id of GAME_STRAW_ORDER) { bag[id] = 0; found[id] = 0; }
        return {
            v: 1, started: false, coins: 0, gems: 0, gemsSeen: false, level: 0, seed: (Math.random() * 1e9) | 0,
            bag, found, tools: ['hand'], tool: 'hand', pack: 0, compass: false, firecracker: false, magpies: 0,
            upg: {}, adProg: {}, treasures: {}, needles: [], pile: null, pos: null, tutorialDone: false,
            settings: { sens: 1, music: true }, stats: { grabs: 0, sold: 0, play: 0, earned: 0 }, vacTrial: false,
        };
    },

    async loadSave() {
        let s = null;
        try { s = await Platform.load(); } catch (e) { console.warn('Game: сохранение не загрузилось', e); }
        const d = this.defaultSave();
        if (!s || typeof s !== 'object') return d;
        const out = Object.assign(d, s);
        out.bag = Object.assign(this.defaultSave().bag, s.bag || {});
        out.found = Object.assign(this.defaultSave().found, s.found || {});
        out.settings = Object.assign({ sens: 1, music: true }, s.settings || {});
        out.upg = Object.assign({}, s.upg || {});
        out.adProg = Object.assign({}, s.adProg || {});
        out.treasures = Object.assign({}, s.treasures || {});
        out.stats = Object.assign({ grabs: 0, sold: 0, play: 0, earned: 0 }, s.stats || {});
        if (!out.stats.earned) out.stats.earned = out.coins;   // старые сохранения: счёт начинается с текущих монет
        if (!Array.isArray(out.tools) || !out.tools.length) out.tools = ['hand'];
        if (!Array.isArray(out.needles)) out.needles = [];
        return out;
    },

    persist() {
        const s = this.save;
        if (!s) return;
        if (this.pile) s.pile = { level: s.level, seed: s.seed, data: this.pile.serialize() };
        if (this.player && this.state === 'play') s.pos = { x: Math.round(this.player.x), y: Math.round(this.player.y), yaw: +this.player.yaw.toFixed(3) };
        this.dirty = false;
        this.saveT = 0;
        try { Platform.save(s); } catch (e) { console.warn('Game: сохранение не записалось', e); }
    },

    markDirty() { this.dirty = true; },

    // =====================================================================================
    // Запуск
    // =====================================================================================

    async init(app) {
        this.app = app;
        this.save = await this.loadSave();
        this.coinsShown = this.save.coins;
        app.location.view.scene.clearColor = new BABYLON.Color4(0.96, 0.78, 0.6, 1);
        // камера: своя (от первого лица / облёт в меню) вместо орбитальной камеры движка
        const cc = app.camera;
        cc.update = () => this.applyCamera();
        if (typeof Nav !== 'undefined') {
            if (typeof GAME_COLLIDERS !== 'undefined') Nav.register(GAME_COLLIDERS);
            // земля Nav — та же, что видна (с ровными зонами карты), а не голый шум рельефа
            Nav.build(app.location, { ground: (x, y) => app.location.terrain.fieldHeight(x, y) });
        }
        HudLayout.init({ app });
        Input.init({
            app, mouse: 'lock',
            actions: {
                forward: Input.DEFAULTS.forward, back: Input.DEFAULTS.back, left: Input.DEFAULTS.left, right: Input.DEFAULTS.right,
                jump: { keys: ['Space'], pad: [0] }, sprint: Input.DEFAULTS.sprint, interact: Input.DEFAULTS.interact,
                grab: { keys: ['Mouse0'], pad: [7] }, boom: { keys: ['KeyQ'], pad: [3] },
                upgrades: { keys: ['KeyU'], pad: [8] }, collection: { keys: ['KeyB'] },
                pause: { keys: ['KeyP'], pad: [9], rebind: false },
            },
        });
        Input.configure({ controls: false });
        Input.on('unlock', () => { if (this.state === 'play' && !GameHud.panel) this.openPanel('pause'); });
        GameHud.init();
        await GameWorld.init(app);
        await this.buildPile();
        await GameWorld.buildStands(id => this.itemModel(id));
        GameWorld.findParts();
        await GameWorld.buildTrophies(this.save.needles);
        const sp = app.location.marker('spawn') || { x: this.pile.cx, y: this.pile.cy + 1200, rot: [0, -90, 0] };
        const at = this.save.pos && this.save.started ? this.save.pos : { x: sp.x, y: sp.y, yaw: ((sp.rot && sp.rot[1]) || -90) * Math.PI / 180 };
        this.player = new GamePlayer(app, at);
        this.player.pile = this.pile;
        this.player.feet = this.player.groundAt(this.player.x, this.player.y);
        this.player.sens = this.save.settings.sens;
        this.player.onStep = (hay) => this.sfx(hay ? 'stephay' : 'step', 0.35);
        this.player.onLand = () => this.sfx('land', 0.5);
        this.vm = new GameViewModel(app.location.view);
        await Promise.all(this.save.tools.map(id => this.vm.loadTool(this.toolDef(id))).concat([this.vm.loadClump(), this.vm.loadCompass()]));
        this.vm.setTool(this.save.tool);
        this.vm.setCompass(this.save.compass);
        this.vm.root.setEnabled(false);
        this.suction = new SuctionFX(app.location.view.scene, app.fx);
        await GameWorld.setMagpies(this.save.magpies, this);
        this._setupTutorial();
        this._setupFx();
        app.onFrame(dt => this.frame(dt));
        if (typeof Platform !== 'undefined' && Platform.onRewardedCooldown) Platform.onRewardedCooldown(() => GameHud.refreshAdButtons(this));
        window.addEventListener('pagehide', () => this.persist());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.persist(); });
        if (typeof Sound !== 'undefined') {
            Sound.loop('assets/sounds/ambience.ogg', { volume: 0.32 });
            // тик компаса: короткий мягкий «тинь» (синтез, без файла)
            const n = 2600, smp = new Float32Array(n);
            for (let i = 0; i < n; i++) { const t = i / 44100; smp[i] = Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-t * 90) * 0.6 + Math.sin(2 * Math.PI * 2640 * t) * Math.exp(-t * 140) * 0.25; }
            const buf = Sound.makeBuffer(smp, 44100);
            if (buf) Sound.putBuffer('tick', buf);
        }
        this.state = 'menu';
    },

    async ready() {
        GameHud.showMenu(this);
        GameHud.showHud(false);
        this.music();
    },

    // =====================================================================================
    // Стог и игла
    // =====================================================================================

    async buildPile() {
        const app = this.app, s = this.save;
        if (this.pile) { this.pile.dispose(); this.pile = null; }
        const mk = app.location.marker('pile') || { x: 3500, y: 3500 };
        const def = gameLevelDef(s.level);
        const q = typeof Quality !== 'undefined' ? Quality.level : 2;
        const pile = new GamePile(app.location.view, {
            cx: mk.x, cy: mk.y, ground: app.location.terrain.fieldHeight(mk.x, mk.y), R: def.R, H: def.H,
            seed: s.seed, specials: def.specials, needleDepth: def.depth, quality: q, treasures: def.treasures || 6,
        });
        if (s.pile && s.pile.level === s.level && s.pile.seed === s.seed) pile.deserialize(s.pile.data);
        this.pile = pile;
        if (this.player) this.player.pile = pile;
        await GameWorld.setNeedle(def, pile);
        await GameWorld.setTreasures(pile);
        this.exposed = 0;
    },

    needleName(level) {
        const def = gameLevelDef(level);
        if (level >= GAME_NEEDLES.length) return Lang.t('needle.mythicN', { n: level - GAME_NEEDLES.length + 2 });
        return Lang.t('needle.' + def.id);
    },

    // =====================================================================================
    // Данные предметов
    // =====================================================================================

    toolDef(id) { return GAME_TOOLS.find(t => t.id === id) || GAME_TOOLS[0]; },
    /** Инструмент в руках: на время пробного Сеноса — он, иначе свой из сохранения. */
    tool() { return this.toolDef(this.trial ? 'vacuum' : this.save.tool); },
    capacity() { return GAME_PACKS[Math.min(GAME_PACKS.length - 1, this.save.pack)].cap; },
    bagCount() { let n = 0; for (const id of GAME_STRAW_ORDER) n += this.save.bag[id] || 0; return n; },
    upg(id) { return GAME_UPG[id](this.save.upg[id] || 0); },
    has(what) { return what === 'compass' ? this.save.compass : what === 'firecracker' ? this.save.firecracker : what === 'magpie' ? this.save.magpies > 0 : false; },
    needName(what) { return Lang.t('gear.' + what); },

    itemModel(id) {
        const t = GAME_TOOLS.find(x => x.id === id); if (t) return t;
        const p = GAME_PACKS.find(x => x.id === id); if (p) return p;
        return GAME_GEAR[id] || null;
    },

    itemName(id) {
        if (GAME_TOOLS.find(x => x.id === id)) return Lang.t('tool.' + id);
        if (GAME_PACKS.find(x => x.id === id)) return Lang.t('pack.' + id);
        return Lang.t('gear.' + id);
    },

    /** Состояние товара: buy | equip | equipped | owned | max, цена и описание для карточки. */
    itemInfo(id) {
        const s = this.save, U = v => Math.round(v);
        const info = { id, name: this.itemName(id), desc: '', icon: '', stats: /** @type {string[]} */ ([]), cost: null, state: 'buy', canAfford: false, needText: '' };
        const tool = GAME_TOOLS.find(x => x.id === id), pack = GAME_PACKS.findIndex(x => x.id === id);
        if (tool) {
            info.icon = tool.icon; info.desc = Lang.t('tool.' + id + '.d');
            const k = this.upg('size');
            info.stats.push(Lang.t(tool.continuous ? 'card.stat.grabCont' : 'card.stat.grab', { a: U(tool.hay * k) }));
            info.stats.push(Lang.t('card.stat.radius', { a: U(tool.radius * k * 2) }));
            if (!tool.continuous) info.stats.push(Lang.t('card.stat.speed', { a: (tool.cd * this.upg('speed')).toFixed(2) }));
            info.stats.push(Lang.t('card.stat.reach', { a: (tool.reach / 100).toFixed(1) }));
            info.cost = { coins: tool.price };
            if (s.tools.includes(id)) info.state = s.tool === id ? 'equipped' : 'equip';
        } else if (pack >= 0) {
            const p = GAME_PACKS[pack];
            info.icon = p.icon; info.desc = Lang.t('pack.d');
            info.stats.push(Lang.t('card.stat.cap', { a: this.capacity(), b: p.cap }));
            info.cost = { coins: p.price };
            if (s.pack >= pack) info.state = 'owned';
        } else if (id === 'compass') {
            info.icon = GAME_GEAR.compass.icon; info.desc = Lang.t('gear.compass.d');
            info.cost = { coins: GAME_GEAR.compass.price };
            if (s.compass) info.state = 'owned';
        } else if (id === 'firecracker') {
            info.icon = GAME_GEAR.firecracker.icon; info.desc = Lang.t('gear.firecracker.d', { key: Input.labelOf('boom') || 'Q' });
            info.cost = { coins: GAME_GEAR.firecracker.price };
            if (s.firecracker) info.state = 'owned';
        } else if (id === 'magpie') {
            info.icon = GAME_GEAR.magpie.icon; info.desc = Lang.t('gear.magpie.d');
            const n = s.magpies;
            info.stats.push(Lang.t('card.stat.magpies', { a: n, b: Math.min(GAME_MAGPIE_COSTS.length, n + 1) }));
            if (n >= GAME_MAGPIE_COSTS.length) info.state = 'owned';
            else info.cost = GAME_MAGPIE_COSTS[n];
        }
        if (info.state === 'buy' && info.cost) {
            const have = info.cost.gems ? s.gems : s.coins, need = info.cost.gems || info.cost.coins || 0;
            info.canAfford = have >= need;
            info.needText = Lang.t('card.need', { n: GameHud.fmt(need - have) + ' ' + Lang.t(info.cost.gems ? 'currency.gems' : 'currency.coins') });
            if (!info.canAfford && this.adsOn()) info.ad = this.adState(id, this.adViewsFor(info.cost));
        }
        return info;
    },

    labelFor(st) {
        if (st.kind === 'press') return { title: Lang.t('label.press'), sub: '' };
        if (st.kind !== 'stand') return { title: Lang.t('label.' + st.kind), sub: '' };
        const info = this.itemInfo(st.id);
        if (info.state === 'buy' && info.cost) return { title: info.name, price: GameHud.fmt(info.cost.gems || info.cost.coins), icon: info.cost.gems ? UI_ICONS.gem : UI_ICONS.coin, cant: !info.canAfford };
        return { title: info.name, sub: Lang.t(info.state === 'equipped' ? 'label.equipped' : 'label.owned') };
    },

    // =====================================================================================
    // Действия интерфейса
    // =====================================================================================

    /**
     * Кнопки меню и окон вне игрового процесса (меню, пауза, настройки, коллекция, рекорды, «Следующий стог»):
     * в сборке Playables перед действием — межстраничная реклама (MENU_INTERSTITIAL; частоту показа решает YouTube).
     * Покупки, улучшения, вкладки, подарок и кнопки HUD во время игры рекламу не вызывают.
     */
    _menuAdAct(act, arg) {
        if (typeof MENU_INTERSTITIAL !== 'undefined' && !MENU_INTERSTITIAL) return false;
        if (Platform.name !== 'playables' || !Platform.interstitialSupported()) return false;
        if (/^(play|howto|resume|tomenu|next|music|sounds|quality|reset|leaders|login)$/.test(act)) return true;
        if (act === 'open') return true;
        if (act === 'close') return /^(settings|collection|pause|leaders)$/.test(GameHud.panel);
        return false;
    },

    async uiAction(act, arg) {
        this.sfx('click', 0.6);
        if (this._menuAdAct(act, arg)) {
            if (this._menuAdBusy) return;
            this._menuAdBusy = true;
            try { await Promise.race([Platform.interstitial(), new Promise(r => setTimeout(r, 8000))]); } catch (e) { /* без рекламы — дальше */ }
            this._menuAdBusy = false;
        }
        switch (act) {
            case 'play': this.startPlay(); break;
            case 'close': this.closePanel(); break;
            case 'resume': this.closePanel(); break;
            case 'open': this.openPanel(arg); break;
            case 'tab': GameHud.tab = arg; GameHud.showUpgrades(this); break;
            case 'buy': this.buy(arg); break;
            case 'equip': this.equip(arg); break;
            case 'upgrade': this.upgrade(arg); break;
            case 'adbuy': this.adBuy(arg); break;
            case 'adupg': this.adUpgrade(arg); break;
            case 'trial': this.startTrial(); break;
            case 'trial-no': this.declineTrial(); break;
            case 'next':
                // Яндекс и Playgama: межстраничная по правилу двух раундов (на Playables — реклама кнопок меню выше)
                if (Platform.name === 'playables') this.nextLevel(); else Platform.ads.next(() => this.nextLevel());
                break;
            case 'leaders': this.openPanel('leaders'); break;
            case 'login': this.login(); break;
            case 'music': this.save.settings.music = !this.save.settings.music; this.music(); this.persist(); GameHud.showSettings(this); break;
            case 'sounds': Sound.setMuted(!Sound.muted); GameHud.showSettings(this); break;
            case 'quality': if (typeof Quality !== 'undefined') Quality.set(arg); GameHud.showSettings(this); break;
            case 'howto': this.howTo(); break;
            case 'tomenu': this.toMenu(); break;
            case 'reset': GameHud.confirm(Lang.t('set.resetConfirm'), 'reset-ok'); break;
            case 'reset-ok': this.resetAll(); break;
        }
    },

    openPanel(name) {
        if (this.state === 'found') return;
        const wasOpen = !!GameHud.panel;
        GameHud.panel = name;   // раньше release: событие unlock не откроет паузу поверх
        if (!wasOpen) {
            Pause.set('manual', true);
            Input.release();
            Input.configure({ controls: false });
        }
        if (name === 'upgrades') GameHud.showUpgrades(this);
        else if (name === 'collection') GameHud.showCollection(this);
        else if (name === 'settings') GameHud.showSettings(this);
        else if (name === 'pause') GameHud.showPause(this);
        else if (name === 'leaders') this.showLeaders();
        else if (name === 'card') { /* showCard — из interact */ }
        this.sfx('open', 0.5);
    },

    closePanel() {
        if (GameHud.panel === 'found') return;
        if (GameHud.panel === 'trial' && !this.trial && !this.save.vacTrial) return;
        GameHud.closeModal();
        Pause.set('manual', false);
        if (this.state === 'play') {
            Input.configure({ controls: true });
            Input.capture();
        }
    },

    howTo() {
        if (GameHud.panel) { GameHud.closeModal(); Pause.set('manual', false); }
        if (this.state !== 'play') this.startPlay(true);
        else { Input.configure({ controls: true }); Input.capture(); }
        Tutorial.start({ replay: true });
    },

    startPlay(noTutorial) {
        GameHud.hideMenu();
        GameHud.showHud(true);
        this.state = 'play';
        this.save.started = true;
        this.vm.root.setEnabled(true);
        Input.configure({ controls: true });
        Input.capture();
        Platform.gameplay(true);
        this.music();
        if (!noTutorial) Tutorial.autoStart();
        this._refreshContext();
        try { Telemetry.progress('started', 'needle_' + gameLevelDef(this.save.level).id, { step_index: this.save.level + 1 }); } catch (err) { /* нет телеметрии */ }
    },

    toMenu() {
        GameHud.closeModal();
        Pause.set('manual', false);
        this.persist();
        this.state = 'menu';
        this.submitScore();
        Input.release();
        Input.configure({ controls: false });
        Input.clearContext();
        Platform.gameplay(false);
        this.vm.root.setEnabled(false);
        GameHud.showHud(false);
        GameHud.showMenu(this);
        this.music();
    },

    music() {
        if (!this.save.settings.music) { Sound.stopMusic(); return; }
        Sound.music(this.state === 'play' || this.state === 'found' ? 'assets/sounds/music-farm.ogg' : 'assets/sounds/music-menu.ogg', { volume: 0.55 });
    },

    setSens(v) { this.save.settings.sens = v; if (this.player) this.player.sens = v; this.markDirty(); },

    async resetAll() {
        GameHud.closeModal();
        Pause.set('manual', false);
        if (this.trial) this.endTrial();
        const music = this.save.settings.music, sens = this.save.settings.sens;
        this.save = this.defaultSave();
        this.save.settings.music = music; this.save.settings.sens = sens;
        this.coinsShown = 0;
        this.persist();
        Tutorial.onLoad();
        await this.buildPile();
        await GameWorld.buildTrophies(this.save.needles);
        this._respawn();
        this.vm.setTool('hand');
        this.vm.setCompass(false);
        this.toMenu();
    },

    _respawn() {
        const sp = this.app.location.marker('spawn');
        if (sp && this.player) {
            this.player.x = sp.x; this.player.y = sp.y;
            this.player.yaw = ((sp.rot && sp.rot[1]) || -90) * Math.PI / 180; this.player.pitch = -0.12;
            this.player.feet = this.player.groundAt(sp.x, sp.y); this.player.vy = 0;
        }
    },

    // =====================================================================================
    // Рекорды: счёт — монеты, заработанные за всё время (растёт только вверх: лучший = текущий)
    // =====================================================================================

    earn(n) {
        const s = this.save;
        s.coins += n;
        s.stats.earned = (s.stats.earned || 0) + n;
    },

    submitScore() {
        try { Platform.submitScore(Math.floor(this.save.stats.earned || 0)); } catch (e) { /* нет площадки */ }
    },

    async showLeaders() {
        GameHud.showLeaders(this, null, true);
        let rows = null;
        try { rows = await Platform.leaderboard({ avatarSize: 'medium' }); } catch (e) { rows = null; }
        if (GameHud.panel === 'leaders') GameHud.showLeaders(this, rows || [], false);
    },

    async login() {
        let ok = false;
        try { ok = await Platform.login(); } catch (e) { ok = false; }
        if (ok) { this.submitScore(); if (GameHud.panel === 'leaders') this.showLeaders(); }
    },

    /** Кнопка «Рекорды» — только там, где площадка отдаёт таблицу: Яндекс; Playgama — когда Bridge в режиме in_game. */
    hasLeaders() {
        if (Platform.name === 'yandex') return true;
        if (Platform.name !== 'playgama') return false;
        try { const b = /** @type {any} */ (window).bridge; return !!(b && b.leaderboards && b.leaderboards.type === 'in_game'); } catch (e) { return false; }
    },

    // =====================================================================================
    // Магазин
    // =====================================================================================

    async buy(id) {
        const info = this.itemInfo(id), s = this.save;
        if (info.state !== 'buy' || !info.cost) return;
        if (!info.canAfford) { this.sfx('error'); GameHud.showCard(this.itemInfo(id)); return; }
        if (info.cost.gems) s.gems -= info.cost.gems; else { s.coins -= info.cost.coins; this.coinsShown = s.coins; }
        delete s.adProg[id];
        await this.grant(id, info);
    },

    /** Выдать предмет: куплен за валюту или открыт за рекламу. */
    async grant(id, info) {
        const s = this.save;
        const tool = GAME_TOOLS.find(x => x.id === id), pack = GAME_PACKS.findIndex(x => x.id === id);
        if (tool) {
            s.tools.push(id); s.tool = id;
            await this.vm.loadTool(tool);
            this.vm.setTool(id);
        } else if (pack >= 0) s.pack = Math.max(s.pack, pack);
        else if (id === 'compass') { s.compass = true; this.vm.setCompass(true); Tutorial.complete('compass'); }
        else if (id === 'firecracker') { s.firecracker = true; this.boomCd = 0; }
        else if (id === 'magpie') { s.magpies++; await GameWorld.setMagpies(s.magpies, this); }
        this.sfx('buy');
        this.sfx('stinger-levelup', 0.7);
        GameHud.toast(Lang.t('toast.bought', { name: info.name }), 'good', info.icon);
        this.persist();
        GameHud.showCard(this.itemInfo(id));
    },

    equip(id) {
        if (!this.save.tools.includes(id)) return;
        this.save.tool = id;
        this.vm.setTool(id);
        this.sfx('click');
        GameHud.toast(Lang.t('toast.equipped', { name: this.itemName(id) }), 'good', this.toolDef(id).icon);
        this.persist();
        GameHud.showCard(this.itemInfo(id));
    },

    upgrade(id) {
        const u = GAME_UPGRADES.find(x => x.id === id), s = this.save;
        if (!u) return;
        const lvl = s.upg[id] || 0;
        if (lvl >= u.max || (u.needs && !this.has(u.needs))) return;
        const cost = gameUpgradeCost(u, lvl);
        if (s.coins < cost) { this.sfx('error'); return; }
        s.coins -= cost; this.coinsShown = s.coins;
        s.upg[id] = lvl + 1;
        this.sfx('stinger-levelup', 0.8);
        GameHud.toast(Lang.t('toast.upgraded', { name: Lang.t('upg.' + id), n: lvl + 1 }), 'good', u.icon);
        this.persist();
        GameHud.showUpgrades(this);
    },

    // =====================================================================================
    // За рекламу: не хватает денег — купить или прокачать просмотром rewarded
    // =====================================================================================

    adsOn() { return typeof Platform !== 'undefined' && Platform.rewardedSupported(); },

    /** Просмотров на предмет: дороже — больше (1…5). */
    adViewsFor(cost) {
        if (cost.gems) return cost.gems <= 10 ? 2 : cost.gems <= 25 ? 3 : 4;
        const c = cost.coins || 0;
        return c < 120 ? 1 : c < 600 ? 2 : c < 2000 ? 3 : c < 6000 ? 4 : 5;
    },

    /** Состояние кнопки «За рекламу»: { have, need, wait, label, enabled }. */
    adState(key, need) {
        const have = Math.min(need, this.save.adProg[key] || 0);
        const wait = Platform.rewardedCooldownLeft();
        const label = wait > 0 ? Platform.rewardedCooldownLabel() : need > 1 ? Lang.t('ad.progress', { a: have, b: need }) : Lang.t('ad.btn');
        return { have, need, wait, label, enabled: wait <= 0 && !this._adBusy };
    },

    async _watch(kind) {
        if (this._adBusy || Platform.rewardedCooldownLeft() > 0) return false;
        this._adBusy = true;
        let ok = false;
        try { ok = await Platform.rewarded(kind); } catch (e) { ok = false; }
        this._adBusy = false;
        if (!ok) GameHud.toast(Lang.t('ad.fail'), 'bad');
        return ok;
    },

    async adBuy(id) {
        const info = this.itemInfo(id);
        if (info.state !== 'buy' || !info.cost || !info.ad) return;
        if (await this._watch('shop-unlock')) {
            const s = this.save, need = this.adViewsFor(info.cost);
            s.adProg[id] = (s.adProg[id] || 0) + 1;
            if (s.adProg[id] >= need) { delete s.adProg[id]; await this.grant(id, info); return; }
            this.persist();
        }
        if (GameHud.panel === 'card') GameHud.showCard(this.itemInfo(id));
    },

    async adUpgrade(id) {
        const u = GAME_UPGRADES.find(x => x.id === id), s = this.save;
        if (!u) return;
        const lvl = s.upg[id] || 0;
        if (lvl >= u.max || (u.needs && !this.has(u.needs))) return;
        if (await this._watch('upgrade')) {
            s.upg[id] = lvl + 1;
            this.sfx('stinger-levelup', 0.8);
            GameHud.toast(Lang.t('toast.upgraded', { name: Lang.t('upg.' + id), n: lvl + 1 }), 'good', u.icon);
            this.persist();
        }
        if (GameHud.panel === 'upgrades') GameHud.showUpgrades(this);
    },

    upgEffectText(id, lvl) {
        const f = GAME_UPG[id], a = f(lvl), b = f(lvl + 1);
        const u = GAME_UPGRADES.find(x => x.id === id);
        const fmt = v => {
            if (id === 'size' || id === 'value' || id === 'luck') return '×' + v.toFixed(2);
            if (id === 'speed' || id === 'wings') return '×' + v.toFixed(2);
            if (id === 'aim') return '±' + Math.round(v) + '°';
            if (id === 'glint') return Lang.t('unit.m', { n: (v / 100).toFixed(2) });
            if (id === 'blast') return Lang.t('unit.m', { n: (v * 2 / 100).toFixed(1) });
            if (id === 'fuse') return Lang.t('unit.s', { n: Math.round(v) });
            return String(Math.round(v));
        };
        return lvl >= u.max ? fmt(a) : fmt(a) + ' → ' + fmt(b);
    },

    // =====================================================================================
    // Кадр
    // =====================================================================================

    applyCamera() {
        const cam = this.app.location.view.camera, pile = this.pile;
        if (this.state === 'menu' || this.state === 'boot' || !this.player) {
            const cx = pile ? pile.cx : 3500, cy = pile ? pile.cy : 3500, R = pile ? pile.R : 600;
            const a = this.menuA, D = R * 2.6 + 400;
            cam.position.set(cx + Math.cos(a) * D, (pile ? pile.G : 0) + R * 0.75 + 160, cy + Math.sin(a) * D);
            cam.setTarget(new BABYLON.Vector3(cx, (pile ? pile.G : 0) + (pile ? pile.Htop * 0.55 : 200), cy));
            cam.fov = 0.95;
            cam.minZ = 4; cam.maxZ = 26000;
            this.app.location.view.fitShadowFrustum(cx, cy, pile ? pile.G : 0, 1400);
            return;
        }
        this.player.applyCamera();
    },

    frame(dt) {
        this.time += dt;
        // монеты на бирке догоняют настоящие
        const s = this.save;
        if (s) this.coinsShown += (s.coins - this.coinsShown) * Math.min(1, dt * 8);
        if (s && Math.abs(s.coins - this.coinsShown) < 0.5) this.coinsShown = s.coins;
        if (Pause.active && this.state === 'menu') this.menuA += 0;
        GameHud.update(dt, this);
    },

    update(dt) {
        if (!this.pile) return;
        if (this.state === 'menu' || this.state === 'boot') {
            this.menuA += dt * 0.06;
            this.pile.update(dt);
            GameWorld.update(dt, this);
            return;
        }
        const p = this.player;
        const blocked = !!GameHud.panel;
        const look = blocked ? { dx: 0, dy: 0 } : Input.consumeLook();
        const mv = blocked || this.state !== 'play' ? { x: 0, y: 0 } : Input.move();
        p.frozen = this.state !== 'play';
        p.update(dt, look, mv, { jump: !blocked && Input.pressed('jump'), sprint: Input.down('sprint') });
        this.cd = Math.max(0, this.cd - dt);
        this.boomCd = Math.max(0, this.boomCd - dt);
        if (this.state === 'play' && !blocked) {
            this._aim();
            this._refreshContext();
            const tool = this.tool();
            if (tool.continuous) this._vacuum(dt, Input.down('grab'));
            else if (Input.down('grab') && this.cd <= 0) this.doGrab();
            if (Input.pressed('interact') && this.target) this.interact(this.target);
            if (Input.pressed('boom')) this.throwBoom();
            if (Input.pressed('upgrades')) this.openPanel('upgrades');
            if (Input.pressed('collection')) this.openPanel('collection');
            if (Input.pressed('pause')) this.openPanel('pause');
            this._sellZone();
        } else if (this.vacLoop) this._vacuum(dt, false);
        this._needle(dt);
        this._compass(dt);
        this._sparkles(dt);
        this.vm.update(dt, look, p.speedNow, p.bob, this._compassAngle || 0, this.compassPulse);
        if (this.suction) {
            const h = this.aimHit, on = this.vm.vacuumOn && this.state === 'play' && !blocked;
            this.suction.update(dt, on, on ? this.vm.nozzleWorld() : null, on && h ? new BABYLON.Vector3(h.x, h.y + 4, h.z) : null);
        }
        this.pile.update(dt);
        GameWorld.update(dt, this);
        this._trialTick(dt, blocked);
        this.saveT += dt;
        if (this.dirty && this.saveT > 8) this.persist();
    },

    // =====================================================================================
    // Подарок новичку: один раз за всю игру, через VAC_TRIAL_AT_SEC секунд игры — Сеносос на VAC_TRIAL_SEC секунд
    // бесплатно (не за рекламу и не за монеты)
    // =====================================================================================

    _trialTick(dt, blocked) {
        const s = this.save;
        if (this.state === 'play' && !blocked) s.stats.play = (s.stats.play || 0) + dt;
        if (this.trial) {
            if (this.state === 'play' && !blocked) this.trial.left -= dt;
            if (this.trial.left <= 0) this.endTrial();
            return;
        }
        const at = typeof VAC_TRIAL_AT_SEC !== 'undefined' ? VAC_TRIAL_AT_SEC : 300;
        if (!s.vacTrial && s.stats.play >= at && this.state === 'play' && !blocked && !Tutorial.active
            && !s.tools.includes('vacuum') && this.vm.anim < 0) this.offerTrial();
    },

    offerTrial() {
        this.openPanel('trial');
        GameHud.showTrial(this);
        this.sfx('stinger-newstraw', 0.8);
    },

    async startTrial() {
        const s = this.save;
        s.vacTrial = true;
        this.persist();
        await this.vm.loadTool(this.toolDef('vacuum'));
        this.trial = { left: typeof VAC_TRIAL_SEC !== 'undefined' ? VAC_TRIAL_SEC : 20, total: typeof VAC_TRIAL_SEC !== 'undefined' ? VAC_TRIAL_SEC : 20 };
        this.vm.setTool('vacuum');
        this.closePanel();
        this.sfx('stinger-levelup', 0.9);
        GameHud.toast(Lang.t('trial.started'), 'big', this.toolDef('vacuum').icon);
    },

    declineTrial() {
        this.save.vacTrial = true;
        this.persist();
        this.closePanel();
    },

    endTrial() {
        this.trial = null;
        this._vacuum(0, false);
        this.vm.setTool(this.save.tool);
        GameHud.toast(Lang.t('trial.over', { price: GameHud.fmt(this.toolDef('vacuum').price) }), 'gold', this.toolDef('vacuum').icon);
    },

    // =====================================================================================
    // Прицел и захват
    // =====================================================================================

    _aim() {
        const p = this.player, tool = this.tool();
        const e = p.eye, d = p.dir();
        const reach = tool.reach + (tool.continuous ? 0 : 0);
        const hit = this.pile.raycast({ x: e.x, y: e.y, z: e.z }, { x: d.x, y: d.y, z: d.z }, reach);
        this.aimHit = hit;
        const t = GameWorld.pickTarget(p.x, p.y, e.y, d, 300);
        this.target = t && (!hit || Math.hypot(t.x - p.x, t.y - p.y) < hit.t + 40) ? t : null;
        this.aim = this.target ? 'use' : hit ? 'hay' : '';
    },

    _refreshContext() {
        if (this.state !== 'play') { Input.clearContext(); return; }
        Input.setContext({ id: 'grab', label: Lang.t('hud.grab'), icon: UI_ICONS.grab, action: 'grab' }, 1);
        if (this.target) {
            const t = this.target;
            const label = t.kind === 'stand' ? this.targetVerb(t) : t.kind === 'magpie-house' ? Lang.t('act.adopt') : Lang.t('act.open');
            if (this._ctxUse !== t.id + label) { Input.setContext({ id: 'use', label, icon: UI_ICONS.upgrade, action: 'interact' }, 2); this._ctxUse = t.id + label; }
        } else if (this._ctxUse) { Input.clearContext('use'); this._ctxUse = ''; }
    },

    targetVerb(t) {
        const info = this.itemInfo(t.id);
        return info.state === 'buy' ? Lang.t('act.buy') : info.state === 'equip' ? Lang.t('act.equip') : Lang.t('act.view');
    },

    interactHint() {
        if (this.state !== 'play' || GameHud.panel || Input.device === 'touch') return '';
        const t = this.target;
        if (!t) return '';
        const key = Input.labelOf('interact') || 'E';
        let what;
        if (t.kind === 'stand') {
            const info = this.itemInfo(t.id);
            what = this.targetVerb(t) + ': ' + info.name + (info.state === 'buy' && info.cost ? ' — ' + GameHud.fmt(info.cost.gems || info.cost.coins) : '');
        } else what = Lang.t('label.' + t.kind);
        return Lang.t('hint.interact', { key, what });
    },

    interact(t) {
        if (t.kind === 'stand') { this.openPanel('card'); GameHud.showCard(this.itemInfo(t.id)); }
        else if (t.kind === 'board') this.openPanel('upgrades');
        else if (t.kind === 'trophy') this.openPanel('collection');
        else if (t.kind === 'magpie-house') { this.openPanel('card'); GameHud.showCard(this.itemInfo('magpie')); }
    },

    /** Сколько улучшений доски можно купить прямо сейчас (значок на кнопке). */
    affordableUpgrades() {
        const s = this.save;
        let n = 0;
        for (const u of GAME_UPGRADES) {
            const lvl = s.upg[u.id] || 0;
            if (lvl < u.max && (!u.needs || this.has(u.needs)) && s.coins >= gameUpgradeCost(u, lvl)) n++;
        }
        return n;
    },

    cooldownFrac() { return this.cdMax > 0 ? Math.max(0, Math.min(1, this.cd / this.cdMax)) : 0; },
    boomFrac() { const m = this.upg('fuse'); return m > 0 ? 1 - Math.max(0, Math.min(1, this.boomCd / m)) : 1; },

    _toastOnce(key, text, kind, gap) {
        const t = this.toastT[key] || -99;
        if (this.time - t < (gap || 1.6)) return;
        this.toastT[key] = this.time;
        GameHud.toast(text, kind);
    },

    /** Точка у правой руки (для летящих в рюкзак соломинок). */
    _handPoint() {
        const p = this.player, e = p.eye, d = p.dir();
        const rx = -Math.sin(p.yaw), rz = Math.cos(p.yaw);
        return { x: e.x + d.x * 30 + rx * 18, y: e.y - 30, z: e.z + d.z * 30 + rz * 18 };
    },

    doGrab() {
        const tool = this.tool(), s = this.save;
        const cap = this.capacity(), have = this.bagCount();
        this.cdMax = tool.cd * this.upg('speed');
        const hit = this.aimHit;
        if (!hit) { this.cd = 0.25; this.cdMax = 0.25; this._toastOnce('far', Lang.t('toast.far'), '', 2.5); return; }
        if (have >= cap) {
            this.cd = 0.4; this.cdMax = 0.4;
            this._toastOnce('full', Lang.t('toast.full'), 'bad', 2.2);
            this.sfx('full', 0.7);
            return;
        }
        const k = this.upg('size');
        const res = this.pile.dig(hit.x, hit.y, hit.z, tool.radius * k, tool.depth * Math.sqrt(k), { needle: true });
        this.cd = this.cdMax;
        this.vm.grab(Math.min(0.42, this.cdMax * 0.85));
        if (res.needle) { this.foundNeedle(); return; }
        this._gainTreasures(res.treasures);
        if (res.volume < 400 && !res.specials.length && !res.treasures.length) { this._toastOnce('dirt', Lang.t('toast.dirt'), '', 2); return; }
        const gain = Math.max(1, Math.min(cap - have, Math.round(tool.hay * k)));
        s.bag.common += gain;
        s.stats.grabs++;
        if (!s.found.common) { GameHud.toast(Lang.t('toast.new', { name: Lang.t('straw.common') }), 'big', GAME_STRAWS.common.icon); this.sfx('stinger-newstraw', 0.6); }
        s.found.common = (s.found.common || 0) + gain;
        this._gainSpecials(res.specials, false);
        this._luckRoll(gain);
        this.pile.burst(hit.x, hit.y, hit.z, Math.min(14, 4 + gain), this._handPoint(), 0.6);
        this.sfx('grab', 0.75);
        GameHud.pop('+' + gain, UI_ICONS.hay);
        this.tutGrabs++;
        this.markDirty();
    },

    _vacuum(dt, on) {
        const tool = this.tool(), s = this.save;
        if (!on || tool.id !== 'vacuum') {
            if (this.vacLoop) { this.vacLoop.fade(0.25); this.vacLoop = null; }
            this.vm.vacuumOn = false;
            return;
        }
        this.vm.vacuumOn = true;
        if (!this.vacLoop) this.vacLoop = Sound.loop('assets/sounds/vacuum-loop.ogg', { volume: 0.45 });
        const hit = this.aimHit, cap = this.capacity();
        this.cdMax = 1; this.cd = 0;
        if (!hit) return;
        // пробный Сеносос — «бездонная колба»: сено сразу в монеты, рюкзак не мешает
        if (this.bagCount() >= cap && !this.trial) { this._toastOnce('full', Lang.t('toast.full'), 'bad', 2.2); return; }
        const k = this.upg('size');
        this.vacAcc += tool.hay * k * dt;
        this.vacDig -= dt;
        if (this.vacDig <= 0) {
            this.vacDig = 0.1;
            const res = this.pile.dig(hit.x, hit.y, hit.z, tool.radius * k, tool.depth, { needle: true });
            if (res.needle) { this.foundNeedle(); return; }
            this._gainSpecials(res.specials, false);
            this._gainTreasures(res.treasures);
            const nz = this.vm.nozzleWorld();
            this.pile.burst(hit.x, hit.y, hit.z, 6, nz ? { x: nz.x, y: nz.y, z: nz.z } : this._handPoint(), 0.5);
            this.player.shake(0.7, 0.12);
        }
        if (this.trial) {
            const n = Math.floor(this.vacAcc);
            if (n > 0) {
                this.vacAcc -= n;
                const coins = Math.max(1, Math.round(n * this.upg('value')));
                this.earn(coins);
                this._trialPop = (this._trialPop || 0) + coins;
                if (this.time - (this._trialPopT || 0) > 0.35) { GameHud.pop('+' + this._trialPop, UI_ICONS.coin, '#ffe48a'); this._trialPop = 0; this._trialPopT = this.time; }
                this._luckRoll(n);
                this.markDirty();
            }
            return;
        }
        const gain = Math.min(cap - this.bagCount(), Math.floor(this.vacAcc));
        if (gain > 0) {
            this.vacAcc -= gain;
            s.bag.common += gain;
            this._luckRoll(gain);
            this.tutGrabs++;
            this.markDirty();
        }
    },

    _luckRoll(n) {
        const luck = this.upg('luck'), got = [];
        for (const id of GAME_STRAW_ORDER) {
            const d = GAME_STRAWS[id];
            if (!d.chance) continue;
            const p = 1 - Math.pow(1 - d.chance * luck, n);
            if (Math.random() < p) got.push(id);
        }
        if (got.length) this._gainSpecials(got, false);
    },

    /** Особые соломинки: в рюкзак (direct=false) или сразу в валюту (хлопушка, сороки). */
    _gainSpecials(list, direct) {
        const s = this.save;
        for (const id of list) {
            const d = GAME_STRAWS[id];
            if (!d) continue;
            const isNew = !s.found[id];
            s.found[id] = (s.found[id] || 0) + 1;
            if (direct) {
                this.earn(Math.round(d.value * this.upg('value')));
                if (d.gems) { s.gems += d.gems; s.gemsSeen = true; }
            } else s.bag[id] = (s.bag[id] || 0) + 1;
            if (isNew) {
                GameHud.toast(Lang.t('toast.new', { name: Lang.t('straw.' + id) }), 'big', d.icon);
                this.sfx('stinger-newstraw', 0.8);
                GameHud.flash(d.color);
            } else {
                GameHud.pop('+1', d.icon, d.color);
                this.sfx('sparkle', 0.5);
            }
        }
        if (list.length) this.markDirty();
    },

    /** Сокровища из ковша: награда сразу (монеты, самоцветы), учёт в коллекции, вылет к игроку. */
    _gainTreasures(list) {
        if (!list || !list.length) return;
        const s = this.save;
        for (const k of list) {
            const t = this.pile.treasures[k];
            if (!t) continue;
            const d = GAME_TREASURES[t.type], rw = gameTreasureReward(t.type, s.level);
            const isNew = !s.treasures[t.type];
            s.treasures[t.type] = (s.treasures[t.type] || 0) + 1;
            this.earn(rw.coins);
            if (rw.gems) { s.gems += rw.gems; s.gemsSeen = true; }
            GameHud.toast(Lang.t(isNew ? 'toast.treasureNew' : 'toast.treasure', { name: Lang.t('treasure.' + t.type), n: GameHud.fmt(rw.coins) }), 'big', d.icon);
            if (rw.gems) GameHud.pop('+' + rw.gems, UI_ICONS.gem, '#7fe7ff');
            this.sfx(isNew ? 'stinger-newstraw' : 'sparkle', 0.8);
            this.sfx('coin', 0.6);
            if (isNew) GameHud.flash('#fff0b8');
            const e = this.player.eye, dir = this.player.dir();
            GameWorld.collectTreasure(k, { x: e.x + dir.x * 60, y: e.y - 20, z: e.z + dir.z * 60 });
        }
        this.markDirty();
    },

    // =====================================================================================
    // Продажа
    // =====================================================================================

    _sellZone() {
        const m = this.app.location.marker('press');
        if (!m) return;
        const r = ((m.scale && m.scale[0]) || 2.6) * 100;
        const p = this.player;
        const inside = Math.hypot(p.x - m.x, p.y - m.y) < r;
        if (inside && !this._inPress && this.bagCount() > 0) this.sell();
        this._inPress = inside;
    },

    sell() {
        const s = this.save, mult = this.upg('value');
        let coins = 0, gems = 0, n = 0;
        for (const id of GAME_STRAW_ORDER) {
            const c = s.bag[id] || 0;
            if (!c) continue;
            coins += c * GAME_STRAWS[id].value;
            gems += c * GAME_STRAWS[id].gems;
            n += c;
            s.bag[id] = 0;
        }
        if (!n) return;
        coins = Math.round(coins * mult);
        this.earn(coins); s.gems += gems;
        if (gems) s.gemsSeen = true;
        s.stats.sold += n;
        GameWorld.sellBoost();
        this.sfx('sell');
        this.sfx('coin', 0.7);
        GameHud.toast(Lang.t('toast.sold', { n: GameHud.fmt(coins) }), 'gold', UI_ICONS.coin);
        if (gems) GameHud.pop('+' + gems, UI_ICONS.gem, '#7fe7ff');
        // сено летит в воронку пресса
        const m = this.app.location.marker('press'), e = this.player.eye;
        if (m) this.pile.burst(e.x, e.y - 40, e.z, Math.min(30, 6 + n / 3), { x: m.x, y: this.app.location.terrain.fieldHeight(m.x, m.y) + 250, z: m.y }, 0.6);
        Tutorial.complete('sell');
        this.submitScore();
        this.persist();
    },

    // =====================================================================================
    // Игла, компас, блеск
    // =====================================================================================

    _needle(dt) {
        const pile = this.pile, nd = pile.needle;
        if (!nd) return;
        const depth = pile.needleDepth();
        const ex = Math.max(0, Math.min(1, (10 - depth) / 18));
        this.exposed += (ex - this.exposed) * Math.min(1, dt * 4);
        GameWorld.updateNeedle(dt, this.exposed, pile);
        if (this.state !== 'play' || nd.found) return;
        const p = this.player, dist = Math.hypot(nd.x - p.x, nd.z - p.y);
        // открытую иглу можно взять, просто наведя прицел (луч рядом с иглой)
        if (this.exposed > 0.5 && this.aimHit !== undefined) {
            const e = p.eye, d = p.dir();
            const vx = nd.x - e.x, vy = pile.G + nd.y - e.y, vz = nd.z - e.z;
            const t = vx * d.x + vy * d.y + vz * d.z;
            if (t > 0 && t < this.tool().reach + 60) {
                const cx = e.x + d.x * t - nd.x, cy = e.y + d.y * t - (pile.G + nd.y), cz = e.z + d.z * t - nd.z;
                this._aimNeedle = Math.hypot(cx, cy, cz) < 45;
                if (this._aimNeedle && Input.down('grab')) { this.foundNeedle(); return; }
            } else this._aimNeedle = false;
        }
        // блеск сквозь сено
        const glint = this.upg('glint');
        if (depth < glint && dist < 1500) {
            this.glintT -= dt;
            if (this.glintT <= 0) {
                this.glintT = 1.1 + Math.max(0, depth) / 45;
                const h = pile.hAt(nd.x, nd.z);
                const pos = new BABYLON.Vector3(nd.x + (Math.random() - 0.5) * 16, pile.G + h + 6, nd.z + (Math.random() - 0.5) * 16);
                if (this.app.fx) this.app.fx.play('needle-glint', pos);
                if (dist < 1000) this.sfx('glint', 0.6 * (1 - dist / 1000) + 0.15);
                if (this.time - this.lastGlint > 10 && depth > 6) GameHud.toast(Lang.t('toast.glint'), 'gold', UI_ICONS.star);
                this.lastGlint = this.time;
            }
        }
    },

    _compass(dt) {
        const nd = this.pile.needle;
        if (!nd || !this.save.compass || !this.player) { this.compassPulse = 0; return; }
        const p = this.player;
        const bearing = Math.atan2(nd.z - p.y, nd.x - p.x);
        let rel = bearing - p.yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        const wob = this.upg('aim') * Math.PI / 180;
        const noise = Math.sin(this.time * 1.7) * 0.6 + Math.sin(this.time * 4.3 + 1) * 0.4;
        const flat = Math.hypot(nd.x - p.x, nd.z - p.y);
        if (flat < 70) { this._spin = (this._spin || 0) + dt * 7; this._compassAngle = this._spin; }   // прямо над иглой — стрелка кружится
        else { this._compassAngle = -rel + noise * wob * 0.5; this._spin = this._compassAngle; }
        const e = p.eye, d3 = Math.hypot(nd.x - e.x, this.pile.G + nd.y - e.y, nd.z - e.z);
        const f = 0.6 + 7 * Math.max(0, 1 - d3 / 1600);
        const before = Math.floor(this.compassPhase / (Math.PI * 2));
        this.compassPhase += dt * f * Math.PI * 2;
        if (Math.floor(this.compassPhase / (Math.PI * 2)) !== before && d3 < 1300 && this.state === 'play' && !GameHud.panel) Sound.play('synth:tick', { volume: 0.08 + 0.3 * (1 - d3 / 1300) });
        this.compassPulse = Math.pow(0.5 + 0.5 * Math.sin(this.compassPhase), 3) * (0.4 + 0.6 * Math.max(0, 1 - d3 / 1600)) + 0.15;
    },

    _sparkles(dt) {
        this.sparkT -= dt;
        if (this.sparkT > 0 || !this.app.fx || !this.player) return;
        this.sparkT = 0.35;
        const p = this.player;
        // сокровище показалось из сена — блестит
        this.pile.treasures.forEach((t, k) => {
            if (!t.alive || Math.hypot(t.x - p.x, t.z - p.y) > 1300) return;
            if (this.pile.treasureDepth(k) < 18 && Math.random() < 0.6) this.app.fx.play('needle-glint', new BABYLON.Vector3(t.x, this.pile.G + Math.max(t.y, this.pile.hAt(t.x, t.z) - 4) + 10, t.z));
        });
        const vis = this.pile.visibleSpecials();
        if (!vis.length) return;
        const near = vis.filter(s => Math.hypot(s.x - p.x, s.z - p.y) < 1100);
        if (!near.length) return;
        const s = near[Math.floor(Math.random() * near.length)];
        const c = GAME_STRAWS[s.type].color;
        this.app.fx.create({ position: new BABYLON.Vector3(s.x, this.pile.G + s.y + 10, s.z), burst: 6, life: [0.3, 0.7], size: [3, 7], speed: [10, 40], color: c, color2: '#ffffff' });
    },

    foundNeedle() {
        if (this.state !== 'play') return;
        const pile = this.pile, nd = pile.needle, s = this.save;
        nd.found = true;
        this.state = 'found';
        this._vacuum(0, false);
        Input.clearContext();
        const def = gameLevelDef(s.level);
        const reward = def.reward;
        this.earn(reward.coins); s.gems += reward.gems; s.gemsSeen = true;
        s.needles.push(def.id);
        const pct = Math.round(pile.progress() * 100);
        this.sfx('stinger-found', 1);
        Sound.duck(0.15, 0.2, 4, 1.5);
        GameHud.flash(def.glow);
        this.player.shake(5, 0.4);
        const e = this.player.eye, d = this.player.dir();
        const to = { x: e.x + d.x * 120, y: e.y - 10, z: e.z + d.z * 120 };
        if (this.app.fx) {
            this.app.fx.play('needle-found', new BABYLON.Vector3(nd.x, pile.G + nd.y + 10, nd.z));
            this.app.fx.play('magic', new BABYLON.Vector3(nd.x, pile.G + nd.y + 10, nd.z));
        }
        this.pile.burst(nd.x, pile.G + nd.y, nd.z, 40, null, 2.2);
        Platform.gameplay(false);
        try { Platform.ads.roundEnded(true); } catch (err) { /* нет площадки */ }
        this.submitScore();
        try { Telemetry.progress('completed', 'needle_' + gameLevelDef(s.level).id, { step_index: s.level + 1 }); } catch (err) { /* нет телеметрии */ }
        this.persist();
        GameWorld.flyNeedleTo(to, () => {
            Input.release();
            Input.configure({ controls: false });
            GameHud.showFound(this, def, reward, pct);
        });
    },

    async nextLevel() {
        const s = this.save;
        GameHud.panel = '';
        GameHud.closeModal();
        GameHud.flash('#fff4d6');
        s.level++;
        s.seed = (Math.random() * 1e9) | 0;
        s.pile = null;
        await this.buildPile();
        await GameWorld.buildTrophies(s.needles);
        this._respawn();
        this.state = 'play';
        Input.configure({ controls: true });
        Input.capture();
        Platform.gameplay(true);
        try { Telemetry.progress('started', 'needle_' + gameLevelDef(s.level).id, { step_index: s.level + 1 }); } catch (err) { /* нет телеметрии */ }
        this.persist();
    },

    // =====================================================================================
    // Хлопушка и сороки
    // =====================================================================================

    surfaceAt(x, z) {
        const g = this.app.location.terrain.fieldHeight(x, z);
        return this.pile && this.pile.inside(x, z, 0) ? Math.max(g, this.pile.G + this.pile.hAt(x, z)) : g;
    },

    throwBoom() {
        const s = this.save;
        if (!s.firecracker || this.state !== 'play') return;
        if (this.boomCd > 0) { this._toastOnce('boom', Lang.t('toast.boomWait', { n: Math.ceil(this.boomCd) }), '', 1); return; }
        this.boomCd = this.upg('fuse');
        const p = this.player, e = p.eye, d = p.dir();
        this.vm.throwAnim();
        this.sfx('throw', 0.8);
        GameWorld.throwFirecracker({ x: e.x + d.x * 40, y: e.y - 10, z: e.z + d.z * 40 }, { x: d.x * 950, y: d.y * 950 + 260, z: d.z * 950 }, (x, y, z) => this._boom(x, y, z));
    },

    _boom(x, y, z) {
        const R = this.upg('blast');
        if (this.app.fx) this.app.fx.play('hay-blast', new BABYLON.Vector3(x, y + 20, z));
        this.sfx('boom', 1);
        const p = this.player, dist = Math.hypot(x - p.x, z - p.y);
        p.shake(Math.max(0, 10 * (1 - dist / 1600)), 0.45);
        if (this.pile && this.pile.inside(x, z, 0) && this.pile.hAt(x, z) > 2) {
            const res = this.pile.dig(x, y, z, R, R * 0.7, { needle: false, collect: true });
            this.pile.burst(x, y, z, 70, null, 2.6);
            this._gainSpecials(res.specials, true);
            this._gainTreasures(res.treasures);
            this.markDirty();
        }
    },

    magpieTarget() {
        const pile = this.pile;
        const vis = pile.visibleSpecials();
        let x, z;
        if (vis.length && Math.random() < 0.5) { const s = vis[Math.floor(Math.random() * vis.length)]; x = s.x; z = s.z; }
        else {
            for (let k = 0; k < 10; k++) {
                const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * pile.R * 0.8;
                x = pile.cx + Math.cos(a) * d; z = pile.cy + Math.sin(a) * d;
                if (pile.hAt(x, z) > 20) break;
            }
        }
        // не садиться на голову игроку
        if (this.player && Math.hypot(x - this.player.x, z - this.player.y) < 160) return null;
        return { x, y: z, h: pile.G + pile.hAt(x, z) + 4 };
    },

    magpiePeck(x, z) {
        const pile = this.pile;
        const h = pile.hAt(x, z);
        if (h < 3) return { h: pile.G };
        const res = pile.dig(x, pile.G + h, z, 20, 12, { needle: false, collect: true });
        if (res.specials.length) this._gainSpecials(res.specials, true);
        this._gainTreasures(res.treasures);
        if (Math.random() < 0.3) this.sfx('magpie', 0.35);
        return { h: pile.G + pile.hAt(x, z) + 2 };
    },

    magpieSold(carry, x, y, h) {
        const coins = Math.max(1, Math.round(carry * this.upg('value')));
        this.earn(coins);
        this.markDirty();
        if (this.player && Math.hypot(x - this.player.x, y - this.player.y) < 1600) this._toastOnce('magpie', Lang.t('toast.magpie', { n: coins }), 'gold', 6);
    },

    // =====================================================================================
    // Цель (лента вверху)
    // =====================================================================================

    goalText() {
        if (this.state !== 'play') return '';
        const s = this.save, cap = this.capacity(), bag = this.bagCount();
        if (this.exposed > 0.5) return Lang.t('goal.grab');
        if (bag >= cap) return Lang.t('goal.full');
        if (this.time - this.lastGlint < 5) return Lang.t('goal.glint');
        if (!s.compass) {
            if (s.coins >= GAME_GEAR.compass.price) return Lang.t('goal.compassBuy', { price: GAME_GEAR.compass.price });
            if (bag >= 10) return Lang.t('goal.sell');
            return Lang.t('goal.find', { needle: this.needleName(s.level) });
        }
        // следующая цель покупки: самый дешёвый некупленный инструмент или рюкзак
        const next = this._nextBuy();
        if (next && s.coins >= next.price) return Lang.t('goal.buy', { item: this.itemName(next.id), price: GameHud.fmt(next.price) });
        if (bag >= cap * 0.75) return Lang.t('goal.sell');
        if (next && Math.floor(this.time / 9) % 3 === 2) return Lang.t('goal.save', { item: this.itemName(next.id), price: GameHud.fmt(next.price) });
        return Lang.t('goal.compass');
    },

    _nextBuy() {
        const s = this.save, list = [];
        for (const t of GAME_TOOLS) if (!s.tools.includes(t.id) && t.price > 0) list.push({ id: t.id, price: t.price });
        GAME_PACKS.forEach((p, i) => { if (i > s.pack) list.push({ id: p.id, price: p.price }); });
        list.sort((a, b) => a.price - b.price);
        return list[0] || null;
    },

    // =====================================================================================
    // Обучение, эффекты, звук
    // =====================================================================================

    _setupTutorial() {
        const loc = this.app.location;
        const at = name => { const m = loc.marker(name); return m ? { x: m.x, y: m.y, h: loc.terrain.fieldHeight(m.x, m.y) + 260 } : null; };
        Tutorial.init({
            app: this.app,
            steps: [
                Tutorial.preset('look'),
                Tutorial.preset('move'),
                {
                    id: 'grab', title: 'tut.grab.t',
                    hint: { keyboard: 'tut.grab.keyboard', mouse: 'tut.grab.mouse', touch: 'tut.grab.touch', pad: 'tut.grab.pad' },
                    keys: { keyboard: ['grab'], pad: ['grab'] },
                    check: () => Math.min(1, this.tutGrabs / 3),
                    target: { touch: '@context' },
                    world: () => this.pile ? { x: this.pile.cx, y: this.pile.cy, h: this.pile.G + this.pile.Htop + 60 } : null,
                    onEnter: () => { this.tutGrabs = 0; },
                },
                { id: 'sell', title: 'tut.sell.t', hint: 'tut.sell.h', event: 'sell', world: () => at('press') },
                { id: 'compass', title: 'tut.compass.t', hint: 'tut.compass.h', event: 'compass', skipIf: () => this.save.compass, world: () => at('stand-compass') },
            ],
            state: () => this.save, field: 'tutorialDone',
            persist: () => this.persist(),
            onFinish: (reason) => {
                this._refreshContext();
                try { Telemetry.progress(reason === 'done' ? 'completed' : 'failed', 'tutorial', { step_index: 0 }); } catch (err) { /* нет телеметрии */ }
            },
        });
    },

    _setupFx() {
        const fx = this.app.fx;
        if (!fx) return;
        fx.register('needle-glint', [
            { burst: 10, capacity: 14, life: [0.25, 0.6], size: [4, 10], speed: [10, 50], color: '#fff6c8', color2: '#ffd34d' },
            { burst: 1, capacity: 2, life: [0.35, 0.45], size: [26, 34], speed: [0, 0], color: '#ffffff', alpha: 0.9 },
        ]);
        fx.register('needle-found', [
            { burst: 90, capacity: 120, life: [0.6, 1.6], size: [4, 12], speed: [120, 420], color: '#ffe9a0', color2: '#ff9f5a', gravity: [0, -300, 0] },
            { delay: 0.1, burst: 40, capacity: 60, life: [0.8, 2], size: [6, 16], speed: [40, 160], color: '#c9f3ff', color2: '#ffffff' },
        ]);
        fx.register('hay-blast', [
            { burst: 40, capacity: 60, life: [0.15, 0.4], size: [20, 60], speed: [80, 260], color: '#fff0b0', color2: '#ff8a3a' },
            { delay: 0.05, burst: 30, capacity: 40, life: [0.8, 1.8], size: [40, 110], speed: [30, 120], color: '#d9b77a', blend: 'standard', alpha: 0.55, gravity: [0, 40, 0] },
        ]);
    },

    sfx(name, vol) {
        if (typeof Sound === 'undefined') return;
        const v = vol == null ? 1 : vol;
        switch (name) {
            case 'grab': Sound.play(['assets/sounds/grab-1.ogg', 'assets/sounds/grab-2.ogg', 'assets/sounds/grab-3.ogg', 'assets/sounds/grab-4.ogg'], { volume: v }); break;
            case 'step': Sound.play(['assets/sounds/step-1.ogg', 'assets/sounds/step-2.ogg', 'assets/sounds/step-3.ogg', 'assets/sounds/step-4.ogg'], { volume: v }); break;
            case 'stephay': Sound.play(['assets/sounds/stephay-1.ogg', 'assets/sounds/stephay-2.ogg', 'assets/sounds/stephay-3.ogg'], { volume: v }); break;
            case 'coin': Sound.play(['assets/sounds/coin-1.ogg', 'assets/sounds/coin-2.ogg', 'assets/sounds/coin-3.ogg'], { volume: v }); break;
            case 'magpie': Sound.play(['assets/sounds/magpie-1.ogg', 'assets/sounds/magpie-2.ogg'], { volume: v }); break;
            case 'sell': Sound.play('assets/sounds/sell.ogg', { volume: v }); break;
            case 'buy': Sound.play('assets/sounds/buy.ogg', { volume: v }); break;
            case 'error': Sound.play('assets/sounds/error.ogg', { volume: v }); break;
            case 'click': Sound.play('assets/sounds/click.ogg', { volume: v }); break;
            case 'open': Sound.play('assets/sounds/open.ogg', { volume: v }); break;
            case 'full': Sound.play('assets/sounds/full.ogg', { volume: v }); break;
            case 'glint': Sound.play('assets/sounds/glint.ogg', { volume: v }); break;
            case 'sparkle': Sound.play('assets/sounds/sparkle.ogg', { volume: v }); break;
            case 'throw': Sound.play('assets/sounds/throw.ogg', { volume: v }); break;
            case 'fuse': Sound.play('assets/sounds/fuse.ogg', { volume: v }); break;
            case 'boom': Sound.play('assets/sounds/boom.ogg', { volume: v }); break;
            case 'land': Sound.play('assets/sounds/land.ogg', { volume: v }); break;
            case 'stinger-found': Sound.play('assets/sounds/stinger-found.ogg', { volume: v }); break;
            case 'stinger-newstraw': Sound.play('assets/sounds/stinger-newstraw.ogg', { volume: v }); break;
            case 'stinger-levelup': Sound.play('assets/sounds/stinger-levelup.ogg', { volume: v }); break;
        }
    },
};
