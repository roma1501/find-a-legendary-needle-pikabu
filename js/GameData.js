// GameData.js — данные игры: инструменты, рюкзаки, предметы мастерской, улучшения, виды соломы,
// легендарные иглы (уровни стогов). Цены и баланс — здесь; тексты — GameLang.js (ключи по id).
// Пути ассетов — литералами: сборщик берёт в архив только то, на что есть такие ссылки.

/**
 * Инструменты захвата. radius/depth — ковш, px; hay — сена за захват (у сеноса — в секунду);
 * cd — перезарядка, с; reach — дальность луча, px. model — инструмент сам по себе (стенд мастерской),
 * fp — вьюмодель от первого лица (рука в рукаве + инструмент, собраны в пространстве камеры).
 */
const GAME_TOOLS = [
    { id: 'hand', price: 0, radius: 26, depth: 20, hay: 3, cd: 0.55, reach: 330,
        model: 'assets/models/items/hand.glb', fp: 'assets/models/items/fp_hand.glb', icon: 'assets/ui/icons/hand.webp' },
    { id: 'rake', price: 40, radius: 38, depth: 24, hay: 5, cd: 0.5, reach: 390,
        model: 'assets/models/items/rake.glb', fp: 'assets/models/items/fp_rake.glb', icon: 'assets/ui/icons/rake.webp' },
    { id: 'pitchfork', price: 260, radius: 48, depth: 32, hay: 8, cd: 0.45, reach: 430,
        model: 'assets/models/items/pitchfork.glb', fp: 'assets/models/items/fp_pitchfork.glb', icon: 'assets/ui/icons/pitchfork.webp' },
    { id: 'trident', price: 1600, radius: 62, depth: 42, hay: 14, cd: 0.4, reach: 470,
        model: 'assets/models/items/trident.glb', fp: 'assets/models/items/fp_trident.glb', icon: 'assets/ui/icons/trident.webp' },
    { id: 'vacuum', price: 6500, radius: 44, depth: 16, hay: 32, cd: 0.1, reach: 760, continuous: true,
        model: 'assets/models/items/vacuum.glb', fp: 'assets/models/items/fp_vacuum.glb', icon: 'assets/ui/icons/vacuum.webp' },
];

/** Рюкзаки: cap — вместимость сена. */
const GAME_PACKS = [
    { id: 'sack', price: 0, cap: 30, model: 'assets/models/items/backpack_sack.glb', icon: 'assets/ui/icons/backpack_sack.webp' },
    { id: 'basket', price: 70, cap: 50, model: 'assets/models/items/backpack_basket.glb', icon: 'assets/ui/icons/backpack_basket.webp' },
    { id: 'leather', price: 380, cap: 85, model: 'assets/models/items/backpack_leather.glb', icon: 'assets/ui/icons/backpack_leather.webp' },
    { id: 'big', price: 1500, cap: 140, model: 'assets/models/items/backpack_big.glb', icon: 'assets/ui/icons/backpack_big.webp' },
    { id: 'giant', price: 5200, cap: 230, model: 'assets/models/items/backpack_giant.glb', icon: 'assets/ui/icons/backpack_giant.webp' },
];

/** Особые предметы мастерской. */
const GAME_GEAR = {
    compass: { price: 20, model: 'assets/models/items/compass.glb', icon: 'assets/ui/icons/compass.webp' },
    firecracker: { price: 650, model: 'assets/models/items/firecracker_kit.glb', icon: 'assets/ui/icons/firecracker_kit.webp' },
    magpie: { model: 'assets/models/items/magpie.glb', icon: 'assets/ui/icons/magpie.webp' },
};

/** Сороки: цена каждой следующей (монеты или самоцветы). */
const GAME_MAGPIE_COSTS = [{ coins: 350 }, { gems: 8 }, { gems: 15 }, { gems: 25 }, { gems: 40 }, { gems: 60 }];

/**
 * Улучшения доски. tab — вкладка; needs — что нужно иметь (иначе вкладка закрыта);
 * cost(lvl) = base · mul^lvl, округлено.
 */
const GAME_UPGRADES = [
    { id: 'size', tab: 'tools', max: 10, base: 30, mul: 1.62, icon: 'assets/ui/grab.webp' },
    { id: 'speed', tab: 'tools', max: 10, base: 25, mul: 1.58, icon: 'assets/ui/speed.webp' },
    { id: 'value', tab: 'tools', max: 12, base: 40, mul: 1.68, icon: 'assets/ui/coin.webp' },
    { id: 'aim', tab: 'seek', needs: 'compass', max: 5, base: 60, mul: 2.0, icon: 'assets/ui/icons/compass.webp' },
    { id: 'glint', tab: 'seek', max: 6, base: 70, mul: 1.9, icon: 'assets/ui/star.webp' },
    { id: 'luck', tab: 'seek', max: 8, base: 90, mul: 1.75, icon: 'assets/ui/icons/straw_sunny.webp' },
    { id: 'wings', tab: 'magpies', needs: 'magpie', max: 8, base: 120, mul: 1.7, icon: 'assets/ui/speed.webp' },
    { id: 'beak', tab: 'magpies', needs: 'magpie', max: 8, base: 150, mul: 1.72, icon: 'assets/ui/icons/straw_common.webp' },
    { id: 'blast', tab: 'boom', needs: 'firecracker', max: 6, base: 300, mul: 1.8, icon: 'assets/ui/icons/firecracker_kit.webp' },
    { id: 'fuse', tab: 'boom', needs: 'firecracker', max: 6, base: 250, mul: 1.75, icon: 'assets/ui/speed.webp' },
];

/** Действие улучшений (уровень → множитель/значение). */
const GAME_UPG = {
    size: l => 1 + 0.11 * l,            // радиус ковша и сено за захват
    speed: l => Math.pow(0.94, l),      // множитель перезарядки
    value: l => 1 + 0.15 * l,           // цена продажи
    aim: l => Math.max(4, 32 - l * 7),  // разброс стрелки компаса, °
    glint: l => 55 + l * 28,            // с какой глубины игла блестит сквозь сено, px
    luck: l => 1 + 0.25 * l,            // особые соломинки: шанс найти в обычном захвате
    wings: l => Math.pow(0.88, l),      // время облёта сороки
    beak: l => 6 + l * 3,               // сено за облёт сороки
    blast: l => 105 + l * 16,           // радиус хлопушки, px
    fuse: l => Math.max(8, 26 - l * 3), // перезарядка хлопушки, с
};

/** Виды соломы: value — монет за штуку, gems — самоцветов, chance — шанс в обычном захвате. */
const GAME_STRAWS = {
    common: { color: '#E8C77A', value: 1, gems: 0, rarity: 0, icon: 'assets/ui/icons/straw_common.webp' },
    sunny: { color: '#FFE36B', value: 4, gems: 0, rarity: 1, chance: 0.012, icon: 'assets/ui/icons/straw_sunny.webp' },
    copper: { color: '#E07A3A', value: 12, gems: 0, rarity: 2, chance: 0.004, icon: 'assets/ui/icons/straw_copper.webp' },
    emerald: { color: '#2FE08A', value: 25, gems: 1, rarity: 3, chance: 0.0015, icon: 'assets/ui/icons/straw_emerald.webp' },
    moon: { color: '#BFD9FF', value: 60, gems: 3, rarity: 4, chance: 0.0005, icon: 'assets/ui/icons/straw_moon.webp' },
    phoenix: { color: '#FF6A2A', value: 200, gems: 8, rarity: 5, chance: 0.00012, icon: 'assets/ui/icons/straw_phoenix.webp' },
};
const GAME_STRAW_ORDER = ['common', 'sunny', 'copper', 'emerald', 'moon', 'phoenix'];

/**
 * Легендарные иглы = уровни стогов. R, H — радиус и высота стога, px; depth — где лежит игла
 * (доля высоты столба сена над ней); specials — особые соломинки в объёме; reward — награда.
 */
const GAME_NEEDLES = [
    { id: 'bronze', R: 640, H: 400, depth: [0.3, 0.5], reward: { coins: 150, gems: 3 }, glow: '#E59A4C', treasures: 6,
        specials: { sunny: 55, copper: 20, emerald: 7, moon: 2, phoenix: 0 },
        model: 'assets/models/items/needle_bronze.glb', icon: 'assets/ui/icons/needle_bronze.webp' },
    { id: 'silver', R: 720, H: 460, depth: [0.34, 0.56], reward: { coins: 400, gems: 5 }, glow: '#CFE6FF', treasures: 7,
        specials: { sunny: 75, copper: 28, emerald: 10, moon: 3, phoenix: 1 },
        model: 'assets/models/items/needle_silver.glb', icon: 'assets/ui/icons/needle_silver.webp' },
    { id: 'gold', R: 790, H: 520, depth: [0.38, 0.62], reward: { coins: 900, gems: 7 }, glow: '#FFD34D', treasures: 8,
        specials: { sunny: 95, copper: 36, emerald: 13, moon: 4, phoenix: 1 },
        model: 'assets/models/items/needle_gold.glb', icon: 'assets/ui/icons/needle_gold.webp' },
    { id: 'emerald', R: 840, H: 570, depth: [0.4, 0.66], reward: { coins: 1700, gems: 9 }, glow: '#3FE08A', treasures: 9,
        specials: { sunny: 110, copper: 42, emerald: 16, moon: 5, phoenix: 1 },
        model: 'assets/models/items/needle_emerald.glb', icon: 'assets/ui/icons/needle_emerald.webp' },
    { id: 'crystal', R: 880, H: 610, depth: [0.42, 0.7], reward: { coins: 2800, gems: 11 }, glow: '#8FE3FF', treasures: 10,
        specials: { sunny: 125, copper: 48, emerald: 18, moon: 6, phoenix: 2 },
        model: 'assets/models/items/needle_crystal.glb', icon: 'assets/ui/icons/needle_crystal.webp' },
    { id: 'ruby', R: 910, H: 650, depth: [0.45, 0.72], reward: { coins: 4300, gems: 13 }, glow: '#FF5A3A', treasures: 10,
        specials: { sunny: 140, copper: 54, emerald: 20, moon: 6, phoenix: 2 },
        model: 'assets/models/items/needle_ruby.glb', icon: 'assets/ui/icons/needle_ruby.webp' },
    { id: 'pearl', R: 930, H: 690, depth: [0.47, 0.75], reward: { coins: 6200, gems: 15 }, glow: '#9FF0E8', treasures: 11,
        specials: { sunny: 155, copper: 60, emerald: 22, moon: 7, phoenix: 2 },
        model: 'assets/models/items/needle_pearl.glb', icon: 'assets/ui/icons/needle_pearl.webp' },
    { id: 'obsidian', R: 950, H: 720, depth: [0.5, 0.78], reward: { coins: 8600, gems: 18 }, glow: '#B07BFF', treasures: 12,
        specials: { sunny: 170, copper: 66, emerald: 24, moon: 8, phoenix: 3 },
        model: 'assets/models/items/needle_obsidian.glb', icon: 'assets/ui/icons/needle_obsidian.webp' },
    { id: 'thunder', R: 970, H: 750, depth: [0.52, 0.8], reward: { coins: 11500, gems: 21 }, glow: '#7FB8FF', treasures: 12,
        specials: { sunny: 185, copper: 72, emerald: 26, moon: 8, phoenix: 3 },
        model: 'assets/models/items/needle_thunder.glb', icon: 'assets/ui/icons/needle_thunder.webp' },
    { id: 'sakura', R: 980, H: 780, depth: [0.54, 0.82], reward: { coins: 15000, gems: 24 }, glow: '#FF9FCB', treasures: 13,
        specials: { sunny: 200, copper: 78, emerald: 28, moon: 9, phoenix: 3 },
        model: 'assets/models/items/needle_sakura.glb', icon: 'assets/ui/icons/needle_sakura.webp' },
    { id: 'prism', R: 990, H: 810, depth: [0.56, 0.84], reward: { coins: 19500, gems: 28 }, glow: '#FFF4C8', treasures: 14,
        specials: { sunny: 215, copper: 84, emerald: 30, moon: 10, phoenix: 4 },
        model: 'assets/models/items/needle_prism.glb', icon: 'assets/ui/icons/needle_prism.webp' },
    { id: 'mythic', R: 1000, H: 850, depth: [0.58, 0.86], reward: { coins: 25000, gems: 32 }, glow: '#C77DFF', treasures: 14,
        specials: { sunny: 230, copper: 90, emerald: 32, moon: 11, phoenix: 4 },
        model: 'assets/models/items/needle_mythic.glb', icon: 'assets/ui/icons/needle_mythic.webp' },
];

/** Уровень стога n (0…): после двенадцатой иглы — мифические стога с растущей наградой. */
function gameLevelDef(n) {
    const k = Math.max(0, n | 0);
    if (k < GAME_NEEDLES.length) return GAME_NEEDLES[k];
    const last = GAME_NEEDLES[GAME_NEEDLES.length - 1], extra = k - GAME_NEEDLES.length + 1;
    const f = Math.pow(1.55, extra);
    return Object.assign({}, last, {
        depth: [0.6, 0.88],
        reward: { coins: Math.round(last.reward.coins * f / 100) * 100, gems: last.reward.gems + extra * 5 },
    });
}

/** Цена улучшения на уровне lvl (красиво округлённая). */
function gameUpgradeCost(u, lvl) {
    const v = u.base * Math.pow(u.mul, lvl);
    const step = v < 100 ? 5 : v < 1000 ? 10 : v < 10000 ? 50 : 100;
    return Math.round(v / step) * step;
}

/**
 * Сокровища стога: лежат в сене, открываются раскопками. coins/gems — награда (растёт с номером стога),
 * weight — как часто попадается, rarity — рамка в коллекции. Модель в мире ×scale (реальные 8–25 см плохо видны).
 */
const GAME_TREASURES = {
    pouch: { coins: 40, gems: 0, rarity: 1, weight: 30, scale: 2.2, model: 'assets/models/items/treasure_pouch.glb', icon: 'assets/ui/icons/treasure_pouch.webp' },
    horseshoe: { coins: 70, gems: 0, rarity: 1, weight: 24, scale: 2.2, model: 'assets/models/items/treasure_horseshoe.glb', icon: 'assets/ui/icons/treasure_horseshoe.webp' },
    watch: { coins: 110, gems: 0, rarity: 2, weight: 16, scale: 2.6, model: 'assets/models/items/treasure_watch.glb', icon: 'assets/ui/icons/treasure_watch.webp' },
    key: { coins: 150, gems: 0, rarity: 2, weight: 14, scale: 2.4, model: 'assets/models/items/treasure_key.glb', icon: 'assets/ui/icons/treasure_key.webp' },
    ring: { coins: 120, gems: 1, rarity: 2, weight: 12, scale: 3.2, model: 'assets/models/items/treasure_ring.glb', icon: 'assets/ui/icons/treasure_ring.webp' },
    thimble: { coins: 180, gems: 1, rarity: 3, weight: 9, scale: 3.4, model: 'assets/models/items/treasure_thimble.glb', icon: 'assets/ui/icons/treasure_thimble.webp' },
    amethyst: { coins: 60, gems: 2, rarity: 3, weight: 9, scale: 2.4, model: 'assets/models/items/treasure_amethyst.glb', icon: 'assets/ui/icons/treasure_amethyst.webp' },
    ruby: { coins: 80, gems: 3, rarity: 4, weight: 6, scale: 2.8, model: 'assets/models/items/treasure_ruby.glb', icon: 'assets/ui/icons/treasure_ruby.webp' },
    sapphire: { coins: 80, gems: 4, rarity: 4, weight: 5, scale: 2.8, model: 'assets/models/items/treasure_sapphire.glb', icon: 'assets/ui/icons/treasure_sapphire.webp' },
    crown: { coins: 600, gems: 6, rarity: 5, weight: 2, scale: 2.4, model: 'assets/models/items/treasure_crown.glb', icon: 'assets/ui/icons/treasure_crown.webp' },
};
const GAME_TREASURE_ORDER = ['pouch', 'horseshoe', 'watch', 'key', 'ring', 'thimble', 'amethyst', 'ruby', 'sapphire', 'crown'];

/** Награда сокровища на стоге level: монеты растут с номером стога. */
function gameTreasureReward(type, level) {
    const d = GAME_TREASURES[type];
    const k = 1 + 0.45 * Math.max(0, level | 0);
    return { coins: Math.round(d.coins * k / 5) * 5, gems: d.gems };
}

/** Слоты полки трофеев (м, оси модели trophy_shelf: x вперёд, y влево, z вверх) — центры подушечек. */
const GAME_TROPHY_SLOTS = [[0.03, 0, 1.29], [0.03, -0.68, 1.29], [0.03, 0.68, 1.29], [0.03, -0.45, 0.67], [0.03, 0.45, 0.67]];

/** Жёрдочки домика сорок (м, оси модели magpie_house). */
const GAME_MAGPIE_PERCHES = [[0, 0, 3.11], [0.35, 0, 2.6], [0, 0.45, 1.99], [0, -0.45, 1.99], [-0.53, 0, 2.3], [0.23, 0, 1.38]];
