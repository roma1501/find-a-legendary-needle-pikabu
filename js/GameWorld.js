// GameWorld.js — вид мира вокруг механики: небо заката (градиентный купол, солнце, облака, кольцо гор),
// предметы на стендах мастерской, иглы на полке трофеев, игла в стоге с сиянием, маховик пресса,
// сороки-помощницы, хлопушка. Точки — маркеры карты (stand-*, press, board, trophy, magpie-house, pile).

/** @satisfies {Record<string, any>} */
const GameWorld = {
    /** @type {any} */ app: null,
    /** @type {any} */ view: null,
    /** @type {any} */ scene: null,
    sky: null, sunDisc: null, clouds: [], mountains: null,
    /** @type {{ id: string, kind: string, x: number, y: number, h: number, rot: number, mesh: any, spin: number, label: string }[]} */
    stands: [],
    trophies: [],
    /** @type {any[]} */ treasureMeshes: [],
    /** @type {{ mesh: any, from: any, to: any, t: number }[]} */ treasureFly: [],
    needleMesh: null, needleAura: null, needleBeam: null, needleRing: null,
    pressWheel: null, pressSpin: 0, pressBoost: 0,
    millBlades: null,
    magpies: [],
    shots: [],
    time: 0,

    async init(app) {
        this.app = app;
        this.view = app.location.view;
        this.scene = this.view.scene;
        this._buildSky();
        await Promise.all([this._buildMountains(), this._buildClouds()]);
    },

    // =====================================================================================
    // Небо
    // =====================================================================================

    _buildSky() {
        const scene = this.scene;
        const sky = BABYLON.MeshBuilder.CreateSphere('sky', { diameter: 46000, segments: 24, sideOrientation: BABYLON.Mesh.BACKSIDE }, scene);
        const pos = sky.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const cols = new Float32Array(pos.length / 3 * 4);
        const sd = World3D.sunDirection();
        const sun = new BABYLON.Vector3(-sd.x, -sd.y, -sd.z).normalize();
        /** @type {any[]} */
        const stops = [
            [-0.2, [0.96, 0.74, 0.52]], [0.0, [1.0, 0.8, 0.56]], [0.06, [0.99, 0.72, 0.55]],
            [0.18, [0.93, 0.62, 0.6]], [0.36, [0.71, 0.56, 0.72]], [0.6, [0.47, 0.5, 0.74]], [1.0, [0.32, 0.38, 0.66]],
        ];
        /** @param {number} t @returns {number[]} */
        const grad = t => {
            for (let k = 1; k < stops.length; k++) {
                if (t <= stops[k][0]) {
                    const a = stops[k - 1], b = stops[k], u = (t - a[0]) / (b[0] - a[0]);
                    return [0, 1, 2].map(i => a[1][i] + (b[1][i] - a[1][i]) * u);
                }
            }
            return stops[stops.length - 1][1];
        };
        for (let i = 0; i < pos.length / 3; i++) {
            const v = new BABYLON.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).normalize();
            const c = grad(v.y);
            // тёплое зарево у солнца
            const glow = Math.pow(Math.max(0, BABYLON.Vector3.Dot(v, sun)), 6) * 0.55 + Math.pow(Math.max(0, BABYLON.Vector3.Dot(v, sun)), 40) * 0.6;
            cols[i * 4] = Math.min(1, c[0] + glow * 0.5);
            cols[i * 4 + 1] = Math.min(1, c[1] + glow * 0.32);
            cols[i * 4 + 2] = Math.min(1, c[2] + glow * 0.12);
            cols[i * 4 + 3] = 1;
        }
        sky.setVerticesData(BABYLON.VertexBuffer.ColorKind, cols);
        const mat = new BABYLON.StandardMaterial('sky-mat', scene);
        mat.disableLighting = true;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.fogEnabled = false;
        mat.backFaceCulling = false;
        mat.metadata = { toon: false };
        sky.material = mat;
        sky.isPickable = false;
        sky.infiniteDistance = true;
        sky.applyFog = false;
        this.sky = sky;
        // диск солнца — плоскость с радиальным градиентом, всегда лицом к камере
        const tex = new BABYLON.DynamicTexture('sun-tex', { width: 256, height: 256 }, scene, false);
        const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (tex.getContext()));
        const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(0.16, 'rgba(255,236,180,1)');
        g.addColorStop(0.22, 'rgba(255,190,120,0.55)'); g.addColorStop(0.55, 'rgba(255,150,100,0.12)'); g.addColorStop(1, 'rgba(255,140,100,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
        tex.update(); tex.hasAlpha = true;
        const disc = BABYLON.MeshBuilder.CreatePlane('sun-disc', { size: 5200 }, scene);
        const dm = new BABYLON.StandardMaterial('sun-mat', scene);
        dm.disableLighting = true; dm.emissiveTexture = tex; dm.opacityTexture = tex; dm.diffuseColor = new BABYLON.Color3(0, 0, 0);
        dm.emissiveColor = new BABYLON.Color3(0, 0, 0); dm.fogEnabled = false; dm.metadata = { toon: false };
        dm.alphaMode = BABYLON.Engine.ALPHA_ADD;
        disc.material = dm;
        disc.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        disc.isPickable = false;
        disc.infiniteDistance = true;
        disc.position = sun.scale(20000);
        this.sunDisc = disc;
    },

    async _buildMountains() {
        try {
            const model = await Model3D.load('assets/models/props/mountains_ring.glb');
            const m = Model3D.build(model, this.scene, { name: 'mountains' });
            const pile = this.app.location.marker('pile');
            m.position.set(pile ? pile.x : 3500, -60, pile ? pile.y : 3500);
            m.scaling.setAll(1.15);
            for (const c of [m].concat(m.getChildMeshes(false))) {
                c.isPickable = false;
                const mats = c.material ? (/** @type {any} */ (c.material).subMaterials || [c.material]) : [];
                for (const x of mats) if (x) { x.fogEnabled = false; x.specularColor = new BABYLON.Color3(0, 0, 0); }
            }
            this.mountains = m;
        } catch (e) { console.warn('GameWorld: горы не загрузились', e); }
    },

    async _buildClouds() {
        const urls = ['assets/models/props/cloud_a.glb', 'assets/models/props/cloud_b.glb', 'assets/models/props/cloud_c.glb'];
        const pile = this.app.location.marker('pile') || { x: 3500, y: 3500 };
        const r = pileRng(4242);
        try {
            const models = await Promise.all(urls.map(u => Model3D.load(u)));
            for (let k = 0; k < 11; k++) {
                const m = Model3D.build(models[k % models.length], this.scene, { name: 'cloud' + k });
                const a = r() * Math.PI * 2, d = 9000 + r() * 6000;
                m.position.set(pile.x + Math.cos(a) * d, 2600 + r() * 2200, pile.y + Math.sin(a) * d);
                m.rotation.y = r() * 6.28;
                m.scaling.setAll(1.6 + r() * 1.6);
                for (const c of [m].concat(m.getChildMeshes(false))) {
                    c.isPickable = false;
                    const mats = c.material ? (/** @type {any} */ (c.material).subMaterials || [c.material]) : [];
                    for (const x of mats) if (x) { x.fogEnabled = false; x.emissiveColor = new BABYLON.Color3(0.35, 0.25, 0.22); x.specularColor = new BABYLON.Color3(0, 0, 0); }
                }
                this.clouds.push({ mesh: m, a, d, sp: (0.004 + r() * 0.006) * (r() < 0.5 ? 1 : -1) });
            }
        } catch (e) { console.warn('GameWorld: облака не загрузились', e); }
    },

    // =====================================================================================
    // Стенды мастерской и метки
    // =====================================================================================

    /**
     * Предметы на стендах: маркер stand-<id> → модель товара над постаментом.
     * @param {(id: string) => ({ model: string } | null)} itemDef
     */
    async buildStands(itemDef) {
        const loc = this.app.location;
        const list = (loc.map.objects || []).filter(o => o.kind === 'marker' && /^stand-/.test(o.name));
        await Promise.all(list.map(async (o) => {
            const id = o.name.slice(6).replace(/-\d+$/, '');
            const def = itemDef(id);
            const g = loc.terrain.fieldHeight(o.x, o.y);
            const rec = { id, kind: 'stand', x: o.x, y: o.y, h: g + (o.h || 0), rot: (o.rot && o.rot[1]) || 0, mesh: null, spin: Math.random() * 6, label: '' };
            this.stands.push(rec);
            if (!def || !def.model) return;
            try {
                const model = await Model3D.load(def.model);
                const mesh = Model3D.build(model, this.scene, { name: 'stand-' + id });
                World3D.addObject(this.view, mesh, 'actor', { ink: false, outline: false });
                rec.mesh = mesh;
                this._placeStandItem(rec);
            } catch (e) { console.warn('GameWorld: товар не загрузился', def.model, e); }
        }));
        for (const name of ['board', 'trophy', 'magpie-house', 'press']) {
            const o = loc.marker(name);
            if (o) this.stands.push({ id: name, kind: name, x: o.x, y: o.y, h: loc.terrain.fieldHeight(o.x, o.y) + (o.h || 0), rot: (o.rot && o.rot[1]) || 0, mesh: null, spin: 0, label: '' });
        }
    },

    _placeStandItem(rec) {
        const m = rec.mesh;
        if (!m) return;
        // длинные инструменты — стоймя (ось +X модели вверх), остальное — как есть
        const tall = /^(rake|pitchfork|trident|vacuum)$/.test(rec.id);
        m.rotationQuaternion = null;
        if (tall) {
            m.rotation.set(0, 0, Math.PI / 2);
            m.position.set(rec.x, rec.h + (rec.id === 'vacuum' ? 140 : 130), rec.y);
        } else {
            m.position.set(rec.x, rec.h + 92, rec.y);
        }
        const s = rec.id === 'compass' ? 2.2 : rec.id === 'magpie' ? 1.3 : 1;
        m.scaling.setAll(s);
        rec.baseY = m.position.y;
        rec.tall = tall;
    },

    /** Ближайшая цель взгляда для взаимодействия: стенд/доска/полка/домик. */
    pickTarget(px, py, eyeH, dir, maxD) {
        let best = null, bestScore = Infinity;
        for (const s of this.stands) {
            if (s.kind === 'press') continue;
            const dx = s.x - px, dy = s.y - py;
            const d = Math.hypot(dx, dy);
            if (d > maxD) continue;
            const hh = (s.kind === 'stand' ? s.h + 110 : s.h + 130) - eyeH;
            const l = Math.hypot(dx, dy, hh) || 1;
            const dot = (dx * dir.x + dy * dir.z + hh * dir.y) / l;
            if (dot < 0.86 && d > 120) continue;
            if (dot < 0.5) continue;
            const score = d * (1.6 - dot);
            if (score < bestScore) { bestScore = score; best = s; }
        }
        return best;
    },

    // =====================================================================================
    // Игла в стоге
    // =====================================================================================

    async setNeedle(def, pile) {
        this.clearNeedle();
        const nd = pile.needle;
        try {
            const model = await Model3D.load(def.model);
            const mesh = Model3D.build(model, this.scene, { name: 'needle' });
            World3D.addObject(this.view, mesh, 'actor', { ink: false, outline: false, castShadow: false });
            mesh.position.set(nd.x, pile.G + nd.y, nd.z);
            mesh.rotation.set(0, -nd.yaw, nd.tilt);
            mesh.scaling.setAll(1.25);
            const ring = mesh.getChildMeshes(true).find(m => m.metadata && m.metadata.part === 'ring') || null;
            if (ring) { ring.setPivotPoint(BABYLON.Vector3.FromArray(ring.metadata.pivot)); this.needleRing = { mesh: ring, q: new BABYLON.Quaternion(), a: 0 }; }
            // свечение металла
            for (const c of mesh.getChildMeshes(false)) {
                const mats = c.material ? (/** @type {any} */ (c.material).subMaterials || [c.material]) : [];
                for (const x of mats) if (x) x.emissiveColor = BABYLON.Color3.FromHexString(def.glow).scale(0.18);
            }
            this.needleMesh = mesh;
        } catch (e) {
            console.warn('GameWorld: модель иглы не загрузилась', e);
            const mesh = BABYLON.MeshBuilder.CreateCylinder('needle', { height: 70, diameterTop: 0.5, diameterBottom: 4 }, this.scene);
            mesh.rotation.z = Math.PI / 2;
            mesh.position.set(nd.x, pile.G + nd.y, nd.z);
            World3D.addObject(this.view, mesh, 'actor', { ink: false, outline: false });
            this.needleMesh = mesh;
        }
        // сияние: мягкий ореол (виден, только когда игла открыта — глубина мира его прячет)
        const tex = new BABYLON.DynamicTexture('aura-tex', { width: 128, height: 128 }, this.scene, false);
        const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (tex.getContext()));
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); tex.update(); tex.hasAlpha = true;
        const aura = BABYLON.MeshBuilder.CreatePlane('needle-aura', { size: 150 }, this.scene);
        const am = new BABYLON.StandardMaterial('aura-mat', this.scene);
        am.disableLighting = true; am.emissiveTexture = tex; am.opacityTexture = tex; am.diffuseColor = new BABYLON.Color3(0, 0, 0);
        am.emissiveColor = BABYLON.Color3.FromHexString(def.glow); am.alphaMode = BABYLON.Engine.ALPHA_ADD; am.metadata = { toon: false };
        aura.material = am; aura.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; aura.isPickable = false;
        aura.renderingGroupId = World3D.LAYER.OVERLAY;
        aura.position.set(nd.x, pile.G + nd.y, nd.z);
        aura.visibility = 0;
        this.needleAura = aura;
        // луч света вверх — когда игла показалась
        const beam = BABYLON.MeshBuilder.CreateCylinder('needle-beam', { height: 2400, diameterTop: 120, diameterBottom: 40, tessellation: 16, cap: BABYLON.Mesh.NO_CAP }, this.scene);
        const bm = new BABYLON.StandardMaterial('beam-mat', this.scene);
        bm.disableLighting = true; bm.emissiveColor = BABYLON.Color3.FromHexString(def.glow); bm.alpha = 0.0; bm.backFaceCulling = false;
        bm.alphaMode = BABYLON.Engine.ALPHA_ADD; bm.metadata = { toon: false };
        beam.material = bm; beam.isPickable = false; beam.renderingGroupId = World3D.LAYER.OVERLAY;
        beam.position.set(nd.x, pile.G + nd.y + 1200, nd.z);
        this.needleBeam = beam;
    },

    clearNeedle() {
        for (const k of ['needleMesh', 'needleAura', 'needleBeam']) {
            const m = this[k];
            if (!m) continue;
            if (k === 'needleMesh') World3D.removeObject(this.view, m); else m.dispose(false, true);
            this[k] = null;
        }
        this.needleRing = null;
    },

    /** Сокровища стога: модели в объёме сена (видны, когда раскопаны). */
    async setTreasures(pile) {
        for (const m of this.treasureMeshes) if (m) World3D.removeObject(this.view, m);
        this.treasureMeshes = [];
        await Promise.all(pile.treasures.map(async (t, k) => {
            this.treasureMeshes[k] = null;
            if (!t.alive) return;
            const d = GAME_TREASURES[t.type];
            try {
                const model = await Model3D.load(d.model);
                const mesh = Model3D.build(model, this.scene, { name: 'treasure-' + k });
                World3D.addObject(this.view, mesh, 'actor', { ink: false, outline: false, castShadow: false });
                mesh.position.set(t.x, pile.G + t.y, t.z);
                mesh.rotation.set(t.tilt, -t.yaw, 0);
                mesh.scaling.setAll(d.scale || 2.4);
                for (const c of mesh.getChildMeshes(false)) {
                    const mats = c.material ? (/** @type {any} */ (c.material).subMaterials || [c.material]) : [];
                    for (const x of mats) if (x) x.emissiveColor = new BABYLON.Color3(0.12, 0.1, 0.06);
                }
                this.treasureMeshes[k] = mesh;
            } catch (e) { console.warn('GameWorld: сокровище не загрузилось', d.model, e); }
        }));
    },

    /** Найденное сокровище взлетает к игроку и исчезает. */
    collectTreasure(k, to) {
        const m = this.treasureMeshes[k];
        if (!m) return;
        this.treasureMeshes[k] = null;
        if (this.app.fx) this.app.fx.play('needle-glint', m.position.clone());
        this.treasureFly.push({ mesh: m, from: m.position.clone(), to, t: 0, s0: m.scaling.x });
    },

    _updateTreasureFly(dt) {
        for (let i = this.treasureFly.length - 1; i >= 0; i--) {
            const f = this.treasureFly[i];
            f.t += dt / 0.7;
            const u = Math.min(1, f.t), e = 1 - Math.pow(1 - u, 3);
            f.mesh.position.x = f.from.x + (f.to.x - f.from.x) * e;
            f.mesh.position.y = f.from.y + (f.to.y - f.from.y) * e + Math.sin(u * Math.PI) * 90;
            f.mesh.position.z = f.from.z + (f.to.z - f.from.z) * e;
            f.mesh.rotation.y += dt * 10;
            f.mesh.scaling.setAll(f.s0 * (u < 0.7 ? 1 + u * 0.4 : (1 - u) / 0.3 * 1.28));
            if (u >= 1) { World3D.removeObject(this.view, f.mesh); this.treasureFly.splice(i, 1); }
        }
    },

    /** Обновить вид иглы: exposed 0..1 (насколько открыта). */
    updateNeedle(dt, exposed, pile) {
        const m = this.needleMesh;
        if (!m) return;
        const nd = pile.needle;
        if (this.needleRing) {
            const r = this.needleRing, ax = (r.mesh.metadata.axes && r.mesh.metadata.axes.x) || [1, 0, 0];
            r.a += dt * 2.4;
            BABYLON.Quaternion.RotationAxisToRef(new BABYLON.Vector3(ax[0], ax[1], ax[2]), r.a, r.q);
            r.mesh.rotationQuaternion = r.q;
        }
        if (this.needleAura) {
            const p = 0.75 + 0.25 * Math.sin(this.time * 5);
            this.needleAura.visibility = exposed * p;
            this.needleAura.scaling.setAll(0.8 + exposed * 0.6 + 0.1 * Math.sin(this.time * 3));
        }
        if (this.needleBeam) {
            this.needleBeam.material.alpha = exposed > 0.5 ? (exposed - 0.5) * 0.5 * (0.8 + 0.2 * Math.sin(this.time * 4)) : 0;
            this.needleBeam.setEnabled(exposed > 0.5 && !nd.found);
        }
        if (nd.found) return;
        // открытая игла чуть «дышит»
        m.position.y = pile.G + nd.y + (exposed > 0.5 ? Math.sin(this.time * 3) * 2 : 0);
    },

    /** Найденная игла взлетает к игроку (анимация находки). */
    flyNeedleTo(target, done) {
        const m = this.needleMesh;
        if (!m) { done(); return; }
        const from = m.position.clone();
        let t = 0;
        const step = (dt) => {
            t += dt / 1.1;
            const u = Math.min(1, t), e = 1 - Math.pow(1 - u, 3);
            m.position.x = from.x + (target.x - from.x) * e;
            m.position.y = from.y + (target.y - from.y) * e + Math.sin(u * Math.PI) * 120;
            m.position.z = from.z + (target.z - from.z) * e;
            m.rotation.y += dt * 9 * (1 - u * 0.7);
            if (this.needleAura) { this.needleAura.position.copyFrom(m.position); this.needleAura.visibility = 1; }
            if (u >= 1) { this._flyStep = null; done(); }
        };
        this._flyStep = step;
    },

    // =====================================================================================
    // Полка трофеев
    // =====================================================================================

    async buildTrophies(found) {
        for (const t of this.trophies) World3D.removeObject(this.view, t);
        this.trophies = [];
        const shelves = this.app.location.markers('trophy');
        if (!shelves.length) return;
        // слоты полок по порядку: trophy, trophy-2, trophy-3 — по пять игл на полку
        const slots = typeof GAME_TROPHY_SLOTS !== 'undefined' ? GAME_TROPHY_SLOTS : [[0.03, 0, 1.29]];
        for (let k = 0; k < Math.min(found.length, slots.length * shelves.length); k++) {
            const o = shelves[Math.floor(k / slots.length)];
            const g = this.app.location.terrain.fieldHeight(o.x, o.y);
            const rot = ((o.rot && o.rot[1]) || 0) * Math.PI / 180;
            const def = gameLevelDef(k);
            try {
                const model = await Model3D.load(def.model);
                const mesh = Model3D.build(model, this.scene, { name: 'trophy-' + k });
                const sl = slots[k % slots.length];
                const lx = sl[0] * 100, ly = -sl[1] * 100;   // y модели Blender → −y карты
                const wx = o.x + Math.cos(rot) * lx - Math.sin(rot) * ly, wy = o.y + Math.sin(rot) * lx + Math.cos(rot) * ly;
                mesh.position.set(wx, g + sl[2] * 100 + 3, wy);
                mesh.rotation.set(0, -rot - Math.PI / 2, 0);   // игла лежит вдоль полки
                World3D.addObject(this.view, mesh, 'actor', { ink: false, outline: false });
                for (const c of mesh.getChildMeshes(false)) {
                    const mats = c.material ? (/** @type {any} */ (c.material).subMaterials || [c.material]) : [];
                    for (const x of mats) if (x) x.emissiveColor = BABYLON.Color3.FromHexString(def.glow).scale(0.25);
                }
                this.trophies.push(mesh);
            } catch (e) { console.warn('GameWorld: трофей не загрузился', e); }
        }
    },

    // =====================================================================================
    // Пресс и мельница (вращение частей)
    // =====================================================================================

    findParts() {
        for (const rec of this.app.location.objects) {
            if (!rec.mesh || !rec.def || typeof rec.def.model !== 'string') continue;
            if (/hay_press\.glb$/.test(rec.def.model)) {
                const w = rec.mesh.getChildMeshes(true).find(m => m.metadata && m.metadata.part === 'wheel');
                if (w) { w.setPivotPoint(BABYLON.Vector3.FromArray(w.metadata.pivot)); this.pressWheel = { mesh: w, q: new BABYLON.Quaternion(), a: 0 }; }
            }
        }
    },

    sellBoost() { this.pressBoost = 2.2; },

    // =====================================================================================
    // Сороки
    // =====================================================================================

    async setMagpies(n, game) {
        const house = this.app.location.marker('magpie-house');
        if (!house) return;
        const g = this.app.location.terrain.fieldHeight(house.x, house.y);
        const perches = typeof GAME_MAGPIE_PERCHES !== 'undefined' ? GAME_MAGPIE_PERCHES : [[0.35, 0, 2.6], [-0.35, 0, 2.6], [0, 0.35, 2.2], [0, -0.35, 2.2], [0.3, 0.3, 1.6], [-0.3, -0.3, 1.6]];
        while (this.magpies.length < n) {
            const k = this.magpies.length;
            const p = perches[k % perches.length];
            const rot = ((house.rot && house.rot[1]) || 0) * Math.PI / 180;
            const lx = p[0] * 100, ly = -p[1] * 100;
            const home = { x: house.x + Math.cos(rot) * lx - Math.sin(rot) * ly, y: house.y + Math.sin(rot) * lx + Math.cos(rot) * ly, h: g + p[2] * 100 };
            const bird = { mesh: null, wl: null, wr: null, home, x: home.x, y: home.y, h: home.h, yaw: 0, state: 'rest', t: 1 + k * 2.3, flap: 0,
                from: null, to: null, dur: 1, pecks: 0, carry: 0, q1: new BABYLON.Quaternion(), q2: new BABYLON.Quaternion() };
            this.magpies.push(bird);
            try {
                const model = await Model3D.load('assets/models/items/magpie.glb');
                const mesh = Model3D.build(model, this.scene, { name: 'magpie' + k });
                World3D.addObject(this.view, mesh, 'actor', { ink: false, outline: false });
                mesh.scaling.setAll(1.2);
                for (const c of mesh.getChildMeshes(true)) {
                    const part = c.metadata && c.metadata.part;
                    if (part === 'wing_l' || part === 'wing_r') {
                        c.setPivotPoint(BABYLON.Vector3.FromArray(c.metadata.pivot));
                        if (part === 'wing_l') bird.wl = c; else bird.wr = c;
                    }
                }
                bird.mesh = mesh;
            } catch (e) { console.warn('GameWorld: сорока не загрузилась', e); }
        }
    },

    _updateMagpies(dt, game) {
        const pile = game.pile, press = this.app.location.marker('press');
        for (const b of this.magpies) {
            b.t -= dt;
            const fly = b.state === 'go' || b.state === 'back' || b.state === 'sell';
            if (fly) {
                b.u = Math.min(1, (b.u || 0) + dt / b.dur);
                const u = b.u, e = u * u * (3 - 2 * u);
                const f = b.from, t = b.to;
                const nx = f.x + (t.x - f.x) * e, ny = f.y + (t.y - f.y) * e;
                const nh = f.h + (t.h - f.h) * e + Math.sin(u * Math.PI) * 260;
                if (Math.hypot(nx - b.x, ny - b.y) > 0.5) b.yaw = Math.atan2(ny - b.y, nx - b.x);
                b.x = nx; b.y = ny; b.h = nh;
                b.flap += dt * 16;
                if (u >= 1) {
                    b.u = 0;
                    if (b.state === 'go') { b.state = 'peck'; b.t = 0.5; b.pecks = 3; }
                    else if (b.state === 'sell') { b.state = 'back'; b.from = { x: b.x, y: b.y, h: b.h }; b.to = b.home; b.dur = 2.2 * game.upg('wings'); game.magpieSold(b.carry, b.x, b.y, b.h); b.carry = 0; }
                    else { b.state = 'rest'; b.t = 5 * game.upg('wings') + Math.random() * 2; }
                }
            } else if (b.state === 'peck') {
                b.flap += dt * 3;
                if (b.t <= 0) {
                    b.t = 0.55;
                    const res = game.magpiePeck(b.x, b.y);
                    if (res) b.h = res.h;
                    b.carry += game.upg('beak') / 3;
                    if (--b.pecks <= 0) {
                        b.state = 'sell'; b.u = 0;
                        b.from = { x: b.x, y: b.y, h: b.h };
                        b.to = press ? { x: press.x, y: press.y, h: this.app.location.terrain.fieldHeight(press.x, press.y) + 280 } : b.home;
                        b.dur = 2.4 * game.upg('wings');
                    }
                }
            } else {
                b.flap += dt * 1.5;
                if (b.t <= 0 && pile && game.state === 'play') {
                    const pt = game.magpieTarget();
                    if (pt) { b.state = 'go'; b.u = 0; b.from = { x: b.x, y: b.y, h: b.h }; b.to = pt; b.dur = 2.4 * game.upg('wings'); }
                    else b.t = 3;
                }
            }
            if (b.mesh) {
                b.mesh.position.set(b.x, b.h + (b.state === 'peck' ? Math.abs(Math.sin(b.t * 12)) * 6 : 0), b.y);
                b.mesh.rotation.set(b.state === 'peck' ? 0.35 * Math.abs(Math.sin(b.t * 12)) : 0, -b.yaw, 0);
                const flapA = (fly ? Math.sin(b.flap) * 0.9 : Math.sin(b.flap) * 0.08) + (fly ? 0.15 : 0);
                const setWing = (w, q, s) => {
                    if (!w) return;
                    const ax = (w.metadata.axes && w.metadata.axes.x) || [1, 0, 0];
                    BABYLON.Quaternion.RotationAxisToRef(new BABYLON.Vector3(ax[0], ax[1], ax[2]), flapA * s, q);
                    w.rotationQuaternion = q;
                };
                setWing(b.wl, b.q1, 1); setWing(b.wr, b.q2, -1);
            }
        }
    },

    // =====================================================================================
    // Хлопушка
    // =====================================================================================

    async throwFirecracker(from, vel, onBoom) {
        let mesh = null;
        try {
            const model = await Model3D.load('assets/models/items/firecracker.glb');
            mesh = Model3D.build(model, this.scene, { name: 'shot' });
            World3D.addObject(this.view, mesh, 'actor', { ink: false, outline: false, castShadow: false });
        } catch (e) {
            mesh = BABYLON.MeshBuilder.CreateCylinder('shot', { height: 30, diameter: 7 }, this.scene);
        }
        mesh.scaling.setAll(1.4);
        this.shots.push({ mesh, x: from.x, y: from.y, z: from.z, vx: vel.x, vy: vel.y, vz: vel.z, stuck: false, fuse: 0.9, spin: 0, onBoom, spark: null });
    },

    _updateShots(dt, game) {
        for (let k = this.shots.length - 1; k >= 0; k--) {
            const s = this.shots[k];
            if (!s.stuck) {
                s.vy -= 1500 * dt;
                s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
                s.spin += dt * 12;
                const g = game.surfaceAt(s.x, s.z);
                if (s.y <= g + 6) {
                    s.y = g + 6; s.stuck = true;
                    if (this.app.fx) s.spark = this.app.fx.create({ position: new BABYLON.Vector3(s.x, s.y + 16, s.z), rate: 60, life: [0.15, 0.4], size: [2, 5], speed: [40, 120], color: '#ffd27a', color2: '#ff7a2a', gravity: [0, -200, 0] });
                    game.sfx('fuse');
                }
            } else {
                s.fuse -= dt;
                if (s.fuse <= 0) {
                    if (s.spark) s.spark.stop();
                    World3D.removeObject(this.view, s.mesh);
                    this.shots.splice(k, 1);
                    s.onBoom(s.x, s.y, s.z);
                    continue;
                }
            }
            s.mesh.position.set(s.x, s.y, s.z);
            s.mesh.rotation.set(s.stuck ? 0.6 : s.spin, s.spin * 0.3, 0);
        }
    },

    // =====================================================================================
    // Кадр
    // =====================================================================================

    update(dt, game) {
        this.time += dt;
        const cam = this.view.camera;
        if (this.sky) this.sky.position.copyFrom(cam.position);
        for (const c of this.clouds) {
            c.a += c.sp * dt * 0.1;
        }
        for (const s of this.stands) {
            if (!s.mesh) continue;
            s.spin += dt * 0.7;
            if (s.tall) { s.mesh.rotation.set(0, s.spin, Math.PI / 2); }
            else s.mesh.rotation.y = s.spin;
            s.mesh.position.y = s.baseY + Math.sin(this.time * 1.6 + s.x) * 3;
        }
        if (this.pressWheel) {
            const w = this.pressWheel, ax = (w.mesh.metadata.axes && w.mesh.metadata.axes.y) || [0, 1, 0];
            this.pressBoost = Math.max(0, this.pressBoost - dt);
            w.a += dt * (0.6 + this.pressBoost * 4);
            const axis = w.mesh.metadata.axes && w.mesh.metadata.axes.z ? w.mesh.metadata.axes.z : ax;
            BABYLON.Quaternion.RotationAxisToRef(new BABYLON.Vector3(axis[0], axis[1], axis[2]), w.a, w.q);
            w.mesh.rotationQuaternion = w.q;
        }
        if (this._flyStep) this._flyStep(dt);
        this._updateTreasureFly(dt);
        this._updateMagpies(dt, game);
        this._updateShots(dt, game);
    },
};
