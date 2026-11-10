// @ts-nocheck
// PikabuPacks.js — наборы за рубли в сборке Пикабу Игр (js/PikabuShop.js). Цены и названия товаров — в Студии
// (каталог CSV: coins_s 19 ₽, coins_m 49 ₽, coins_l 99 ₽, starter 29 ₽, no_ads 59 ₽), здесь — что игрок получает.
// Монеты и самоцветы — save.coins / save.gems (покупки не идут в рекорд stats.earned), инструменты — save.tools.
const PIKABU_GIVE = (coins, gems) => {
    const s = Game.save;
    s.coins = (Number(s.coins) || 0) + coins;
    if (gems) { s.gems = (Number(s.gems) || 0) + gems; s.gemsSeen = true; }
    Game.coinsShown = s.coins;
    Game.persist();
};
PikabuShop.setup({
    colors: ['#f4b400', '#e8710a'],
    ready: () => !!(typeof Game !== 'undefined' && Game.save && Array.isArray(Game.save.tools)),
    visible: () => Game.state === 'menu',
    persist: () => Game.persist(),
    button: { corner: 'tr', x: 12, y: 74 },
    packs: [
        { id: 'coins_s', type: 'consumable', icon: '🪙', name: 'Горсть монет', desc: '1 500 монет на инструменты и рюкзаки', grant: () => PIKABU_GIVE(1500, 0) },
        { id: 'coins_m', type: 'consumable', icon: '💰', name: 'Мешок монет', desc: '5 000 монет и 10 самоцветов', grant: () => PIKABU_GIVE(5000, 10) },
        { id: 'coins_l', type: 'consumable', icon: '💎', name: 'Сундук сокровищ', desc: '12 000 монет и 40 самоцветов', best: true, grant: () => PIKABU_GIVE(12000, 40) },
        {
            id: 'starter', type: 'non_consumable', icon: '🔱', name: 'Набор кладоискателя', best: 'Один раз',
            desc: '2 000 монет, трезубец и компас',
            grant: () => PIKABU_GIVE(2000, 0),
            apply: () => {
                const s = Game.save;
                let changed = false;
                if (!s.tools.includes('trident')) { s.tools.push('trident'); changed = true; }
                if (!s.compass) { s.compass = true; changed = true; }
                if (changed) Game.persist();
            },
        },
        { id: 'no_ads', type: 'non_consumable', icon: '🚫', name: 'Без рекламы', desc: 'Убирает рекламу между поисками навсегда. Награды за рекламу остаются', noAds: true },
    ],
});
