// GamePlayer.js — игрок от первого лица: ходьба по земле (Nav — стены и стволы) и по стогу (поле высот
// GamePile: можно залезть, яма под ногами проседает), прыжок, камера (вместо орбитальной камеры движка),
// «руки» — инструмент в правой руке и компас в левой (отдельная группа отрисовки поверх мира).
// Курс yaw: вперёд = (cos yaw, sin yaw) по карте; вправо на экране — (−sin yaw, cos yaw).

const FP = {
    num(name, def) { return typeof window !== 'undefined' && typeof /** @type {any} */ (window)[name] === 'number' ? /** @type {any} */ (window)[name] : def; },
};

class GamePlayer {
    /** @param {any} app @param {{ x: number, y: number, yaw: number }} at */
    constructor(app, at) {
        this.app = app;
        this.view = app.location.view;
        this.cam = this.view.camera;
        this.x = at.x; this.y = at.y;
        this.yaw = at.yaw; this.pitch = -0.12;
        this.r = typeof FP_RADIUS !== 'undefined' ? FP_RADIUS : 30;
        this.feet = this.groundAt(this.x, this.y);
        this.vy = 0;
        this.onGround = true;
        this.onHay = false;
        this.eyeLag = 0;
        this.bob = 0; this.bobAmp = 0;
        this.stepDist = 0;
        this.sens = 1;
        this.shakeT = 0; this.shakeAmp = 0;
        this.speedNow = 0;
        this.climbing = false;
        /** @type {GamePile | null} */
        this.pile = null;
        this.frozen = false;
        this.cam.minZ = 4;
        this.cam.maxZ = 26000;
        this._dir = new BABYLON.Vector3(1, 0, 0);
        this._tgt = new BABYLON.Vector3();
        this.onStep = null;   // (onHay) => звук шага
        this.onLand = null;
    }

    groundAt(x, y) {
        const g = typeof Nav !== 'undefined' && Nav.ready ? Nav.height(x, y) : this.app.location.terrain.fieldHeight(x, y);
        if (this.pile && this.pile.inside(x, y, 0)) return Math.max(g, this.pile.G + this.pile.standAt(x, y, this.r));
        return g;
    }

    get eyeH() { return typeof FP_EYE_HEIGHT !== 'undefined' ? FP_EYE_HEIGHT : 165; }
    get eye() { return { x: this.x, y: this.feet + this.eyeH - this.eyeLag, z: this.y }; }

    /** Направление взгляда (Babylon). */
    dir(out) {
        const cp = Math.cos(this.pitch);
        out = out || this._dir;
        out.x = Math.cos(this.yaw) * cp; out.y = Math.sin(this.pitch); out.z = Math.sin(this.yaw) * cp;
        return out;
    }

    /** @param {number} dt @param {{dx:number,dy:number}} look @param {{x:number,y:number}} mv @param {{ jump: boolean, sprint: boolean }} keys */
    update(dt, look, mv, keys) {
        const sens = (typeof FP_MOUSE_SENS !== 'undefined' ? FP_MOUSE_SENS : 0.0022) * this.sens;
        this.yaw += look.dx * sens;
        this.pitch = Math.max(-1.45, Math.min(1.35, this.pitch - look.dy * sens));
        if (this.frozen) { mv = { x: 0, y: 0 }; }
        const walk = typeof FP_WALK_SPEED !== 'undefined' ? FP_WALK_SPEED : 430;
        const sprint = typeof FP_SPRINT_SPEED !== 'undefined' ? FP_SPRINT_SPEED : 680;
        let speed = keys.sprint ? sprint : walk;
        if (this.onHay) speed *= 0.82;
        const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
        let vx = (c * mv.y - s * mv.x) * speed, vz = (s * mv.y + c * mv.x) * speed;
        const step = typeof FP_STEP !== 'undefined' ? FP_STEP : 55;
        const climbV = typeof FP_CLIMB_SPEED !== 'undefined' ? FP_CLIMB_SPEED : 340;
        this.climbing = false;
        if (vx || vz) {
            let nx = this.x + vx * dt, ny = this.y + vz * dt;
            if (typeof Nav !== 'undefined' && Nav.ready) {
                const p = Nav.move(this.x, this.y, vx * dt, vz * dt, this.r);
                nx = p.x; ny = p.y;
            }
            const g = this.groundAt(nx, ny);
            if (g - this.feet > step) {
                // стена сена: карабкаемся вверх, вперёд не идём, пока не поднимемся
                if (this.onGround || this.onHay) {
                    this.feet = Math.min(g, this.feet + climbV * dt);
                    this.vy = 0;
                    this.climbing = true;
                }
            } else {
                this.x = nx; this.y = ny;
            }
        }
        // вертикаль
        const ground = this.groundAt(this.x, this.y);
        const grav = typeof FP_GRAVITY !== 'undefined' ? FP_GRAVITY : 1700;
        if (keys.jump && (this.onGround || this.climbing)) {
            this.vy = typeof FP_JUMP_SPEED !== 'undefined' ? FP_JUMP_SPEED : 560;
            this.onGround = false;
        }
        const wasGround = this.onGround;
        if (this.climbing) {
            this.onGround = true;
        } else if (this.feet > ground + 0.5 || this.vy > 0) {
            this.vy -= grav * dt;
            this.feet += this.vy * dt;
            if (this.feet <= ground) {
                const fall = -this.vy;
                this.feet = ground; this.vy = 0; this.onGround = true;
                if (!wasGround && fall > 320) {
                    this.eyeLag = Math.min(26, fall * 0.03);
                    if (this.onLand) this.onLand(fall);
                }
            } else this.onGround = false;
        } else {
            // подъём по склону и ступеньке — плавно для глаза
            if (ground > this.feet) this.eyeLag += ground - this.feet;
            this.feet = ground; this.vy = 0; this.onGround = true;
        }
        this.onHay = !!(this.pile && this.pile.inside(this.x, this.y, 0) && this.pile.standAt(this.x, this.y, this.r) > 2 && this.feet <= this.pile.G + this.pile.standAt(this.x, this.y, this.r) + 4);
        this.eyeLag += (0 - this.eyeLag) * Math.min(1, dt * 12);
        // шаги и покачивание
        const hs = Math.hypot(vx, vz);
        this.speedNow = this.onGround ? hs : 0;
        if (this.onGround && hs > 50) {
            this.stepDist += hs * dt;
            const stride = keys.sprint ? 175 : 140;
            if (this.stepDist > stride) { this.stepDist = 0; if (this.onStep) this.onStep(this.onHay); }
        }
        const amp = this.onGround ? Math.min(1, hs / 600) * 4.2 : 0;
        this.bobAmp += (amp - this.bobAmp) * Math.min(1, dt * 8);
        this.bob += dt * (hs > 600 ? 13 : 10);
        if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    }

    shake(amp, time) { this.shakeAmp = Math.max(this.shakeT > 0 ? this.shakeAmp : 0, amp); this.shakeT = Math.max(this.shakeT, time); }

    /** Поставить камеру Babylon (зовётся вместо CameraController.update) и кадр теней. */
    applyCamera() {
        const e = this.eye, d = this.dir();
        const bobY = Math.sin(this.bob * 2) * this.bobAmp * 0.6, bobS = Math.cos(this.bob) * this.bobAmp * 0.45;
        let sx = 0, sy = 0;
        if (this.shakeT > 0) { const k = this.shakeAmp * Math.min(1, this.shakeT / 0.25); sx = (Math.random() * 2 - 1) * k; sy = (Math.random() * 2 - 1) * k; }
        const rx = -Math.sin(this.yaw), rz = Math.cos(this.yaw);
        const px = e.x + rx * bobS + sx, py = e.y + bobY + sy, pz = e.z + rz * bobS;
        this.cam.position.set(px, py, pz);
        this._tgt.set(px + d.x * 100, py + d.y * 100, pz + d.z * 100);
        this.cam.setTarget(this._tgt);
        // вертикальный угол: в портрете шире, чтобы по горизонтали было видно не меньше ~62°
        const eng = this.view.engine, aspect = eng ? eng.getRenderWidth() / Math.max(1, eng.getRenderHeight()) : 1.6;
        const base = (typeof FP_FOV_DEG !== 'undefined' ? FP_FOV_DEG : 70) * Math.PI / 180;
        const needV = 2 * Math.atan(Math.tan(62 * Math.PI / 360) / Math.max(0.3, aspect));
        this.cam.fov = Math.min(1.85, Math.max(base, needV));
        // тени — вокруг точки перед игроком
        const fx = this.x + Math.cos(this.yaw) * 380, fz = this.y + Math.sin(this.yaw) * 380;
        this.view.fitShadowFrustum(fx, fz, this.feet, typeof WORLD3D_SHADOW_RADIUS !== 'undefined' ? WORLD3D_SHADOW_RADIUS : 840);
    }
}

// =========================================================================================
// «Руки»: инструмент в правой руке, компас в левой. Группа отрисовки 3 со своей очисткой глубины —
// инструмент не утопает в сене, когда игрок вплотную.
// =========================================================================================

const VM_GROUP = 3;

class GameViewModel {
    /** @param {any} view */
    constructor(view) {
        this.view = view;
        this.scene = view.scene;
        this.scene.setRenderingAutoClearDepthStencil(VM_GROUP, true, true, false);
        this.root = new BABYLON.TransformNode('vm-root', this.scene);
        this.root.parent = view.camera;
        // свой мягкий свет для рук: при любом повороте к солнцу перчатка не уходит в серую тень
        this.light = new BABYLON.HemisphericLight('vm-light', new BABYLON.Vector3(0.3, 1, -0.4), this.scene);
        this.light.intensity = 0.62;
        this.light.diffuse = BABYLON.Color3.FromHexString('#fff1dc');
        this.light.groundColor = BABYLON.Color3.FromHexString('#b88a6a');
        this.light.specular = new BABYLON.Color3(0.1, 0.1, 0.1);
        this.light.includedOnlyMeshes = [];
        this.rh = this.scene.useRightHandedSystem ? -1 : 1;   // вперёд камеры по локальной Z
        /** @type {Record<string, any>} */
        this.tools = {};
        this.toolId = '';
        this.anim = 0;          // 0..1 фаза захвата, -1 нет
        this.animDur = 0.34;
        this.hit = null;
        this.sway = { x: 0, y: 0 };
        this.compass = null;
        this.compassOn = false;
        this.vacuumOn = false;
        this.time = 0;
        this.throwT = -1;
    }

    static orient(node, fwd, up) {
        const f = BABYLON.Vector3.FromArray(fwd).normalize();
        let u = BABYLON.Vector3.FromArray(up);
        u = u.subtract(f.scale(BABYLON.Vector3.Dot(u, f))).normalize();
        const z = BABYLON.Vector3.Cross(f, u);
        const m = BABYLON.Matrix.FromValues(f.x, f.y, f.z, 0, u.x, u.y, u.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1);
        node.rotationQuaternion = BABYLON.Quaternion.FromRotationMatrix(m);
    }

    _prep(root) {
        const meshes = [root].concat(root.getChildMeshes(false));
        for (const m of meshes) {
            if (this.light && this.light.includedOnlyMeshes.indexOf(m) < 0) this.light.includedOnlyMeshes.push(m);
            m.renderingGroupId = VM_GROUP;
            m.isPickable = false;
            m.alwaysSelectAsActiveMesh = true;
            m.receiveShadows = false;
        }
    }

    /** Предплечье в рукаве куртки: цилиндр от запястья к нижнему углу экрана (строится каждый кадр). */
    _makeArm(name) {
        if (!this._sleeveMat) {
            const m = new BABYLON.StandardMaterial('vm-sleeve-mat', this.scene);
            m.diffuseColor = BABYLON.Color3.FromHexString('#2f7480');
            m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
            this._sleeveMat = m;
        }
        const s = BABYLON.MeshBuilder.CreateCylinder(name, { height: 1, diameterBottom: 8.2, diameterTop: 9, tessellation: 16 }, this.scene);
        s.material = this._sleeveMat;
        s.parent = this.root;
        this._prep(s);
        s.rotationQuaternion = new BABYLON.Quaternion();
        return s;
    }

    /** Поставить предплечье между запястьем W и точкой E (локальные координаты камеры). */
    _placeArm(arm, W, E) {
        const d = E.subtract(W), len = d.length();
        if (len < 1e-3) return;
        d.scaleInPlace(1 / len);
        arm.position.copyFrom(W).addInPlace(E).scaleInPlace(0.5);
        arm.scaling.set(1, len, 1);
        const up = BABYLON.Vector3.Up(), axis = BABYLON.Vector3.Cross(up, d), s = axis.length();
        const ang = Math.atan2(s, BABYLON.Vector3.Dot(up, d));
        if (s < 1e-6) arm.rotationQuaternion.set(0, 0, 0, 1);
        else BABYLON.Quaternion.RotationAxisToRef(axis.scaleInPlace(1 / s), ang, arm.rotationQuaternion);
    }

    /**
     * Вьюмодель fp_*.glb: рука, рукав и инструмент уже стоят в кадре (начало координат — глаз, +X вперёд,
     * +Z Blender вверх). Части: arm, hand_open / hand_grab (рука без инструмента) или hand, tool, clump.
     */
    async _loadFp(def, rec) {
        const model = await Model3D.load(def.fp);
        const mesh = Model3D.build(model, this.scene, { name: 'fp-' + def.id });
        mesh.parent = rec.holder;
        this._prep(mesh);
        rec.mesh = mesh;
        rec.fp = {};
        for (const c of mesh.getChildMeshes(true)) {
            const p = c.metadata && c.metadata.part;
            if (p) rec.fp[p] = c;
        }
        if (rec.clump) { rec.clump.dispose(); rec.clump = null; }   // запасной пучок успел прицепиться, пока грузилась вьюмодель
        if (rec.fp.hand_grab) rec.fp.hand_grab.setEnabled(false);
        if (rec.fp.clump) rec.fp.clump.setEnabled(false);
        // сопло (у Сеноса): самая передняя часть инструмента — середина вершин у переднего края
        const tool = rec.fp.tool;
        if (tool) {
            const P = tool.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            if (P && P.length) {
                let mx = -Infinity;
                for (let i = 0; i < P.length; i += 3) mx = Math.max(mx, P[i]);
                let sx = 0, sy = 0, sz = 0, n = 0;
                for (let i = 0; i < P.length; i += 3) if (P[i] > mx - 2.5) { sx += P[i]; sy += P[i + 1]; sz += P[i + 2]; n++; }
                if (n) rec.nozzle = new BABYLON.Vector3(sx / n, sy / n, sz / n);
            }
        }
    }

    async loadTool(def) {
        if (this.tools[def.id]) return this.tools[def.id];
        const holder = new BABYLON.TransformNode('vm-' + def.id, this.scene);
        holder.parent = this.root;
        holder.setEnabled(false);
        const rec = { def, holder, mesh: null, open: null, closed: null, clump: null, wrist: null, fp: null, nozzle: null };
        this.tools[def.id] = rec;
        if (def.fp) {
            try { await this._loadFp(def, rec); return rec; } catch (e) { console.warn('GameViewModel: вьюмодель не загрузилась, беру запасную', def.fp, e); }
        }
        try {
            const model = await Model3D.load(def.model);
            const mesh = Model3D.build(model, this.scene, { name: 'vm-' + def.id + '-m' });
            mesh.parent = holder;
            this._prep(mesh);
            rec.mesh = mesh;
            for (const c of mesh.getChildMeshes(true)) {
                const p = c.metadata && c.metadata.part;
                if (p === 'open') rec.open = c;
                if (p === 'closed') rec.closed = c;
            }
            if (rec.closed) rec.closed.setEnabled(false);
            rec.wrist = new BABYLON.Vector3(-2, -0.5, 0);
            if (def.id !== 'hand') {
                // перчатка держит инструмент за рукоять (точка хвата — начало модели)
                const hm = await Model3D.load('assets/models/items/hand.glb');
                const hand = Model3D.build(hm, this.scene, { name: 'vm-' + def.id + '-hand' });
                for (const c of hand.getChildMeshes(true)) c.setEnabled(!!(c.metadata && c.metadata.part === 'closed'));
                // кулак: канал хвата вдоль Y Blender (−Z в движке) через точку (10, −3, 0) см руки — ставим его на ось рукояти
                const grip = new BABYLON.TransformNode('vm-grip-' + def.id, this.scene);
                grip.parent = holder;
                if (def.id === 'vacuum') { GameViewModel.orient(grip, [1, 0, 0], [0, 0, 1]); grip.position.set(-10, 0, 3); }
                else { GameViewModel.orient(grip, [0, -1, 0], [0, 0, 1]); grip.position.set(0, 10, 3); }
                hand.parent = grip;
                this._prep(hand);
                rec.wrist = grip.position.clone();
            }
            this._attachClump(rec);
        } catch (e) {
            console.warn('GameViewModel: модель инструмента не загрузилась', def.model, e);
        }
        return rec;
    }

    async loadClump() {
        try {
            this._clumpModel = await Model3D.load('assets/models/items/straw_clump.glb');
            for (const id of Object.keys(this.tools)) this._attachClump(this.tools[id]);
        } catch (e) { console.warn('GameViewModel: пучок соломы не загрузился', e); }
    }

    // Пучок сена у инструмента: в кулаке (канал хвата руки — вдоль её −Z через точку (10, −3, 0) см) или на зубьях.
    _attachClump(rec) {
        if (!this._clumpModel || rec.clump || rec.fp || rec.def.id === 'vacuum') return;
        const mesh = Model3D.build(this._clumpModel, this.scene, { name: 'vm-clump-' + rec.def.id });
        mesh.parent = rec.holder;
        const head = { hand: [10, -3, 0], rake: [118, -14, 0], pitchfork: [128, 4, 0], trident: [150, 2, 0] }[rec.def.id] || [100, 0, 0];
        mesh.position.set(head[0], head[1], head[2]);
        if (rec.def.id === 'hand') GameViewModel.orient(mesh, [0.15, 0.25, 1], [0, 1, 0]);
        else { GameViewModel.orient(mesh, [0.2, 0.1, 1], [0, 1, 0]); mesh.scaling.setAll(1.6); }
        this._prep(mesh);
        mesh.setEnabled(false);
        rec.clump = mesh;
    }

    async loadCompass() {
        try {
            const model = await Model3D.load('assets/models/items/compass.glb');
            const mesh = Model3D.build(model, this.scene, { name: 'vm-compass' });
            const holder = new BABYLON.TransformNode('vm-compass-h', this.scene);
            holder.parent = this.root;
            mesh.parent = holder;
            this._prep(mesh);
            const parts = mesh.getChildMeshes(true);
            const arrow = parts.find(m => m.metadata && m.metadata.part === 'arrow') || null;
            const gem = parts.find(m => m.metadata && m.metadata.part === 'gem') || null;
            if (arrow) arrow.setPivotPoint(BABYLON.Vector3.FromArray(arrow.metadata.pivot));
            if (gem && gem.material) {
                gem.material = gem.material.clone('vm-gem-mat');
                const mats = /** @type {any} */ (gem.material).subMaterials || [gem.material];
                for (const m of mats) if (m) { m.emissiveColor = new BABYLON.Color3(0.4, 0.1, 0.05); if (m.metadata) m.metadata = Object.assign({}, m.metadata, { toon: false }); }
            }
            // левая рука fp_left.glb (в пространстве камеры, как правая): компас — в ладони. Точка и оси компаса из
            // items_fp.py (оси камеры Blender: X вперёд, Y влево, Z вверх, м) → движок: (x, z, −y) · 100
            let left = null;
            try {
                const lm = await Model3D.load('assets/models/items/fp_left.glb');
                const arm = Model3D.build(lm, this.scene, { name: 'fp-left' });
                left = new BABYLON.TransformNode('vm-left', this.scene);
                left.parent = this.root;
                GameViewModel.orient(left, [0, 0, this.rh], [0, 1, 0]);
                arm.parent = left;
                this._prep(arm);
                holder.parent = left;
                holder.position.set(35.8, -14.3, -10.7);
                GameViewModel.orient(holder, [0.598, 0.781, -0.179], [-0.748, 0.624, 0.224]);
            } catch (e) { console.warn('GameViewModel: левая рука не загрузилась — компас без руки', e); left = null; }
            const box = left || holder;
            box.setEnabled(this.compassOn);
            this.compass = { holder, box, left, mesh, arrow, gem, q: new BABYLON.Quaternion(), angle: 0, wrist: new BABYLON.Vector3(-15, -3, 0) };
        } catch (e) { console.warn('GameViewModel: компас не загрузился', e); }
    }

    setTool(id) {
        this.toolId = id;
        for (const k of Object.keys(this.tools)) this.tools[k].holder.setEnabled(k === id);
    }

    setCompass(on) {
        this.compassOn = on;
        if (this.compass) this.compass.box.setEnabled(on);
    }

    /** Мировая точка сопла Сеноса (или руки), если инструмент в руках. */
    nozzleWorld() {
        const rec = this.tools[this.toolId];
        if (!rec || !rec.holder) return null;
        const local = rec.nozzle || (this.toolId === 'vacuum' ? new BABYLON.Vector3(52, 11.5, 0) : new BABYLON.Vector3(10, 0, 0));
        return BABYLON.Vector3.TransformCoordinates(local, rec.holder.computeWorldMatrix(true));
    }

    /** Начать захват (визуально). */
    grab(dur) { this.anim = 0; this.animDur = Math.max(0.18, dur); }

    /** Бросок хлопушки (левая рука уходит вперёд). */
    throwAnim() { this.throwT = 0; }

    /** @param {number} dt @param {{ dx: number, dy: number }} look @param {number} speed @param {number} bob */
    update(dt, look, speed, bob, compassAngle, compassPulse) {
        this.time += dt;
        const f = this.rh;   // локальная «вперёд»
        // инерция взгляда
        this.sway.x += (-look.dx * 0.03 - this.sway.x) * Math.min(1, dt * 10);
        this.sway.y += (look.dy * 0.03 - this.sway.y) * Math.min(1, dt * 10);
        this.sway.x = Math.max(-6, Math.min(6, this.sway.x)); this.sway.y = Math.max(-6, Math.min(6, this.sway.y));
        const bx = Math.cos(bob) * Math.min(1, speed / 600) * 1.6, by = Math.abs(Math.sin(bob)) * Math.min(1, speed / 600) * 1.4;
        const rec = this.tools[this.toolId];
        let ph = -1;
        if (this.anim >= 0) {
            this.anim += dt / this.animDur;
            if (this.anim >= 1) this.anim = -1; else ph = this.anim;
        }
        // фаза захвата: 0..0.4 тянемся вперёд, 0.4..0.55 сжали, 0.55..1 назад с пучком
        let reach = 0, closed = false, clump = false;
        if (ph >= 0) {
            if (ph < 0.4) reach = Math.sin(ph / 0.4 * Math.PI / 2);
            else if (ph < 0.55) { reach = 1; closed = true; }
            else { reach = 1 - (ph - 0.55) / 0.45; closed = true; clump = ph < 0.92; }
        }
        if (this.vacuumOn) reach = 0.15 + Math.sin(this.time * 40) * 0.02;
        if (rec && rec.fp) {
            // вьюмодель уже в кадре: покачивание, инерция взгляда и замах к сену (наклон вниз и вперёд)
            const isHand = this.toolId === 'hand';
            const a = (isHand ? 0.22 : 0.42) * reach;
            rec.holder.position.set(bx + this.sway.x, -by + this.sway.y - reach * (isHand ? 2 : 5), f * reach * (isHand ? 9 : 6));
            GameViewModel.orient(rec.holder, [0, -Math.sin(a), f * Math.cos(a)], [0, Math.cos(a), f * Math.sin(a)]);
            const P = rec.fp;
            if (P.hand_open && P.hand_grab) { P.hand_open.setEnabled(!closed); P.hand_grab.setEnabled(closed); }
            if (P.clump) P.clump.setEnabled(clump);
            if (this.armR) this.armR.setEnabled(false);
        } else if (rec && rec.holder) {
            const isHand = this.toolId === 'hand';
            const P = isHand ? [12, -19, 25] : this.toolId === 'vacuum' ? [16, -19, 27] : [18, -24, 25];
            const R = isHand ? 20 : 34;
            rec.holder.position.set(P[0] + bx + this.sway.x - reach * 5, P[1] - by + this.sway.y + reach * (isHand ? 7 : -10), f * (P[2] + reach * R));
            if (isHand) {
                // покой: пальцы вперёд-вверх, ладонь к центру экрана, запястье за нижним краем;
                // захват: кисть опускается к сену ладонью вниз
                const L = (a, b) => a.map((v, i) => v + (b[i] - v) * reach);
                GameViewModel.orient(rec.holder, L([-0.18, 0.62, f * 0.76], [-0.28, -0.35, f]), L([0.92, 0.05, -f * 0.38], [0.5, 0.85, f * 0.05]));
                rec.holder.scaling.setAll(1.2);
            } else {
                const dn = this.toolId === 'vacuum' ? 0.12 : 0.42 + reach * 0.5;
                GameViewModel.orient(rec.holder, [-0.22, -dn, f * 1], [0.12, 1, f * 0.25]);
            }
            if (rec.open && rec.closed) { rec.open.setEnabled(!closed); rec.closed.setEnabled(closed); }
            if (!this.armR) this.armR = this._makeArm('vm-arm-r');
            const W = BABYLON.Vector3.TransformCoordinates(rec.wrist || BABYLON.Vector3.Zero(), rec.holder.computeWorldMatrix(true).multiply(BABYLON.Matrix.Invert(this.root.computeWorldMatrix(true))));
            this._placeArm(this.armR, W, this.toolId === 'hand' ? new BABYLON.Vector3(17, -50, f * 19) : new BABYLON.Vector3(26, -34, f * 13));
        }
        if (this.armR) this.armR.setEnabled(!!(rec && rec.holder && !rec.fp));
        for (const id of Object.keys(this.tools)) { const t = this.tools[id]; if (t.clump) t.clump.setEnabled(id === this.toolId && clump); }
        // компас в левой руке
        const c = this.compass;
        if (c && this.compassOn) {
            let up = 0;
            if (this.throwT >= 0) { this.throwT += dt / 0.45; if (this.throwT >= 1) this.throwT = -1; else up = Math.sin(this.throwT * Math.PI); }
            if (c.left) {
                // вся левая рука покачивается; при броске хлопушки уходит вниз и возвращается
                c.left.position.set(bx * 0.6 + this.sway.x * 0.7, -by * 0.6 + this.sway.y * 0.7 - up * 22, f * up * 4);
            } else {
                c.holder.position.set(-19 + bx * 0.6 + this.sway.x * 0.7, -17 - by * 0.6 + this.sway.y * 0.7 - up * 18, f * (34 + up * 6));
                GameViewModel.orient(c.holder, [0.05, 0.62, f * 0.78], [0.12, 0.78, -f * 0.62]);
            }
            if (c.arrow) {
                const axes = c.arrow.metadata.axes || {};
                const ax = axes.y || [0, 1, 0];
                c.angle += (compassAngle - c.angle) * Math.min(1, dt * 7);
                BABYLON.Quaternion.RotationAxisToRef(new BABYLON.Vector3(ax[0], ax[1], ax[2]), c.angle, c.q);
                c.arrow.rotationQuaternion = c.q;
            }
            if (!c.left) {
                if (!this.armL) this.armL = this._makeArm('vm-arm-l');
                const WL = BABYLON.Vector3.TransformCoordinates(c.wrist, c.holder.computeWorldMatrix(true).multiply(BABYLON.Matrix.Invert(this.root.computeWorldMatrix(true))));
                this._placeArm(this.armL, WL, new BABYLON.Vector3(-26, -34, f * 13));
            }
            if (c.gem && c.gem.material) {
                const mats = /** @type {any} */ (c.gem.material).subMaterials || [c.gem.material];
                const k = 0.25 + 0.75 * compassPulse;
                for (const m of mats) if (m) m.emissiveColor.set(1.0 * k, 0.42 * k, 0.12 * k);
            }
        }
        if (this.armL) this.armL.setEnabled(!!(c && this.compassOn && !c.left));
    }
}

// =========================================================================================
// Вихрь Сеноса: полупрозрачный конус от сопла к точке на стоге со спиральными потоками, бегущими к соплу,
// облачко пыли у точки всасывания. Мир (группа OVERLAY): сено и стог его закрывают, руки рисуются поверх.
// =========================================================================================

class SuctionFX {
    /** @param {any} scene @param {any} fx ParticleFX | null */
    constructor(scene, fx) {
        this.scene = scene;
        this.fx = fx;
        const tex = SuctionFX.swirlTexture(scene, 'a');
        this.tex = tex;
        const mat = new BABYLON.StandardMaterial('vac-swirl-mat', scene);
        mat.disableLighting = true; mat.emissiveTexture = tex; mat.opacityTexture = tex;
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0); mat.emissiveColor = new BABYLON.Color3(1, 0.95, 0.85);
        mat.alphaMode = BABYLON.Engine.ALPHA_ADD; mat.backFaceCulling = false; mat.fogEnabled = false; mat.metadata = { toon: false };
        // два вложенных конуса, крутятся в разные стороны: объёмный вихрь
        this.cones = [0, 1].map(i => {
            const c = BABYLON.MeshBuilder.CreateCylinder('vac-cone' + i, { height: 1, diameterBottom: i ? 7 : 11, diameterTop: i ? 46 : 70, tessellation: 20, cap: BABYLON.Mesh.NO_CAP }, scene);
            c.material = i ? mat.clone('vac-swirl-mat2') : mat;
            c.isPickable = false;
            c.renderingGroupId = World3D.LAYER.OVERLAY;
            c.rotationQuaternion = new BABYLON.Quaternion();
            c.setEnabled(false);
            return c;
        });
        this.tex2 = SuctionFX.swirlTexture(scene, 'b');
        const m2 = /** @type {any} */ (this.cones[1].material);
        m2.emissiveTexture = this.tex2;
        m2.opacityTexture = this.tex2;
        // внешний вихрь — бирюзовый воздух обычным смешиванием: на золотом сене светлое «добавление» не видно
        const m0 = /** @type {any} */ (this.cones[0].material);
        m0.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
        m0.emissiveColor = new BABYLON.Color3(0.55, 0.95, 0.98);
        m2.emissiveColor = new BABYLON.Color3(1, 0.97, 0.85);
        // воронка в точке всасывания: две спирали лицом к игроку, крутятся навстречу
        this.vortex = [0, 1].map(i => {
            const tx = SuctionFX.spiralTexture(scene, 'v' + i, i ? 3 : 4);
            const m = new BABYLON.StandardMaterial('vac-vortex-mat' + i, scene);
            m.disableLighting = true; m.emissiveTexture = tx; m.opacityTexture = tx; m.diffuseColor = new BABYLON.Color3(0, 0, 0);
            m.emissiveColor = i ? new BABYLON.Color3(1, 0.96, 0.82) : new BABYLON.Color3(0.45, 0.92, 0.95);
            m.alphaMode = i ? BABYLON.Engine.ALPHA_ADD : BABYLON.Engine.ALPHA_COMBINE;
            m.backFaceCulling = false; m.fogEnabled = false; m.metadata = { toon: false };
            const d = BABYLON.MeshBuilder.CreatePlane('vac-vortex' + i, { size: 1 }, scene);
            d.material = m; d.isPickable = false; d.renderingGroupId = World3D.LAYER.OVERLAY;
            d.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            d.setEnabled(false);
            return { mesh: d, tex: tx, dir: i ? -1 : 1 };
        });
        this.power = 0;
        this.dust = null;
        this.t = 0;
    }

    /** Спираль из arms рукавов на прозрачном фоне (воронка). */
    static spiralTexture(scene, name, arms) {
        const S = 256, tex = new BABYLON.DynamicTexture('vac-spiral-' + name, { width: S, height: S }, scene, true);
        const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (tex.getContext()));
        ctx.clearRect(0, 0, S, S);
        ctx.lineCap = 'round';
        for (let a = 0; a < arms; a++) {
            for (let k = 0; k < 60; k++) {
                const u = k / 60, r = 8 + u * 112, th = a * Math.PI * 2 / arms + u * 4.2;
                const u2 = (k + 1) / 60, r2 = 8 + u2 * 112, th2 = a * Math.PI * 2 / arms + u2 * 4.2;
                ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * Math.sin(u * Math.PI) * (1 - u * 0.4)).toFixed(3) + ')';
                ctx.lineWidth = 3 + u * 9;
                ctx.beginPath();
                ctx.moveTo(S / 2 + Math.cos(th) * r, S / 2 + Math.sin(th) * r);
                ctx.lineTo(S / 2 + Math.cos(th2) * r2, S / 2 + Math.sin(th2) * r2);
                ctx.stroke();
            }
        }
        tex.update(); tex.hasAlpha = true;
        return tex;
    }

    /** Текстура спиральных потоков (рисуется на холсте; у каждого конуса своя — клон DynamicTexture не готовится). */
    static swirlTexture(scene, name) {
        const tex = new BABYLON.DynamicTexture('vac-swirl-' + name, { width: 256, height: 256 }, scene, true);
        const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (tex.getContext()));
        ctx.clearRect(0, 0, 256, 256);
        // косые полосы — на цилиндре это спирали; яркость к соплу (v = 0) выше
        for (let k = 0; k < 14; k++) {
            const x0 = k * 256 / 14 + (k % 3) * 5, w = 3 + (k % 4) * 2;
            const g = ctx.createLinearGradient(0, 0, 0, 256);
            g.addColorStop(0, 'rgba(255,250,230,0.95)'); g.addColorStop(0.6, 'rgba(240,226,180,0.55)'); g.addColorStop(1, 'rgba(230,210,160,0)');
            ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
            for (const off of [-256, 0, 256]) {
                ctx.beginPath(); ctx.moveTo(x0 + off, 0); ctx.bezierCurveTo(x0 + off + 60, 90, x0 + off + 30, 170, x0 + off + 110, 256); ctx.stroke();
            }
        }
        // мелкая «пыль»
        for (let k = 0; k < 160; k++) { ctx.fillStyle = 'rgba(255,240,200,' + (0.3 + (k % 5) * 0.12) + ')'; ctx.fillRect((k * 97) % 256, (k * 53) % 256, 2, 2); }
        tex.update(); tex.hasAlpha = true;
        tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        return tex;
    }

    /** Кадр: on — пылесос работает и есть цель; nozzle и hit — мировые точки (Vector3). */
    update(dt, on, nozzle, hit) {
        this.t += dt;
        this.power += ((on && hit ? 1 : 0) - this.power) * Math.min(1, dt * (on ? 10 : 6));
        const vis = this.power > 0.03 && nozzle && hit;
        for (const c of this.cones) c.setEnabled(!!vis);
        for (const v of this.vortex) v.mesh.setEnabled(!!vis);
        if (this.dust && (!on || !hit)) { this.dust.stop(); this.dust = null; }
        if (!vis) return;
        this.tex.vOffset = (this.tex.vOffset + dt * 2.6) % 1;   // поток к соплу
        this.tex.uOffset = (this.tex.uOffset + dt * 0.9) % 1;   // закрутка
        this.tex2.vOffset = (this.tex2.vOffset + dt * 3.4) % 1;
        this.tex2.uOffset = (this.tex2.uOffset - dt * 1.3) % 1;
        const d = hit.subtract(nozzle), len = d.length();
        if (len < 1) return;
        d.scaleInPlace(1 / len);
        const up = BABYLON.Vector3.Up(), axis = BABYLON.Vector3.Cross(up, d), s = axis.length();
        const ang = Math.atan2(s, BABYLON.Vector3.Dot(up, d));
        const pulse = 1 + 0.08 * Math.sin(this.t * 31);
        this.cones.forEach((c, i) => {
            c.position.copyFrom(nozzle).addInPlace(hit).scaleInPlace(0.5);
            c.scaling.set(this.power * pulse * (i ? 1.05 : 1), len, this.power * pulse * (i ? 1.05 : 1));
            if (s < 1e-6) c.rotationQuaternion.set(0, 0, 0, 1);
            else BABYLON.Quaternion.RotationAxisToRef(axis.normalizeToNew(), ang, c.rotationQuaternion);
            c.visibility = this.power * (i ? 0.75 : 0.9);
        });
        // воронка чуть перед поверхностью (к соплу), чтобы сено её не прятало
        const back = Math.min(26, len * 0.2);
        this.vortex.forEach((v, i) => {
            v.mesh.position.set(hit.x - d.x * back * (1 + i * 0.2), hit.y - d.y * back * (1 + i * 0.2), hit.z - d.z * back * (1 + i * 0.2));
            const sz = (i ? 110 : 150) * this.power * (1 + 0.06 * Math.sin(this.t * 23 + i));
            v.mesh.scaling.set(sz, sz, 1);
            v.tex.wAng = (v.tex.wAng + dt * 7 * v.dir) % (Math.PI * 2);
            v.mesh.visibility = this.power * (i ? 0.85 : 0.9);
        });
        // пыль и соломенная труха у точки всасывания
        if (this.fx) {
            if (!this.dust) this.dust = this.fx.create({ position: hit.clone(), rate: 38, capacity: 50, life: [0.25, 0.6], size: [10, 26],
                speed: [20, 70], color: '#f0dca6', color2: '#c99a4a', blend: 'standard', alpha: 0.5, gravity: [0, 60, 0] });
            if (this.dust) this.dust.setPosition(hit);
        }
    }
}
