// GamePile.js — стог сена. ЛОГИКА: поле высот сена над землёй (сетка PILE_CELL px), ковш захвата,
// луч прицела, особые соломинки и игла в объёме стога, процент разобранного, сохранение поля.
// ВИД: тело стога (меш по полю высот с текстурой соломы и цветом вершин: раскопанное темнее),
// тысячи соломинок thin instances на поверхности (пересаживаются после каждого ковша), светящиеся
// особые соломинки, летящие пучки после захвата.
// Координаты: x карты = X Babylon, y карты = Z Babylon, высота = Y. Все высоты стога — от земли G.

/** Детерминированный ГСЧ (mulberry32). */
function pileRng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

class GamePile {
    /**
     * @param {any} view View3D карты
     * @param {{ cx: number, cy: number, ground: number, R: number, H: number, seed: number, specials: Record<string, number>,
     *   needleDepth: number[], quality: number, treasures?: number }} o
     */
    constructor(view, o) {
        this.view = view;
        this.scene = view.scene;
        this.cx = o.cx; this.cy = o.cy; this.G = o.ground;
        this.R = o.R; this.Htop = o.H; this.seed = o.seed | 0;
        this.quality = o.quality == null ? 2 : o.quality;
        const cs = this.cs = typeof PILE_CELL !== 'undefined' ? PILE_CELL : 10;
        this.E = Math.ceil(this.R * 1.14 / cs) * cs;
        this.n = Math.round(2 * this.E / cs) + 1;
        this.x0 = this.cx - this.E; this.z0 = this.cy - this.E;
        this.H = new Float32Array(this.n * this.n);
        this.H0 = new Float32Array(this.n * this.n);
        this.rng = pileRng(this.seed * 7919 + 13);
        this._shape();
        this.V0 = this._volume(this.H0);
        this.V = this.V0;
        /** @type {{ x: number, z: number, y: number, type: string, alive: boolean, vis: boolean, ph: number }[]} */
        this.specials = [];
        this._placeSpecials(o.specials || {});
        this.needle = this._placeNeedle(o.needleDepth || [0.35, 0.6]);
        /** @type {{ x: number, z: number, y: number, type: string, alive: boolean, yaw: number, tilt: number }[]} */
        this.treasures = [];
        this._placeTreasures(o.treasures || 0);
        this.time = 0;
        this.dirty = false;
        this._buildBody();
        this._buildStraws();
        this._buildSpecials();
        this._buildFlyers();
        this.refreshAll();
    }

    // =====================================================================================
    // Логика: поле высот
    // =====================================================================================

    _shape() {
        const r = this.rng, n = this.n, cs = this.cs, R = this.R, Ht = this.Htop;
        const lumps = [];
        for (let k = 0; k < 9; k++) {
            const a = r() * Math.PI * 2, d = (0.08 + r() * 0.62) * R;
            lumps.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, rad: (0.18 + r() * 0.3) * R, amp: (-0.07 + r() * 0.2) * Ht });
        }
        const a1 = r() * 6.28, a2 = r() * 6.28, a3 = r() * 6.28;
        // мелкая «шерсть» поверхности — сумма синусов с сидом (без внешнего шума)
        const w = [];
        for (let k = 0; k < 6; k++) w.push({ fx: (0.012 + r() * 0.03) * (r() < 0.5 ? -1 : 1), fz: (0.012 + r() * 0.03) * (r() < 0.5 ? -1 : 1), ph: r() * 6.28, amp: 2 + r() * 4 });
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const x = i * cs - this.E, z = j * cs - this.E;
                const d = Math.hypot(x, z), th = Math.atan2(z, x);
                const Reff = R * (1 + 0.055 * Math.sin(3 * th + a1) + 0.035 * Math.sin(5 * th + a2) + 0.02 * Math.sin(8 * th + a3));
                const t = d / Reff;
                let h = 0;
                if (t < 1) {
                    const f = Math.pow(1 - t * t, 1.35);
                    h = Ht * f;
                    const fs = Math.sqrt(f);
                    for (const L of lumps) {
                        const dd = (x - L.x) * (x - L.x) + (z - L.z) * (z - L.z);
                        h += L.amp * Math.exp(-dd / (L.rad * L.rad)) * fs;
                    }
                    let fine = 0;
                    for (const q of w) fine += q.amp * Math.sin(x * q.fx + z * q.fz + q.ph);
                    h += fine * Math.min(1, f * 4);
                }
                this.H0[j * n + i] = Math.max(0, h);
            }
        }
        this.H.set(this.H0);
        let mx = 0;
        for (let k = 0; k < this.H0.length; k++) if (this.H0[k] > mx) mx = this.H0[k];
        this.Hmax = mx;
    }

    _volume(H) {
        let s = 0;
        for (let k = 0; k < H.length; k++) s += H[k];
        return s * this.cs * this.cs;
    }

    /** Высота сена над землёй в точке (билинейно), px. */
    hAt(x, z) { return this._sample(this.H, x, z); }
    h0At(x, z) { return this._sample(this.H0, x, z); }

    _sample(H, x, z) {
        const n = this.n;
        let fx = (x - this.x0) / this.cs, fz = (z - this.z0) / this.cs;
        if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return 0;
        let i = Math.floor(fx), j = Math.floor(fz);
        if (i >= n - 1) i = n - 2;
        if (j >= n - 1) j = n - 2;
        const u = fx - i, v = fz - j, k = j * n + i;
        return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + n] * (1 - u) + H[k + n + 1] * u) * v;
    }

    /** Нормаль поверхности (Babylon: x, y вверх, z) по градиенту поля. */
    normalAt(x, z, out) {
        const e = this.cs;
        const dx = (this.hAt(x + e, z) - this.hAt(x - e, z)) / (2 * e);
        const dz = (this.hAt(x, z + e) - this.hAt(x, z - e)) / (2 * e);
        const l = Math.hypot(dx, 1, dz);
        out.x = -dx / l; out.y = 1 / l; out.z = -dz / l;
        return out;
    }

    /** Высота, на которой стоит игрок радиуса rad: максимум по центру и 4 точкам — в узкие ямки не проваливается. */
    standAt(x, z, rad) {
        const k = rad * 0.7;
        return Math.max(this.hAt(x, z), this.hAt(x + k, z), this.hAt(x - k, z), this.hAt(x, z + k), this.hAt(x, z - k));
    }

    /** Доля разобранного стога 0..1. */
    progress() { return this.V0 > 0 ? Math.max(0, Math.min(1, 1 - this.V / this.V0)) : 0; }

    /** Внутри ли точка габарита стога (быстрая проверка). */
    inside(x, z, pad) {
        return Math.abs(x - this.cx) < this.E + (pad || 0) && Math.abs(z - this.cy) < this.E + (pad || 0);
    }

    /**
     * Луч прицела против поверхности стога. o, d — мировые векторы Babylon (d единичный), maxT — дальность px.
     * @returns {{ x: number, y: number, z: number, t: number } | null}
     */
    raycast(o, d, maxT) {
        const G = this.G, top = G + this.Hmax + 10;
        // отсечь луч ящиком стога
        let t0 = 0, t1 = maxT;
        const lo = [this.x0, G - 5, this.z0], hi = [this.x0 + 2 * this.E, top, this.z0 + 2 * this.E];
        const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
        for (let a = 0; a < 3; a++) {
            if (Math.abs(dd[a]) < 1e-8) { if (oo[a] < lo[a] || oo[a] > hi[a]) return null; continue; }
            let ta = (lo[a] - oo[a]) / dd[a], tb = (hi[a] - oo[a]) / dd[a];
            if (ta > tb) { const s = ta; ta = tb; tb = s; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) return null;
        }
        const step = 4;
        let prev = t0;
        for (let t = t0; t <= t1 + step; t += step) {
            const tt = Math.min(t, t1);
            const px = o.x + d.x * tt, py = o.y + d.y * tt, pz = o.z + d.z * tt;
            const h = this.hAt(px, pz);
            if (h > 0.5 && py <= G + h) {
                let a = prev, b = tt;
                for (let k = 0; k < 8; k++) {
                    const m = (a + b) / 2;
                    const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
                    if (my <= G + this.hAt(mx, mz)) b = m; else a = m;
                }
                return { x: o.x + d.x * b, y: o.y + d.y * b, z: o.z + d.z * b, t: b };
            }
            prev = tt;
            if (tt >= t1) break;
        }
        return null;
    }

    /**
     * Ковш: вынуть сено чашей радиуса r и глубины depth с центром в точке поверхности (x, y мировая, z).
     * opts: { needle: true — игла в ковше считается найденной, collect: true — особые соломинки забираются }.
     * @returns {{ volume: number, specials: string[], needle: boolean }}
     */
    dig(x, y, z, r, depth, opts) {
        const o = opts || {};
        const cs = this.cs, n = this.n, H = this.H;
        const base = y - this.G;
        const r2 = r * 1.8 + cs;
        const res = { volume: 0, specials: /** @type {string[]} */ ([]), treasures: /** @type {number[]} */ ([]), needle: false };
        // кандидаты-находки до ковша (старая высота)
        const cand = [];
        for (const s of this.specials) {
            if (!s.alive) continue;
            const dd = Math.hypot(s.x - x, s.z - z);
            if (dd < r * 1.2 + 6) cand.push({ s, old: this.hAt(s.x, s.z) });
        }
        const tcand = [];
        this.treasures.forEach((t, k) => { if (t.alive && Math.hypot(t.x - x, t.z - z) < r * 1.2 + 22) tcand.push({ t, k, old: this.hAt(t.x, t.z) }); });
        const i0 = Math.max(0, Math.floor((x - r2 - this.x0) / cs)), i1 = Math.min(n - 1, Math.ceil((x + r2 - this.x0) / cs));
        const j0 = Math.max(0, Math.floor((z - r2 - this.z0) / cs)), j1 = Math.min(n - 1, Math.ceil((z + r2 - this.z0) / cs));
        let vol = 0;
        for (let j = j0; j <= j1; j++) {
            const nz = this.z0 + j * cs;
            for (let i = i0; i <= i1; i++) {
                const nx = this.x0 + i * cs;
                const d = Math.hypot(nx - x, nz - z);
                if (d > r2) continue;
                let b = d < r ? base - depth * Math.cos(Math.PI / 2 * d / r) : base + (d - r) * 1.15;
                if (b < 0) b = 0;
                const k = j * n + i;
                if (H[k] > b) { vol += H[k] - b; H[k] = b; }
            }
        }
        this._relax(i0 - 2, i1 + 2, j0 - 2, j1 + 2);
        res.volume = vol * cs * cs;
        this.V = Math.max(0, this.V - res.volume);
        for (const c of cand) {
            const s = c.s, now = this.hAt(s.x, s.z);
            if (s.y > now - 4 && s.y <= c.old + 3) {
                if (o.collect !== false) { s.alive = false; res.specials.push(s.type); }
                else if (s.y > now) s.y = now;
            }
        }
        for (const c of tcand) {
            const t = c.t, now = this.hAt(t.x, t.z);
            if (t.y > now - 12 && t.y <= c.old + 12) { if (o.collect !== false) { t.alive = false; res.treasures.push(c.k); } }
        }
        const nd = this.needle;
        if (nd && !nd.found && o.needle) {
            const dd = Math.hypot(nd.x - x, nd.z - z), now = this.hAt(nd.x, nd.z);
            if (dd < r * 1.15 + 14 && nd.y > now - 10) res.needle = true;
        }
        this.dirty = true;
        this._regionChanged(x, z, r2 + 2 * cs);
        return res;
    }

    // Осыпание: склон круче PILE_SLOPE ссыпается вниз (объём сохраняется) — без отвесных стен.
    _relax(i0, i1, j0, j1) {
        const n = this.n, H = this.H, cs = this.cs;
        const maxd = cs * (typeof PILE_SLOPE !== 'undefined' ? PILE_SLOPE : 1.7);
        i0 = Math.max(1, i0); j0 = Math.max(1, j0); i1 = Math.min(n - 2, i1); j1 = Math.min(n - 2, j1);
        for (let pass = 0; pass < 2; pass++) {
            for (let j = j0; j <= j1; j++) {
                for (let i = i0; i <= i1; i++) {
                    const k = j * n + i;
                    for (const nb of [k + 1, k - 1, k + n, k - n]) {
                        const diff = H[k] - H[nb];
                        if (diff > maxd) { const m = (diff - maxd) * 0.3; H[k] -= m; H[nb] += m; }
                    }
                }
            }
        }
    }

    _placeSpecials(counts) {
        const r = this.rng;
        for (const type of Object.keys(counts)) {
            for (let k = 0; k < counts[type]; k++) {
                for (let tries = 0; tries < 20; tries++) {
                    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * this.R * 0.9;
                    const x = this.cx + Math.cos(a) * d, z = this.cy + Math.sin(a) * d;
                    const h0 = this.h0At(x, z);
                    if (h0 < 18) continue;
                    // чем реже вид, тем глубже лежит
                    const deep = type === 'sunny' ? 0.15 : type === 'copper' ? 0.3 : 0.45;
                    const y = 4 + (h0 - 8) * (deep + r() * (1 - deep)) * (r() < 0.25 ? 1 : 0.8);
                    this.specials.push({ x, z, y: Math.min(h0 - 2, y), type, alive: true, vis: false, ph: r() * 6.28 });
                    break;
                }
            }
        }
    }

    _placeNeedle(depth) {
        const r = this.rng;
        for (let tries = 0; tries < 60; tries++) {
            const a = r() * Math.PI * 2, d = (0.08 + r() * 0.55) * this.R;
            const x = this.cx + Math.cos(a) * d, z = this.cy + Math.sin(a) * d;
            const h0 = this.h0At(x, z);
            if (h0 < 60) continue;
            const f = depth[0] + r() * (depth[1] - depth[0]);
            return { x, z, y: Math.max(22, h0 * (1 - f)), yaw: r() * Math.PI * 2, tilt: (r() - 0.5) * 0.5, found: false };
        }
        return { x: this.cx, z: this.cy, y: this.Htop * 0.5, yaw: 0, tilt: 0, found: false };
    }

    _placeTreasures(count) {
        const r = this.rng, types = GAME_TREASURE_ORDER, total = types.reduce((a, t) => a + GAME_TREASURES[t].weight, 0);
        for (let k = 0; k < count; k++) {
            let u = r() * total, type = types[0];
            for (const t of types) { u -= GAME_TREASURES[t].weight; if (u <= 0) { type = t; break; } }
            for (let tries = 0; tries < 30; tries++) {
                const a = r() * Math.PI * 2, d = Math.sqrt(r()) * this.R * 0.85;
                const x = this.cx + Math.cos(a) * d, z = this.cy + Math.sin(a) * d;
                const h0 = this.h0At(x, z);
                if (h0 < 50) continue;
                // редкие лежат глубже
                const deep = 0.2 + GAME_TREASURES[type].rarity * 0.1;
                this.treasures.push({ x, z, y: Math.max(14, h0 * (1 - deep - r() * (0.85 - deep))), type, alive: true, yaw: r() * 6.28, tilt: (r() - 0.5) * 0.6 });
                break;
            }
        }
    }

    /** Насколько открыто сокровище k: глубина под сеном, px. */
    treasureDepth(k) { const t = this.treasures[k]; return this.hAt(t.x, t.z) - t.y; }

    /** Глубина иглы под поверхностью сена, px (отрицательная — торчит). */
    needleDepth() {
        const nd = this.needle;
        return nd ? this.hAt(nd.x, nd.z) - nd.y : 0;
    }

    // =====================================================================================
    // Сохранение поля: высоты через клетку (байт на узел) + собранные особые соломинки
    // =====================================================================================

    serialize() {
        const n = this.n, m = Math.ceil(n / 2), q = new Uint8Array(m * m);
        const top = Math.max(1, this.Hmax);
        for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
            const k = Math.min(n - 1, j * 2) * n + Math.min(n - 1, i * 2);
            q[j * m + i] = Math.round(Math.max(0, Math.min(1, this.H[k] / top)) * 255);
        }
        const bits = new Uint8Array(Math.ceil(this.specials.length / 8));
        this.specials.forEach((s, k) => { if (!s.alive) bits[k >> 3] |= 1 << (k & 7); });
        const tb = new Uint8Array(Math.ceil(this.treasures.length / 8) || 1);
        this.treasures.forEach((t, k) => { if (!t.alive) tb[k >> 3] |= 1 << (k & 7); });
        return { h: GamePile.b64(q), s: GamePile.b64(bits), t: GamePile.b64(tb), top };
    }

    deserialize(data) {
        if (!data || typeof data.h !== 'string') return;
        try {
            const q = GamePile.unb64(data.h), n = this.n, m = Math.ceil(n / 2);
            if (q.length !== m * m) return;
            const top = data.top || this.Hmax;
            const at = (i, j) => q[Math.min(m - 1, j) * m + Math.min(m - 1, i)] / 255 * top;
            for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
                const fi = i / 2, fj = j / 2, a = Math.floor(fi), b = Math.floor(fj), u = fi - a, v = fj - b;
                const h = (at(a, b) * (1 - u) + at(a + 1, b) * u) * (1 - v) + (at(a, b + 1) * (1 - u) + at(a + 1, b + 1) * u) * v;
                const k = j * n + i;
                this.H[k] = Math.min(this.H0[k], h + 0.5);
            }
            if (typeof data.s === 'string') {
                const bits = GamePile.unb64(data.s);
                this.specials.forEach((s, k) => { if (bits[k >> 3] & (1 << (k & 7))) s.alive = false; });
            }
            if (typeof data.t === 'string') {
                const tb = GamePile.unb64(data.t);
                this.treasures.forEach((t, k) => { if (tb[k >> 3] & (1 << (k & 7))) t.alive = false; });
            }
            this.V = this._volume(this.H);
            this.refreshAll();
        } catch (e) { console.warn('GamePile: сохранение стога не прочитано', e); }
    }

    static b64(u8) {
        let s = '';
        for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(k, k + 0x8000)));
        return btoa(s);
    }
    static unb64(str) {
        const s = atob(str), u8 = new Uint8Array(s.length);
        for (let k = 0; k < s.length; k++) u8[k] = s.charCodeAt(k);
        return u8;
    }

    // =====================================================================================
    // Вид: тело стога
    // =====================================================================================

    static strawTexture(scene) {
        const size = 512;
        const tex = new BABYLON.DynamicTexture('pile-straw-tex', { width: size, height: size }, scene, true);
        const ctx = /** @type {CanvasRenderingContext2D} */ (/** @type {any} */ (tex.getContext()));
        ctx.fillStyle = '#c99a4a';
        ctx.fillRect(0, 0, size, size);
        const r = pileRng(77);
        const layers = [
            { n: 900, cols: ['#a8772f', '#b8843a', '#9a6a2a'], w: [2, 4], l: [30, 80], a: 0.9 },
            { n: 1500, cols: ['#d9ad5c', '#c99a4a', '#e2b866', '#cf9f4c'], w: [1.6, 3.4], l: [26, 70], a: 0.95 },
            { n: 1300, cols: ['#e8c77a', '#f0d68a', '#ecd08a', '#f6e3a8', '#dcb868'], w: [1.2, 2.8], l: [22, 64], a: 1 },
        ];
        ctx.lineCap = 'round';
        for (const L of layers) {
            for (let k = 0; k < L.n; k++) {
                const x = r() * size, y = r() * size, a = r() * Math.PI * 2;
                const len = L.l[0] + r() * (L.l[1] - L.l[0]), w = L.w[0] + r() * (L.w[1] - L.w[0]);
                const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2, bend = (r() - 0.5) * len * 0.25;
                ctx.strokeStyle = L.cols[Math.floor(r() * L.cols.length)];
                ctx.globalAlpha = L.a;
                ctx.lineWidth = w;
                for (let ox = -size; ox <= size; ox += size) for (let oy = -size; oy <= size; oy += size) {
                    if (x + ox < -len || x + ox > size + len || y + oy < -len || y + oy > size + len) continue;
                    ctx.beginPath();
                    ctx.moveTo(x + ox - dx, y + oy - dy);
                    ctx.quadraticCurveTo(x + ox - dy * 0 + bend * Math.sin(a), y + oy + bend * Math.cos(a), x + ox + dx, y + oy + dy);
                    ctx.stroke();
                }
                // блик на соломинке
                if (r() < 0.35) {
                    ctx.strokeStyle = '#fff2c4'; ctx.globalAlpha = 0.45; ctx.lineWidth = Math.max(0.6, w * 0.35);
                    ctx.beginPath(); ctx.moveTo(x - dx * 0.6, y - dy * 0.6); ctx.lineTo(x + dx * 0.4, y + dy * 0.4); ctx.stroke();
                }
            }
        }
        ctx.globalAlpha = 1;
        tex.update(true);
        tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.anisotropicFilteringLevel = 4;
        return tex;
    }

    _buildBody() {
        const scene = this.scene;
        const ms0 = this.quality <= 0 ? 26 : this.quality === 1 ? 20 : 16;
        const m = this.m = Math.round(2 * this.E / ms0) + 1;
        this.ms = 2 * this.E / (m - 1);
        const nv = m * m;
        this._pos = new Float32Array(nv * 3);
        this._nrm = new Float32Array(nv * 3);
        this._col = new Float32Array(nv * 4);
        const uv = new Float32Array(nv * 2);
        const idx = new Uint32Array((m - 1) * (m - 1) * 6);
        let p = 0;
        for (let b = 0; b < m; b++) for (let a = 0; a < m; a++) {
            const x = this.x0 + a * this.ms, z = this.z0 + b * this.ms;
            uv[p * 2] = x / 150; uv[p * 2 + 1] = z / 150;
            p++;
        }
        let q = 0;
        for (let b = 0; b < m - 1; b++) for (let a = 0; a < m - 1; a++) {
            const k = b * m + a;
            idx[q++] = k; idx[q++] = k + m; idx[q++] = k + 1;
            idx[q++] = k + 1; idx[q++] = k + m; idx[q++] = k + m + 1;
        }
        const mesh = new BABYLON.Mesh('pile-body', scene);
        const vd = new BABYLON.VertexData();
        vd.positions = this._pos; vd.normals = this._nrm; vd.uvs = uv; vd.colors = this._col; vd.indices = idx;
        this._fillBody(0, m - 1, 0, m - 1);
        vd.applyToMesh(mesh, true);
        const mat = new BABYLON.StandardMaterial('pile-body-mat', scene);
        mat.diffuseTexture = GamePile.strawTexture(scene);
        mat.specularColor = new BABYLON.Color3(0.08, 0.07, 0.04);
        mat.backFaceCulling = false;
        mesh.material = mat;
        mesh.isPickable = false;
        this.body = mesh;
        World3D.addObject(this.view, mesh, 'prop', { ink: false, outline: false });
        mesh.alwaysSelectAsActiveMesh = true;
    }

    _fillBody(a0, a1, b0, b1) {
        const m = this.m, ms = this.ms, G = this.G, P = this._pos, N = this._nrm, C = this._col;
        for (let b = b0; b <= b1; b++) {
            const z = this.z0 + b * ms;
            for (let a = a0; a <= a1; a++) {
                const x = this.x0 + a * ms, k = b * m + a;
                const h = this.hAt(x, z);
                P[k * 3] = x; P[k * 3 + 1] = G + Math.max(h - 3, -6); P[k * 3 + 2] = z;
                const e = ms;
                const hx1 = this.hAt(x + e, z), hx0 = this.hAt(x - e, z), hz1 = this.hAt(x, z + e), hz0 = this.hAt(x, z - e);
                const dx = (hx1 - hx0) / (2 * e), dz = (hz1 - hz0) / (2 * e), l = Math.hypot(dx, 1, dz);
                N[k * 3] = -dx / l; N[k * 3 + 1] = 1 / l; N[k * 3 + 2] = -dz / l;
                const dug = Math.max(0, Math.min(1, (this.h0At(x, z) - h) / 110));
                const lap = (hx1 + hx0 + hz1 + hz0 - 4 * h) / e;
                let c = (1 - 0.26 * dug) * (1 - Math.max(0, Math.min(0.28, lap * 0.05)));
                const rim = h < 30 ? 0.92 + h / 30 * 0.08 : 1;
                c *= rim;
                C[k * 4] = c; C[k * 4 + 1] = c * (0.98 - 0.07 * dug); C[k * 4 + 2] = c * (0.93 - 0.14 * dug); C[k * 4 + 3] = 1;
            }
        }
    }

    // =====================================================================================
    // Вид: соломинки на поверхности (thin instances)
    // =====================================================================================

    static strawGeometry(name, scene) {
        // трёхгранная соломинка вдоль X (−0.5..0.5), сечение радиуса 0.5, без торцов
        const pos = [], nrm = [], ind = [];
        const ang = [0, 2.094, 4.189];
        for (let f = 0; f < 3; f++) {
            const a0 = ang[f], a1 = ang[(f + 1) % 3], am = (a0 + a1) / 2;
            const y0 = Math.cos(a0) * 0.5, z0 = Math.sin(a0) * 0.5, y1 = Math.cos(a1) * 0.5, z1 = Math.sin(a1) * 0.5;
            // нормаль — почти «вверх» локальной Y (нормаль поверхности стога): соломинка освещена как сено под ней,
            // без тёмных штрихов от граней, отвёрнутых от солнца
            const ny = Math.cos(am), nz = Math.sin(am), b = pos.length / 3;
            pos.push(-0.5, y0, z0, 0.5, y0 * 0.6, z0 * 0.6, 0.5, y1 * 0.6, z1 * 0.6, -0.5, y1, z1);
            const ly = 0.85 + 0.15 * ny, lz = 0.25 * nz, ll = Math.hypot(ly, lz);
            for (let k = 0; k < 4; k++) nrm.push(0, ly / ll, lz / ll);
            ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
        const mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.normals = nrm; vd.indices = ind;
        vd.applyToMesh(mesh, false);
        return mesh;
    }

    _buildStraws() {
        const scene = this.scene, r = pileRng(this.seed * 31 + 5);
        const total = this.quality <= 0 ? 3200 : this.quality === 1 ? 6000 : 9500;
        const mesh = GamePile.strawGeometry('pile-straws', scene);
        const mat = new BABYLON.StandardMaterial('pile-straw-mat', scene);
        mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
        mat.specularColor = new BABYLON.Color3(0.12, 0.1, 0.06);
        mat.backFaceCulling = false;
        mesh.material = mat;
        mesh.isPickable = false;
        const pal = [[0.96, 0.84, 0.52], [0.91, 0.78, 0.47], [0.85, 0.68, 0.36], [0.79, 0.6, 0.29], [0.97, 0.89, 0.64], [0.72, 0.52, 0.24]];
        /** @type {{ x: number, z: number, yaw: number, lift: number, sink: number, len: number, w: number, roll: number, ground: boolean }[]} */
        this.straws = [];
        const R = this.R;
        for (let k = 0; k < total; k++) {
            const skirt = k < total * 0.07;
            const a = r() * Math.PI * 2;
            const d = skirt ? R * (0.95 + r() * 0.4) : Math.sqrt(r()) * R * 1.02;
            const up = r();
            this.straws.push({
                x: this.cx + Math.cos(a) * d, z: this.cy + Math.sin(a) * d, yaw: r() * Math.PI * 2,
                lift: up < 0.12 ? 0.35 + r() * 0.5 : (r() - 0.45) * 0.4, sink: -6 + r() * 7,
                len: 22 + r() * 26, w: 1.5 + r() * 1.2, roll: r() * 6.28, ground: skirt,
            });
        }
        // сортировка по клеткам 64 px — соломинки одной области подряд в буфере
        const B = 64;
        this.straws.sort((p, q) => (Math.floor(p.z / B) - Math.floor(q.z / B)) || (Math.floor(p.x / B) - Math.floor(q.x / B)));
        this._bucket = B;
        /** @type {Map<number, number[]>} */
        this._buckets = new Map();
        this.straws.forEach((s, k) => {
            const key = Math.floor(s.x / B) * 100003 + Math.floor(s.z / B);
            let arr = this._buckets.get(key);
            if (!arr) { arr = []; this._buckets.set(key, arr); }
            arr.push(k);
        });
        this._sm = new Float32Array(total * 16);
        const col = new Float32Array(total * 4);
        for (let k = 0; k < total; k++) {
            const c = pal[Math.floor(r() * pal.length)], v = 0.92 + r() * 0.12;
            col[k * 4] = Math.min(1, c[0] * v); col[k * 4 + 1] = Math.min(1, c[1] * v); col[k * 4 + 2] = Math.min(1, c[2] * v); col[k * 4 + 3] = 1;
        }
        mesh.thinInstanceSetBuffer('matrix', this._sm, 16, false);
        mesh.thinInstanceSetBuffer('color', col, 4, true);
        this.strawMesh = mesh;
        World3D.addObject(this.view, mesh, 'prop', { ink: false, outline: false, castShadow: false });
        mesh.alwaysSelectAsActiveMesh = true;
        this._tmpN = { x: 0, y: 1, z: 0 };
    }

    _seatStraw(k) {
        const s = this.straws[k], M = this._sm, o = k * 16;
        const h = this.hAt(s.x, s.z);
        let nx = 0, ny = 1, nz = 0, y;
        if (s.ground || h < 1.5) {
            y = this.G + 0.8;
            const dx = Math.cos(s.yaw), dz = Math.sin(s.yaw);
            GamePile._basis(M, o, dx, 0.04, dz, 0, 1, 0, s.len, s.w);
        } else {
            const n = this.normalAt(s.x, s.z, this._tmpN);
            nx = n.x; ny = n.y; nz = n.z;
            // касательная: проекция направления yaw на плоскость поверхности + подъём из неё
            let dx = Math.cos(s.yaw), dz = Math.sin(s.yaw), dy = 0;
            const dot = dx * nx + dz * nz;
            dx -= nx * dot; dy -= ny * dot; dz -= nz * dot;
            dx += nx * s.lift; dy += ny * s.lift; dz += nz * s.lift;
            y = this.G + h + s.sink * (s.lift > 0.3 ? 0.4 : 1) + (s.lift > 0.3 ? s.len * 0.25 : 0);
            GamePile._basis(M, o, dx, dy, dz, nx, ny, nz, s.len, s.w);
        }
        M[o + 12] = s.x; M[o + 13] = y; M[o + 14] = s.z; M[o + 15] = 1;
    }

    // Строки матрицы: X = направление×длина, Y = нормаль⊥×толщина, Z = X×Y×толщина.
    static _basis(M, o, dx, dy, dz, ux, uy, uz, len, w) {
        let l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        const dot = ux * dx + uy * dy + uz * dz;
        ux -= dx * dot; uy -= dy * dot; uz -= dz * dot;
        l = Math.hypot(ux, uy, uz) || 1;
        ux /= l; uy /= l; uz /= l;
        const zx = dy * uz - dz * uy, zy = dz * ux - dx * uz, zz = dx * uy - dy * ux;
        M[o] = dx * len; M[o + 1] = dy * len; M[o + 2] = dz * len; M[o + 3] = 0;
        M[o + 4] = ux * w; M[o + 5] = uy * w; M[o + 6] = uz * w; M[o + 7] = 0;
        M[o + 8] = zx * w; M[o + 9] = zy * w; M[o + 10] = zz * w; M[o + 11] = 0;
    }

    // =====================================================================================
    // Вид: особые соломинки и летящие пучки
    // =====================================================================================

    _buildSpecials() {
        const scene = this.scene, cnt = Math.max(1, this.specials.length);
        const mesh = GamePile.strawGeometry('pile-specials', scene);
        const mat = new BABYLON.StandardMaterial('pile-special-mat', scene);
        mat.disableLighting = true;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.backFaceCulling = false;
        mat.metadata = { toon: false };
        mesh.material = mat;
        mesh.isPickable = false;
        this._spm = new Float32Array(cnt * 16);
        const col = new Float32Array(cnt * 4);
        this.specials.forEach((s, k) => {
            const c = BABYLON.Color3.FromHexString((GAME_STRAWS[s.type] || GAME_STRAWS.sunny).color);
            col[k * 4] = c.r; col[k * 4 + 1] = c.g; col[k * 4 + 2] = c.b; col[k * 4 + 3] = 1;
        });
        mesh.thinInstanceSetBuffer('matrix', this._spm, 16, false);
        mesh.thinInstanceSetBuffer('color', col, 4, true);
        mesh.alwaysSelectAsActiveMesh = true;
        this.specialMesh = mesh;
        World3D.addObject(this.view, mesh, 'prop', { ink: false, outline: false, castShadow: false, receiveShadows: false });
    }

    _seatSpecial(k, t) {
        const s = this.specials[k], M = this._spm, o = k * 16;
        const h = this.hAt(s.x, s.z);
        s.vis = s.alive && s.y >= h - 7;
        if (s.alive && s.y > h + 1) s.y = h + 1;     // опора ушла — соломинка ложится на поверхность
        if (!s.vis) { M.fill(0, o, o + 16); return; }
        const pulse = 1 + 0.18 * Math.sin(t * 4.5 + s.ph);
        const dx = Math.cos(s.ph * 3), dz = Math.sin(s.ph * 3);
        GamePile._basis(M, o, dx, 0.35, dz, 0, 1, 0, 42 * pulse, 3.6 * pulse);
        M[o + 12] = s.x; M[o + 13] = this.G + Math.max(s.y, h - 4) + 6; M[o + 14] = s.z; M[o + 15] = 1;
    }

    /** Видимые особые соломинки (для искр и подсказок). */
    visibleSpecials() { return this.specials.filter(s => s.alive && s.vis); }

    _buildFlyers() {
        const cnt = 140;
        const mesh = GamePile.strawGeometry('pile-flyers', this.scene);
        mesh.material = this.strawMesh.material;
        mesh.isPickable = false;
        this._fm = new Float32Array(cnt * 16);
        const col = new Float32Array(cnt * 4);
        for (let k = 0; k < cnt; k++) { const v = 0.85 + (k % 7) * 0.025; col[k * 4] = 0.95 * v; col[k * 4 + 1] = 0.8 * v; col[k * 4 + 2] = 0.48 * v; col[k * 4 + 3] = 1; }
        mesh.thinInstanceSetBuffer('matrix', this._fm, 16, false);
        mesh.thinInstanceSetBuffer('color', col, 4, true);
        mesh.alwaysSelectAsActiveMesh = true;
        this.flyMesh = mesh;
        World3D.addObject(this.view, mesh, 'prop', { ink: false, outline: false, castShadow: false, receiveShadows: false });
        /** @type {{ x: number, y: number, z: number, vx: number, vy: number, vz: number, a: number, b: number, life: number, max: number, len: number, tx?: number, ty?: number, tz?: number }[]} */
        this.flyers = [];
        this._flyCap = cnt;
    }

    /**
     * Вылет соломинок из точки ковша. to — куда летят (точка у руки/камеры) или null — разлёт.
     */
    burst(x, y, z, count, to, spread) {
        const r = Math.random;
        for (let k = 0; k < count; k++) {
            if (this.flyers.length >= this._flyCap) this.flyers.shift();
            const sp = spread || 1;
            const f = {
                x: x + (r() - 0.5) * 20 * sp, y: y + r() * 6, z: z + (r() - 0.5) * 20 * sp,
                vx: (r() - 0.5) * 260 * sp, vy: 160 + r() * 260 * sp, vz: (r() - 0.5) * 260 * sp,
                a: r() * 6.28, b: (r() - 0.5) * 18, life: 0, max: to ? 0.42 + r() * 0.18 : 0.6 + r() * 0.7, len: 20 + r() * 26,
            };
            if (to) { f.tx = to.x; f.ty = to.y; f.tz = to.z; }
            this.flyers.push(f);
        }
    }

    // =====================================================================================
    // Обновление вида
    // =====================================================================================

    _regionChanged(x, z, rad) {
        const m = this.m, ms = this.ms;
        const a0 = Math.max(0, Math.floor((x - rad - this.x0) / ms) - 1), a1 = Math.min(m - 1, Math.ceil((x + rad - this.x0) / ms) + 1);
        const b0 = Math.max(0, Math.floor((z - rad - this.z0) / ms) - 1), b1 = Math.min(m - 1, Math.ceil((z + rad - this.z0) / ms) + 1);
        this._fillBody(a0, a1, b0, b1);
        this._bodyDirty = true;
        const B = this._bucket;
        for (let bx = Math.floor((x - rad - 50) / B); bx <= Math.floor((x + rad + 50) / B); bx++) {
            for (let bz = Math.floor((z - rad - 50) / B); bz <= Math.floor((z + rad + 50) / B); bz++) {
                const arr = this._buckets.get(bx * 100003 + bz);
                if (!arr) continue;
                for (const k of arr) this._seatStraw(k);
            }
        }
        this._strawDirty = true;
        this._specialsDirty = true;
    }

    refreshAll() {
        this._fillBody(0, this.m - 1, 0, this.m - 1);
        this._bodyDirty = true;
        for (let k = 0; k < this.straws.length; k++) this._seatStraw(k);
        this._strawDirty = true;
        this._specialsDirty = true;
    }

    update(dt) {
        this.time += dt;
        if (this._bodyDirty && this.body) {
            this.body.updateVerticesData(BABYLON.VertexBuffer.PositionKind, this._pos, false, false);
            this.body.updateVerticesData(BABYLON.VertexBuffer.NormalKind, this._nrm, false, false);
            this.body.updateVerticesData(BABYLON.VertexBuffer.ColorKind, this._col, false, false);
            this._bodyDirty = false;
        }
        if (this._strawDirty) { this.strawMesh.thinInstanceBufferUpdated('matrix'); this._strawDirty = false; }
        // особые соломинки пульсируют каждый кадр (их немного)
        for (let k = 0; k < this.specials.length; k++) {
            const s = this.specials[k];
            if (s.vis || this._specialsDirty) this._seatSpecial(k, this.time);
        }
        this._specialsDirty = false;
        this.specialMesh.thinInstanceBufferUpdated('matrix');
        // летящие пучки
        const F = this._fm;
        F.fill(0);
        for (let k = this.flyers.length - 1; k >= 0; k--) {
            const f = this.flyers[k];
            f.life += dt;
            if (f.life >= f.max) { this.flyers.splice(k, 1); continue; }
            const u = f.life / f.max;
            if (f.tx != null) {
                // к руке: дуга с притяжением
                const pull = Math.min(1, u * u * 2.2);
                f.vy -= 900 * dt;
                f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
                f.x += (f.tx - f.x) * pull * 0.5; f.y += (f.ty - f.y) * pull * 0.5; f.z += (f.tz - f.z) * pull * 0.5;
            } else {
                f.vy -= 900 * dt;
                f.vx *= 1 - dt * 1.5; f.vz *= 1 - dt * 1.5;
                f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
                const g = this.G + this.hAt(f.x, f.z);
                if (f.y < g) { f.y = g; f.vy *= -0.2; f.vx *= 0.5; f.vz *= 0.5; }
            }
            f.a += f.b * dt;
        }
        for (let k = 0; k < this.flyers.length; k++) {
            const f = this.flyers[k], u = f.life / f.max, sc = f.tx != null ? 1 - u * 0.6 : (u > 0.7 ? (1 - u) / 0.3 : 1), o = k * 16;
            GamePile._basis(F, o, Math.cos(f.a), Math.sin(f.a * 0.7) * 0.6, Math.sin(f.a), 0, 1, 0, f.len * sc, 2.2 * sc);
            F[o + 12] = f.x; F[o + 13] = f.y; F[o + 14] = f.z; F[o + 15] = 1;
        }
        this.flyMesh.thinInstanceBufferUpdated('matrix');
    }

    dispose() {
        for (const m of [this.body, this.strawMesh, this.specialMesh, this.flyMesh]) {
            if (!m) continue;
            const mat = m.material;
            World3D.removeObject(this.view, m);
            if (mat && m !== this.flyMesh) mat.dispose(true, true);
        }
        this.body = this.strawMesh = this.specialMesh = this.flyMesh = null;
    }
}
