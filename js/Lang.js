// Lang.js — тексты интерфейса игры (I18N). Все видимые строки — ключами в
// LANG_STRINGS, в коде — Lang.t('ключ', { имя: значение }) с подстановкой {имя},
// в разметке — атрибуты data-t="ключ" (текст), data-t-title, data-t-placeholder
// (Lang.apply() проставляет их после init и смены языка).
//
// Язык — GAME_LANG (Constants.js): сборка ставит ru для Яндекса и en для Playables.
// Видимого переключателя языка нет. LANG_AUTO = 1 — язык платформы (Platform.lang),
// если он есть в словаре. Нет строки в языке — английская, нет и её — сам ключ.
// Новая строка = ключ в ОБОИХ словарях.

const LANG_STRINGS = {
    ru: {
        'loading': 'Загрузка…',
        'loadingScene': 'Готовим первый кадр…',
        'loadingReady': 'Готово',
        'loadingFailed': 'Не удалось загрузить. Попробуйте ещё раз.',
        'loadingRetry': 'Повторить',
        'no3d': '3D недоступен: браузер без WebGL',
        // --- платформа (Pause.js, Platform.js) ---
        'platformPaused': 'Пауза',
        // --- Telegram: предупреждение об ориентации (PlatformTelegram.js) ---
        'orientTitle': 'Поверните устройство',
        'orientHint': 'Игра работает только в горизонтальной ориентации',
        // --- сборка test: тестовое окно рекламы (PlatformTest.js) ---
        'testAdTag': 'ТЕСТОВАЯ РЕКЛАМА',
        'testAdInter': 'Реклама между раундами',
        'testAdInterHint': 'Так игра ведёт себя после двух раундов. Закройте окно, когда будет готово.',
        'testAdRewarded': 'Реклама за награду',
        'testAdHint': 'Дождитесь конца и заберите награду. Крестик — отказ: награды не будет.',
        'testAdWait': 'Подождите: {n} с',
        'testAdClaim': 'Получить награду',
        'testAdClose': 'Закрыть',
        'testAdSkip': 'Закрыть без награды',
    },
    en: {
        'loading': 'Loading…',
        'loadingScene': 'Preparing the first frame…',
        'loadingReady': 'Ready',
        'loadingFailed': 'Loading failed. Please try again.',
        'loadingRetry': 'Retry',
        'no3d': '3D is unavailable: no WebGL in this browser',
        // --- platform (Pause.js, Platform.js) ---
        'platformPaused': 'Paused',
        // --- Telegram: orientation warning (PlatformTelegram.js) ---
        'orientTitle': 'Rotate your device',
        'orientHint': 'The game only works in landscape mode',
        // --- test build: test ad window (PlatformTest.js) ---
        'testAdTag': 'TEST AD',
        'testAdInter': 'Interstitial ad',
        'testAdInterHint': 'This is what the game does after two rounds. Close the window when ready.',
        'testAdRewarded': 'Rewarded ad',
        'testAdHint': 'Wait for the end and claim the reward. The cross declines: no reward.',
        'testAdWait': 'Wait: {n} s',
        'testAdClaim': 'Claim reward',
        'testAdClose': 'Close',
        'testAdSkip': 'Close without reward',
    },
};

/** @satisfies {Record<string, any>} */
const Lang = {
    code: 'ru',

    // platformLang — язык платформы (Platform.lang) или null.
    init(platformLang) {
        const def = typeof GAME_LANG !== 'undefined' ? GAME_LANG : 'ru';
        const auto = typeof LANG_AUTO !== 'undefined' ? LANG_AUTO : 0;
        const p = String(platformLang || '').toLowerCase().split(/[-_]/)[0];
        this.code = auto > 0 && p && LANG_STRINGS[p] ? p : (LANG_STRINGS[def] ? def : 'en');
        document.documentElement.lang = this.code;
    },

    has(key) {
        return !!((LANG_STRINGS[this.code] || {})[key] || LANG_STRINGS.en[key]);
    },

    t(key, params) {
        const s = (LANG_STRINGS[this.code] || {})[key] || LANG_STRINGS.en[key] || key;
        return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
    },

    // Разметка: data-t, data-t-title, data-t-placeholder внутри root.
    apply(root) {
        const r = root || document;
        for (const el of /** @type {NodeListOf<HTMLElement>} */ (r.querySelectorAll('[data-t]'))) el.textContent = this.t(el.dataset.t);
        for (const el of /** @type {NodeListOf<HTMLElement>} */ (r.querySelectorAll('[data-t-title]'))) el.title = this.t(el.dataset.tTitle);
        for (const el of /** @type {NodeListOf<HTMLInputElement>} */ (r.querySelectorAll('[data-t-placeholder]'))) el.placeholder = this.t(el.dataset.tPlaceholder);
    },
};

// --- 1.40: название игры по площадке (отдельный блок: сливать как есть) ---
// GAME_TITLES (Constants.js) = { <сборка>: 'Название' | { ru, en } }. Сборка кладёт запись своей площадки в GAME_TITLE,
// <title> и ключ 'title' статических текстов; здесь тот же ключ получает рантайм: запись для GAME_PLATFORM перекрывает
// 'title' словаря на всех языках (иначе название из Lang.t('title') расходилось бы с <title>). Нет записи — ключ как у игры.
(() => {
    const table = typeof GAME_TITLES !== 'undefined' && GAME_TITLES && typeof GAME_TITLES === 'object' ? GAME_TITLES : null;
    const value = table && typeof GAME_PLATFORM !== 'undefined' ? table[GAME_PLATFORM] : null;
    if (!value) return;
    const text = (s) => (typeof s === 'string' ? s.trim() : '');
    const first = typeof value === 'string' ? text(value) : [value.en].concat(Object.values(value)).map(text).find(Boolean);
    const dict = /** @type {Record<string, Record<string, string>>} */ (LANG_STRINGS);
    for (const code of Object.keys(dict)) {
        const title = typeof value === 'string' ? first : (text(value[code]) || first);
        if (title) dict[code].title = title;
    }
})();
