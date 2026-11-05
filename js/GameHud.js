// GameHud.js — интерфейс игры в стиле «осенняя мастерская»: пергамент, латунь, бирюзовая краска.
// HUD (счётчики-бирки, лента цели, прицел с перезарядкой, подсказки, всплывающие надписи, метки над
// стендами), меню, пауза, карточка товара, доска улучшений, коллекция, настройки, окно находки иглы.
// Раскладка HUD — HudLayout (блоки не пересекаются с экранным стиком и кнопкой Input).

const UI_ICONS = {
    coin: 'assets/ui/coin.webp', gem: 'assets/ui/gem.webp', hay: 'assets/ui/icons/straw_common.webp', gear: 'assets/ui/gear.webp',
    close: 'assets/ui/close.webp', lock: 'assets/ui/lock.webp', upgrade: 'assets/ui/upgrade.webp', book: 'assets/ui/book.webp',
    star: 'assets/ui/star.webp', trophy: 'assets/ui/trophy.webp', check: 'assets/ui/check.webp', grab: 'assets/ui/grab.webp',
    speed: 'assets/ui/speed.webp', boom: 'assets/ui/icons/firecracker_kit.webp', vac: 'assets/ui/icons/vacuum.webp',
};

/** @satisfies {Record<string, any>} */
const GameHud = {
    /** @type {HTMLElement | null} */ root: null,
    /** @type {Record<string, HTMLElement>} */ el: {},
    labels: new Map(),
    toasts: [],
    panel: '',
    tab: 'tools',
    _last: {},

    init() {
        const root = document.createElement('div');
        root.id = 'nh-root';
        root.innerHTML = `
<div id="nh-hud" class="nh-hidden">
  <div id="nh-counters">
    <div class="nh-tag" id="nh-coins"><img class="nh-ic" src="${UI_ICONS.coin}" alt=""><b>0</b></div>
    <div class="nh-tag nh-gem" id="nh-gems"><img class="nh-ic" src="${UI_ICONS.gem}" alt=""><b>0</b></div>
    <div class="nh-tag nh-haytag" id="nh-hay"><img class="nh-ic" src="${UI_ICONS.hay}" alt=""><span class="nh-fill"></span><b>0/30</b></div>
  </div>
  <div id="nh-goal">
    <div class="nh-gauge"><span class="nh-gl" data-t="hud.pile"></span><span class="nh-gbar"><i></i></span><span class="nh-gp">0.0%</span></div>
    <div class="nh-ribbon"><span id="nh-goal-text"></span></div>
    <div id="nh-trial" class="nh-hidden"><img src="${UI_ICONS.vac}" alt=""><span class="nh-trial-bar"><i></i></span><b>20</b></div>
  </div>
  <div id="nh-btns">
    <button class="nh-rb" id="nh-b-upg" title=""><img src="${UI_ICONS.upgrade}" alt=""><span class="nh-badge nh-hidden">0</span></button>
    <button class="nh-rb" id="nh-b-col" title=""><img src="${UI_ICONS.book}" alt=""></button>
    <button class="nh-rb" id="nh-b-set" title=""><img src="${UI_ICONS.gear}" alt=""></button>
  </div>
  <div id="nh-boom" class="nh-hidden"><img src="${UI_ICONS.boom}" alt=""><span class="nh-cd"></span><em>Q</em></div>
  <div id="nh-cross"><i></i></div>
  <div id="nh-hint"></div>
  <div id="nh-toasts"></div>
  <div id="nh-labels"></div>
  <div id="nh-capture" class="nh-hidden"></div>
</div>
<div id="nh-flash"></div>
<div id="nh-modal" class="nh-hidden"><div id="nh-modal-in"></div></div>
<div id="nh-menu" class="nh-hidden"></div>`;
        document.body.appendChild(root);
        this.root = root;
        const q = s => /** @type {HTMLElement} */ (root.querySelector(s));
        this.el = {
            hud: q('#nh-hud'), coins: q('#nh-coins b'), gems: q('#nh-gems b'), gemTag: q('#nh-gems'), hay: q('#nh-hay b'), hayTag: q('#nh-hay'),
            hayFill: q('#nh-hay .nh-fill'), goal: q('#nh-goal-text'), gauge: q('.nh-gbar i'), gp: q('.nh-gp'), cross: q('#nh-cross'),
            hint: q('#nh-hint'), toasts: q('#nh-toasts'), labels: q('#nh-labels'), modal: q('#nh-modal'), modalIn: q('#nh-modal-in'),
            menu: q('#nh-menu'), badge: q('#nh-b-upg .nh-badge'), boom: q('#nh-boom'), trial: q('#nh-trial'), trialBar: q('#nh-trial i'), trialSec: q('#nh-trial b'), boomCd: q('#nh-boom .nh-cd'), capture: q('#nh-capture'), flash: q('#nh-flash'),
        };
        for (const img of root.querySelectorAll('img')) img.addEventListener('error', () => { /** @type {HTMLElement} */ (img).style.visibility = 'hidden'; });
        q('#nh-b-upg').addEventListener('click', () => Game.openPanel('upgrades'));
        q('#nh-b-col').addEventListener('click', () => Game.openPanel('collection'));
        q('#nh-b-set').addEventListener('click', () => Game.openPanel('settings'));
        this.el.boom.addEventListener('pointerdown', (e) => { e.stopPropagation(); Game.throwBoom(); });
        this.el.modal.addEventListener('pointerdown', (e) => { if (e.target === this.el.modal) Game.closePanel(); });
        this.el.capture.addEventListener('click', () => { if (typeof Input !== 'undefined') Input.capture(); });
        if (typeof HudLayout !== 'undefined') {
            HudLayout.block('nh-counters', { dock: 'tl', w: 170, h: 148, el: '#nh-counters' });
            HudLayout.block('nh-btns', { dock: 'tr', w: 178, h: 56, el: '#nh-btns', min: 40 });
            HudLayout.block('nh-goal', { dock: 'tc', w: 420, minW: 150, h: 'auto', fill: true, maxW: 560, el: '#nh-goal' });
            HudLayout.block('nh-boom', { dock: 'br', w: 76, h: 76, el: '#nh-boom', min: 56, order: 1 });
        }
        this.applyLang();
    },

    applyLang() {
        if (typeof Lang !== 'undefined') Lang.apply(this.root);
        const set = (id, key) => { const b = this.root && this.root.querySelector(id); if (b) /** @type {HTMLElement} */ (b).title = Lang.t(key); };
        set('#nh-b-upg', 'hud.upgrades'); set('#nh-b-col', 'hud.collection'); set('#nh-b-set', 'hud.settings');
        this.el.capture.textContent = Lang.t('input.capture');
    },

    showHud(on) { this.el.hud.classList.toggle('nh-hidden', !on); },

    // =====================================================================================
    // HUD каждый кадр
    // =====================================================================================

    fmt(n) {
        n = Math.floor(n);
        if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
        if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
        return String(n);
    },

    setText(el, key, v) {
        if (this._last[key] === v) return;
        this._last[key] = v;
        el.textContent = v;
    },

    update(dt, g) {
        const s = g.save;
        this.setText(this.el.coins, 'coins', this.fmt(g.coinsShown));
        this.setText(this.el.gems, 'gems', this.fmt(s.gems));
        this.el.gemTag.classList.toggle('nh-hidden', s.gems <= 0 && !s.gemsSeen);
        const cap = g.capacity(), hay = Math.min(cap, g.bagCount());   // особая солома сверх вместимости не показывается «31/30»
        this.setText(this.el.hay, 'hay', hay >= cap ? Lang.t('hud.full') + ' ' + hay + '/' + cap : hay + '/' + cap);
        this.el.hayFill.style.width = Math.min(100, hay / cap * 100) + '%';
        this.el.hayTag.classList.toggle('nh-full', hay >= cap);
        this.setText(this.el.goal, 'goal', g.goalText());
        const pr = g.pile ? g.pile.progress() * 100 : 0;
        this.el.gauge.style.width = Math.min(100, pr) + '%';
        this.setText(this.el.gp, 'gp', pr.toFixed(pr < 10 ? 1 : 0) + '%');
        // прицел: перезарядка дугой
        const cr = this.el.cross;
        cr.style.setProperty('--cd', String(Math.round((1 - g.cooldownFrac()) * 360)));
        cr.className = g.aim === 'hay' ? 'nh-aim-hay' : g.aim === 'use' ? 'nh-aim-use' : '';
        // подсказка взаимодействия (ПК)
        const hint = g.interactHint();
        this.setText(this.el.hint, 'hint', hint);
        this.el.hint.classList.toggle('nh-hidden', !hint);
        // хлопушка
        const owns = !!s.firecracker;
        this.el.boom.classList.toggle('nh-hidden', !owns || g.state !== 'play');
        if (owns) {
            const f = g.boomFrac();
            this.el.boomCd.style.setProperty('--cd', String(Math.round(f * 360)));
            this.el.boom.classList.toggle('nh-ready', f >= 1);
        }
        this.el.trial.classList.toggle('nh-hidden', !g.trial);
        if (g.trial) {
            this.setText(this.el.trialSec, 'trial', String(Math.max(0, Math.ceil(g.trial.left))));
            this.el.trialBar.style.width = Math.max(0, g.trial.left / g.trial.total * 100) + '%';
        }
        const nUp = g.affordableUpgrades();
        this.setText(this.el.badge, 'badge', String(nUp));
        this.el.badge.classList.toggle('nh-hidden', nUp <= 0);
        this.el.capture.classList.toggle('nh-hidden', !(g.state === 'play' && !this.panel && typeof Input !== 'undefined' && Input.needsCapture));
        this._updateToasts(dt);
        this._updateLabels(g);
    },

    // =====================================================================================
    // Всплывающие надписи
    // =====================================================================================

    toast(text, kind, icon) {
        const d = document.createElement('div');
        d.className = 'nh-toast' + (kind ? ' nh-t-' + kind : '');
        d.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + '<span></span>';
        /** @type {HTMLElement} */ (d.querySelector('span')).textContent = text;
        const img = d.querySelector('img');
        if (img) img.addEventListener('error', () => { img.remove(); });
        this.el.toasts.appendChild(d);
        this.toasts.push({ d, t: 0, life: kind === 'big' ? 2.6 : 1.8 });
        while (this.toasts.length > 3) { const o = this.toasts.shift(); o.d.remove(); }
    },

    /** «+3» у прицела, летит вверх. */
    pop(text, icon, color) {
        const d = document.createElement('div');
        d.className = 'nh-pop';
        d.innerHTML = (icon ? `<img src="${icon}" alt="">` : '') + '<b></b>';
        /** @type {HTMLElement} */ (d.querySelector('b')).textContent = text;
        if (color) d.style.color = color;
        d.style.left = (50 + (Math.random() - 0.5) * 6) + '%';
        this.el.hud.appendChild(d);
        setTimeout(() => d.remove(), 900);
    },

    flash(color) {
        const f = this.el.flash;
        f.style.background = color || '#fff3c4';
        f.classList.remove('nh-on'); void f.offsetWidth; f.classList.add('nh-on');
    },

    _updateToasts(dt) {
        for (let k = this.toasts.length - 1; k >= 0; k--) {
            const t = this.toasts[k];
            t.t += dt;
            if (t.t > t.life) { t.d.remove(); this.toasts.splice(k, 1); continue; }
            t.d.style.opacity = String(t.t > t.life - 0.4 ? (t.life - t.t) / 0.4 : Math.min(1, t.t * 6));
        }
    },

    // =====================================================================================
    // Метки над стендами (проекция мира на экран)
    // =====================================================================================

    _updateLabels(g) {
        const view = g.app.location.view, p = g.player;
        const seen = new Set();
        if (p && g.state === 'play' && !this.panel) {
            for (const s of GameWorld.stands) {
                const d = Math.hypot(s.x - p.x, s.y - p.y);
                const far = s.kind === 'press' ? 2600 : 900;
                if (d > far) continue;
                const hh = s.kind === 'press' ? s.h + 330 : s.kind === 'stand' ? s.h + 200 : s.h + 270;
                const sp = view.projectToScreen(s.x, s.y, hh);
                if (!sp.visible) continue;
                const key = s.kind + ':' + s.id;
                seen.add(key);
                let L = this.labels.get(key);
                if (!L) {
                    const el = document.createElement('div');
                    el.className = 'nh-label nh-l-' + s.kind;
                    this.el.labels.appendChild(el);
                    L = { el, text: '' };
                    this.labels.set(key, L);
                }
                const info = g.labelFor(s);
                const html = info.price ? `<span>${info.title}</span><em><img src="${info.icon}" alt="">${info.price}</em>` : `<span>${info.title}</span>` + (info.sub ? `<i>${info.sub}</i>` : '');
                if (L.text !== html) { L.el.innerHTML = html; L.text = html; L.el.classList.toggle('nh-cant', !!info.cant); }
                const k = Math.max(0.55, Math.min(1.15, 520 / Math.max(200, d)));
                L.el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -100%) scale(${k.toFixed(3)})`;
                L.el.style.opacity = String(Math.min(1, (far - d) / 200));
            }
        }
        for (const [key, L] of this.labels) if (!seen.has(key)) { L.el.remove(); this.labels.delete(key); }
    },

    // =====================================================================================
    // Окна
    // =====================================================================================

    openModal(html, cls) {
        this.el.modalIn.className = cls || '';
        this.el.modalIn.innerHTML = html;
        for (const img of this.el.modalIn.querySelectorAll('img')) img.addEventListener('error', () => { /** @type {HTMLElement} */ (img).style.visibility = 'hidden'; });
        this.el.modal.classList.remove('nh-hidden');
        for (const b of this.el.modalIn.querySelectorAll('[data-act]')) {
            b.addEventListener('click', (e) => { e.stopPropagation(); Game.uiAction(/** @type {HTMLElement} */ (b).dataset.act, /** @type {HTMLElement} */ (b).dataset.arg || ''); });
        }
    },

    closeModal() {
        this.el.modal.classList.add('nh-hidden');
        this.el.modalIn.innerHTML = '';
        this.panel = '';
    },

    costHtml(cost, ok) {
        if (!cost) return '';
        const c = cost.gems ? { n: cost.gems, i: UI_ICONS.gem } : { n: cost.coins || 0, i: UI_ICONS.coin };
        return `<span class="nh-cost${ok ? '' : ' nh-no'}"><img src="${c.i}" alt="">${this.fmt(c.n)}</span>`;
    },

    /** Кнопка «За рекламу»: прогресс N/M, на паузе между роликами — «Через N с» и неактивна. */
    adBtn(act, id, ad, small) {
        return `<button class="nh-btn nh-ad${small ? ' nh-ad-s' : ''}${ad.enabled ? '' : ' nh-dis'}" data-act="${act}" data-arg="${id}"${ad.enabled ? '' : ' disabled'}><i class="nh-play-ic"></i>${ad.label}</button>`;
    },

    /** Обновить кнопки «За рекламу» в открытом окне (таймер паузы между роликами), не перерисовывая окно. */
    refreshAdButtons(g) {
        for (const b of this.el.modalIn.querySelectorAll('[data-act="adbuy"], [data-act="adupg"]')) {
            const el = /** @type {HTMLButtonElement} */ (b), id = el.dataset.arg || '';
            const ad = el.dataset.act === 'adbuy' ? g.itemInfo(id).ad : g.adState('upg:' + id, 1);
            if (!ad) continue;
            el.innerHTML = '<i class="nh-play-ic"></i>' + ad.label;
            el.disabled = !ad.enabled;
            el.classList.toggle('nh-dis', !ad.enabled);
        }
    },

    showCard(info) {
        this.panel = 'card';
        const stats = info.stats.map(s => `<li>${s}</li>`).join('');
        let btn;
        if (info.state === 'buy') btn = `<button class="nh-btn nh-big${info.canAfford ? '' : ' nh-dis'}" data-act="buy" data-arg="${info.id}">${Lang.t('card.buy')} ${this.costHtml(info.cost, info.canAfford)}</button>`
            + (info.canAfford ? '' : `<p class="nh-need">${info.needText}</p>`)
            + (info.ad ? this.adBtn('adbuy', info.id, info.ad) : '');
        else if (info.state === 'equip') btn = `<button class="nh-btn nh-big" data-act="equip" data-arg="${info.id}">${Lang.t('card.equip')}</button>`;
        else btn = `<div class="nh-stamp">${Lang.t(info.state === 'equipped' ? 'card.equipped' : 'card.owned')}</div>`;
        this.openModal(`
<div class="nh-board nh-card">
  <button class="nh-x" data-act="close"><img src="${UI_ICONS.close}" alt="">×</button>
  <div class="nh-card-art"><div class="nh-burst"></div><img src="${info.icon}" alt=""></div>
  <div class="nh-card-body">
    <h2>${info.name}</h2>
    <p class="nh-desc">${info.desc}</p>
    <ul class="nh-stats">${stats}</ul>
    <div class="nh-card-act">${btn}</div>
  </div>
  <p class="nh-anywhere">${Lang.t('card.anywhere')}</p>
</div>`, 'nh-w-card');
    },

    showUpgrades(g) {
        this.panel = 'upgrades';
        const tabs = ['tools', 'seek', 'magpies', 'boom'];
        if (!tabs.includes(this.tab)) this.tab = 'tools';
        const tabHtml = tabs.map(t => `<button class="nh-tab${t === this.tab ? ' nh-on' : ''}" data-act="tab" data-arg="${t}">${Lang.t('tab.' + t)}</button>`).join('');
        const rows = GAME_UPGRADES.filter(u => u.tab === this.tab).map(u => {
            const lvl = g.save.upg[u.id] || 0, max = lvl >= u.max, locked = u.needs && !g.has(u.needs);
            const cost = gameUpgradeCost(u, lvl), ok = g.save.coins >= cost;
            const pips = Array.from({ length: u.max }, (_, k) => `<i class="${k < lvl ? 'nh-pip-on' : ''}"></i>`).join('');
            const act = locked ? `<span class="nh-lockt"><img src="${UI_ICONS.lock}" alt="">${Lang.t('upg.locked', { name: g.needName(u.needs) })}</span>`
                : max ? `<span class="nh-maxt">${Lang.t('label.max')}</span>`
                : `<button class="nh-btn${ok ? '' : ' nh-dis'}" data-act="upgrade" data-arg="${u.id}">${this.costHtml({ coins: cost }, ok)}</button>`
                    + (!ok && g.adsOn() ? this.adBtn('adupg', u.id, g.adState('upg:' + u.id, 1), true) : '');
            return `<div class="nh-upg${locked ? ' nh-locked' : ''}">
  <img class="nh-upg-ic" src="${u.icon}" alt="">
  <div class="nh-upg-t"><b>${Lang.t('upg.' + u.id)}</b><small>${Lang.t('upg.' + u.id + '.d')}</small><span class="nh-pips">${pips}</span><em>${g.upgEffectText(u.id, lvl)}</em></div>
  <div class="nh-upg-a">${act}</div>
</div>`;
        }).join('');
        this.openModal(`
<div class="nh-board nh-upgb">
  <button class="nh-x" data-act="close"><img src="${UI_ICONS.close}" alt="">×</button>
  <h2 class="nh-ttl">${Lang.t('upg.title')}</h2>
  <div class="nh-wallet">${this.costHtml({ coins: g.save.coins }, true)}${this.costHtml({ gems: g.save.gems }, true)}</div>
  <div class="nh-tabs">${tabHtml}</div>
  <div class="nh-upg-list">${rows}</div>
</div>`, 'nh-w-wide');
    },

    showCollection(g) {
        this.panel = 'collection';
        const nCount = g.save.needles.length;
        const needles = GAME_NEEDLES.map((d, k) => {
            const got = k < nCount;
            return `<div class="nh-cell${got ? ' nh-got' : ''}"><img src="${d.icon}" alt=""><span>${got ? Lang.t('needle.' + d.id) : Lang.t('col.unknown')}</span></div>`;
        }).join('') + (nCount > GAME_NEEDLES.length ? `<div class="nh-cell nh-got nh-more"><b>+${nCount - GAME_NEEDLES.length}</b><span>${Lang.t('needle.mythic')}</span></div>` : '');
        const straws = GAME_STRAW_ORDER.map(id => {
            const d = GAME_STRAWS[id], n = g.save.found[id] || 0, got = n > 0;
            return `<div class="nh-cell nh-r${d.rarity}${got ? ' nh-got' : ''}"><img src="${d.icon}" alt=""><span>${got ? Lang.t('straw.' + id) : Lang.t('col.unknown')}</span><small>${got ? Lang.t('rarity.' + d.rarity) + ' · ×' + this.fmt(n) : Lang.t('rarity.' + d.rarity)}</small></div>`;
        }).join('');
        const treasures = GAME_TREASURE_ORDER.map(id => {
            const d = GAME_TREASURES[id], n = (g.save.treasures || {})[id] || 0, got = n > 0;
            return `<div class="nh-cell nh-r${d.rarity}${got ? ' nh-got' : ''}"><img src="${d.icon}" alt=""><span>${got ? Lang.t('treasure.' + id) : Lang.t('col.unknown')}</span><small>${got ? '×' + this.fmt(n) : Lang.t('rarity.' + d.rarity)}</small></div>`;
        }).join('');
        this.openModal(`
<div class="nh-board nh-colb">
  <button class="nh-x" data-act="close"><img src="${UI_ICONS.close}" alt="">×</button>
  <h2 class="nh-ttl">${Lang.t('col.title')}</h2>
  <h3>${Lang.t('col.needles')} · ${Lang.t('col.found', { n: nCount })}</h3>
  <div class="nh-grid nh-needles">${needles}</div>
  <h3>${Lang.t('col.treasures')}</h3>
  <div class="nh-grid">${treasures}</div>
  <h3>${Lang.t('col.straws')}</h3>
  <div class="nh-grid">${straws}</div>
</div>`, 'nh-w-wide');
    },

    showSettings(g) {
        this.panel = 'settings';
        const st = g.save.settings;
        const q = typeof Quality !== 'undefined' ? Quality.choice : 'auto';
        const qb = ['auto', 'low', 'medium', 'high'].map(v => `<button class="nh-seg${q === v ? ' nh-on' : ''}" data-act="quality" data-arg="${v}">${Lang.t('set.q.' + v)}</button>`).join('');
        this.openModal(`
<div class="nh-board nh-setb">
  <button class="nh-x" data-act="close"><img src="${UI_ICONS.close}" alt="">×</button>
  <h2 class="nh-ttl">${Lang.t('set.title')}</h2>
  <label class="nh-row"><span>${Lang.t('set.sens')}</span><input id="nh-sens" type="range" min="0.3" max="2.5" step="0.05" value="${st.sens}"></label>
  <div class="nh-row"><span>${Lang.t('set.music')}</span><button class="nh-tog${st.music ? ' nh-on' : ''}" data-act="music">${Lang.t(st.music ? 'set.on' : 'set.off')}</button></div>
  <div class="nh-row"><span>${Lang.t('set.sounds')}</span><button class="nh-tog${!Sound.muted ? ' nh-on' : ''}" data-act="sounds">${Lang.t(!Sound.muted ? 'set.on' : 'set.off')}</button></div>
  <div class="nh-row nh-col"><span>${Lang.t('set.quality')}</span><div class="nh-segs">${qb}</div></div>
  <div class="nh-row nh-btnrow"><button class="nh-btn" data-act="howto">${Lang.t('menu.howto')}</button><button class="nh-btn nh-danger" data-act="reset">${Lang.t('set.reset')}</button></div>
</div>`, 'nh-w-mid');
        const sens = /** @type {HTMLInputElement} */ (this.el.modalIn.querySelector('#nh-sens'));
        if (sens) sens.addEventListener('input', () => Game.setSens(parseFloat(sens.value)));
    },

    showFound(g, def, reward, pct) {
        this.panel = 'found';
        this.openModal(`
<div class="nh-board nh-found">
  <div class="nh-found-art"><div class="nh-burst nh-burst-big" style="--glow:${def.glow}"></div><img src="${def.icon}" alt=""></div>
  <h2 class="nh-ttl nh-gold">${Lang.t('found.title')}</h2>
  <h3>${g.needleName(g.save.level)}</h3>
  <div class="nh-reward">${this.costHtml({ coins: reward.coins }, true)}${this.costHtml({ gems: reward.gems }, true)}</div>
  <p class="nh-desc">${Lang.t('found.pile', { n: pct })}</p>
  <button class="nh-btn nh-big" data-act="next">${Lang.t('found.next')} →</button>
</div>`, 'nh-w-mid nh-w-found');
    },

    /** Уникальное предложение: Сеносос бесплатно на N секунд, один раз за игру. */
    showTrial(g) {
        this.panel = 'trial';
        const sec = typeof VAC_TRIAL_SEC !== 'undefined' ? VAC_TRIAL_SEC : 20;
        this.openModal(`
<div class="nh-board nh-trialb">
  <div class="nh-ribbon-top">${Lang.t('trial.ribbon')}</div>
  <div class="nh-card-art"><div class="nh-burst nh-burst-big" style="--glow:#7fe7d8"></div><img src="${UI_ICONS.vac}" alt=""></div>
  <h2 class="nh-ttl nh-gold">${Lang.t('trial.title')}</h2>
  <p class="nh-desc">${Lang.t('trial.desc', { n: sec })}</p>
  <div class="nh-stack">
    <button class="nh-btn nh-big nh-play" data-act="trial">${Lang.t('trial.go', { n: sec })}</button>
    <button class="nh-btn nh-ghost" data-act="trial-no">${Lang.t('trial.no')}</button>
  </div>
</div>`, 'nh-w-mid nh-w-found');
    },

    /** Рекорды площадки: ранг, аватар, имя, счёт; вход в аккаунт, если площадка умеет. */
    showLeaders(g, rows, loading) {
        this.panel = 'leaders';
        const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
        let body;
        if (loading) body = `<p class="nh-desc nh-center">${Lang.t('lb.loading')}</p>`;
        else if (!rows.length) body = `<p class="nh-desc nh-center">${Lang.t('lb.empty')}</p>`;
        else body = '<div class="nh-lb">' + rows.slice(0, 20).map(r => `<div class="nh-lb-row${r.me ? ' nh-me' : ''}"><b>${r.rank}</b>`
            + (r.avatar ? `<img class="nh-ava" src="${esc(r.avatar)}" alt="">` : '<span class="nh-ava"></span>')
            + `<span class="nh-lb-name">${esc(r.name || Lang.t('lb.anon'))}</span><em>${this.costHtml({ coins: r.score }, true)}</em></div>`).join('') + '</div>';
        const login = !Platform.authorized() && Platform.canLogin() ? `<button class="nh-btn" data-act="login">${Lang.t('lb.login')}</button>` : '';
        this.openModal(`
<div class="nh-board nh-lbb">
  <button class="nh-x" data-act="close"><img src="${UI_ICONS.close}" alt="">×</button>
  <h2 class="nh-ttl">${Lang.t('lb.title')}</h2>
  <p class="nh-desc nh-center">${Lang.t('lb.hint')}</p>
  ${body}
  <div class="nh-row nh-btnrow">${login}</div>
</div>`, 'nh-w-mid');
    },

    showPause(g) {
        this.panel = 'pause';
        this.openModal(`
<div class="nh-board nh-pauseb">
  <h2 class="nh-ttl">${Lang.t('pause.title')}</h2>
  <div class="nh-stack">
    <button class="nh-btn nh-big" data-act="resume">${Lang.t('pause.resume')}</button>
    <button class="nh-btn" data-act="open" data-arg="upgrades">${Lang.t('hud.upgrades')}</button>
    <button class="nh-btn" data-act="open" data-arg="collection">${Lang.t('hud.collection')}</button>
    <button class="nh-btn" data-act="open" data-arg="settings">${Lang.t('hud.settings')}</button>
    <button class="nh-btn" data-act="howto">${Lang.t('menu.howto')}</button>
    ${g.hasLeaders() ? `<button class="nh-btn" data-act="leaders">${Lang.t('lb.title')}</button>` : ''}
    <button class="nh-btn nh-ghost" data-act="tomenu">${Lang.t('pause.menu')}</button>
  </div>
</div>`, 'nh-w-narrow');
    },

    confirm(text, act) {
        this.openModal(`
<div class="nh-board nh-pauseb">
  <h2 class="nh-ttl">${text}</h2>
  <div class="nh-stack"><button class="nh-btn nh-danger nh-big" data-act="${act}">OK</button><button class="nh-btn" data-act="open" data-arg="settings">${Lang.t('card.close')}</button></div>
</div>`, 'nh-w-narrow');
    },

    // =====================================================================================
    // Главное меню (поверх живой сцены)
    // =====================================================================================

    showMenu(g) {
        const m = this.el.menu;
        const started = g.save.started;
        m.innerHTML = `
<div class="nh-menu-in">
  <div class="nh-logo">
    <img class="nh-logo-needle" src="${gameLevelDef(Math.min(g.save.level, GAME_NEEDLES.length - 1)).icon}" alt="">
    <div class="nh-logo-t">${String(GAME_PLATFORM) === 'pikabu' ? '<small>НАЙДИ</small><b>ИГОЛКУ</b><b>В СТОГЕ СЕНА</b>' : '<small>FIND A</small><b>LEGENDARY</b><b>NEEDLE</b>'}</div>
  </div>
  <p class="nh-tag-line">${Lang.t('menu.tagline')}</p>
  <div class="nh-menu-btns">
    <button class="nh-btn nh-big nh-play" data-act="play">${Lang.t(started ? 'menu.continue' : 'menu.play')}</button>
    <div class="nh-menu-row">
      <button class="nh-btn" data-act="howto">${Lang.t('menu.howto')}</button>
      <button class="nh-btn" data-act="open" data-arg="settings">${Lang.t('menu.settings')}</button>
    </div>
    ${g.hasLeaders() ? `<button class="nh-btn" data-act="leaders">${Lang.t('lb.title')}</button>` : ''}
  </div>
  ${started ? `<div class="nh-menu-stats"><span>${Lang.t('menu.level', { n: g.save.level + 1 })}</span><span>${Lang.t('menu.needles', { n: g.save.needles.length })}</span>${this.costHtml({ coins: g.save.coins }, true)}</div>` : ''}
</div>`;
        for (const img of m.querySelectorAll('img')) img.addEventListener('error', () => { /** @type {HTMLElement} */ (img).style.visibility = 'hidden'; });
        for (const b of m.querySelectorAll('[data-act]')) b.addEventListener('click', (e) => { e.stopPropagation(); Game.uiAction(/** @type {HTMLElement} */ (b).dataset.act, /** @type {HTMLElement} */ (b).dataset.arg || ''); });
        m.classList.remove('nh-hidden');
    },

    hideMenu() { this.el.menu.classList.add('nh-hidden'); },
};
