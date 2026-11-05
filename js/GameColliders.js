// GameColliders.js — фигуры коллизий моделей для Nav (px модели: x вперёд, y = −Y Blender).
// Источник — assets/models/src/colliders-env.json (Blender-скрипты моделей окружения); поверхности walk
// не берутся: пол мастерской 15 см ниже ровной земли двора и ничего не меняет.

/** @type {Record<string, any[]>} */
const GAME_COLLIDERS = {
    'assets/models/nature/barrel.glb': [{ t: 'circle', x: 0, y: 0, r: 36 }],
    'assets/models/nature/bush_autumn.glb': [{ t: 'circle', x: 0, y: 0, r: 55, los: false }],
    'assets/models/nature/crate.glb': [{ t: 'box', x: 0, y: 0, w: 70, d: 70 }],
    'assets/models/nature/fence.glb': [{ t: 'box', x: 0, y: 0, w: 16, d: 264, los: false }],
    'assets/models/nature/hay_bale_round.glb': [{ t: 'box', x: 0, y: 0, w: 130, d: 120 }],
    'assets/models/nature/hay_bale_square.glb': [{ t: 'box', x: 0, y: 0, w: 100, d: 60 }],
    'assets/models/nature/lantern_post.glb': [{ t: 'circle', x: 0, y: 0, r: 12 }],
    'assets/models/nature/pumpkin.glb': [{ t: 'circle', x: 0, y: 0, r: 24 }],
    'assets/models/nature/pumpkin_pile.glb': [{ t: 'circle', x: 5, y: -5, r: 26 }, { t: 'circle', x: -22, y: 27, r: 19 }, { t: 'circle', x: 29, y: 22, r: 14 }],
    'assets/models/nature/rock_a.glb': [{ t: 'circle', x: 3, y: -3, r: 52 }],
    'assets/models/nature/rock_b.glb': [{ t: 'circle', x: 0, y: 0, r: 30 }],
    'assets/models/nature/scarecrow.glb': [{ t: 'circle', x: 0, y: 0, r: 14 }],
    'assets/models/nature/signpost.glb': [{ t: 'circle', x: 0, y: 0, r: 12 }],
    'assets/models/nature/tree_birch_yellow.glb': [{ t: 'circle', x: 0, y: 0, r: 17 }],
    'assets/models/nature/tree_maple_orange.glb': [{ t: 'circle', x: 0, y: 0, r: 22 }],
    'assets/models/nature/tree_maple_red.glb': [{ t: 'circle', x: 0, y: 0, r: 20 }],
    'assets/models/nature/tree_pine.glb': [{ t: 'circle', x: 0, y: 0, r: 24 }],
    'assets/models/nature/wheelbarrow.glb': [{ t: 'box', x: -14, y: 0, w: 194, d: 70 }],
    'assets/models/props/display_stand.glb': [{ t: 'box', x: 0, y: 0, w: 80, d: 80 }],
    'assets/models/props/hay_press.glb': [{ t: 'box', x: 0, y: 0, w: 250, d: 170 }, { t: 'box', x: 200, y: 0, w: 62, d: 90 }, { t: 'box', x: -20, y: -98, w: 130, d: 30 }],
    'assets/models/props/magpie_house.glb': [{ t: 'circle', x: 0, y: 0, r: 30 }],
    'assets/models/props/trophy_shelf.glb': [{ t: 'box', x: 0, y: 0, w: 47, d: 222 }],
    'assets/models/props/upgrade_board.glb': [{ t: 'box', x: -2, y: 0, w: 30, d: 220 }],
    'assets/models/props/windmill.glb': [{ t: 'circle', x: 0, y: 0, r: 242 }],
    'assets/models/props/workshop.glb': [{ t: 'box', x: -290, y: 0, w: 30, d: 900 }, { t: 'box', x: -20, y: -440, w: 560, d: 32 }, { t: 'box', x: -20, y: 440, w: 560, d: 32 }, { t: 'circle', x: 281, y: -442, r: 27 }, { t: 'circle', x: 281, y: 442, r: 27 }],
};
