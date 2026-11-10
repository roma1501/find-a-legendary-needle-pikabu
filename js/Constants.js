// Constants.js — ВСЕ числа игры на Lory Engine: земля, камера, рендер, звук. Грузится
// ПЕРВЫМ: остальные модули читают эти глобалы. Правит редактор (_utils/editor): сервер
// патчит только строки `const ИМЯ = <число>;` — значения держать числовыми
// литералами (цвета — 0xRRGGBB), формулу редактор не тронет. Карты (размер, рельеф,
// объекты) — в Maps.js.
const ENGINE_NAME = 'Lory Engine';
const ENGINE_VERSION = '1.40';
const GAME_MODE = '3d';              // '3d' | '2d': renderer selected before boot
const WORLD2D_WIDTH = 960;            // logical viewport width (world pixels)
const WORLD2D_HEIGHT = 540;            // logical viewport height
const WORLD2D_PIXEL_RATIO = 2;         // maximum device pixel ratio
const WORLD2D_SMOOTH = 0;              // 1 — сглаживание картинок (мягкая графика), 0 — пиксель-арт
const WORLD2D_LETTERBOX = 0x101923;    // цвет полей вокруг логической сцены (0xRRGGBB)
const LOADING_TIMEOUT_MS = 45000;    // ожидание готовности шейдеров/текстур; при ошибке — повтор
const LOADING_PAINT_MS = 1000;       // ожидание кадра экрана загрузки; кадров нет (скрытая вкладка, фоновый iframe) — дальше по таймеру
const FX_MAX_SYSTEMS = 48;           // одновременно живые слои частиц
const FX_MAX_PARTICLES = 6000;       // общий бюджет ёмкости систем на ПК
const FX_MOBILE_SCALE = 0.55;        // плотность и бюджет частиц на мобильных
const GAME_ID = 'find-a-legendary-needle';          // латиница, цифры, -: имя архива dist/<GAME_ID>-<платформа>-<версия>.zip и ключей сохранений
const GAME_TITLE = 'Найди иголку в стоге сена';     // название игры: заголовок вкладки браузера
const GAME_VERSION = '0.1.2';         // версия билда: ?v= у скриптов (tools/build.mjs) и имя архива
const GAME_PLATFORM = 'pikabu';          // 'web' | 'yandex' | 'playables' | 'playgama' | 'telegram' | 'crazygames' | 'android' | 'test' — сборка ставит свою (build.bat <платформа>)
const GAME_LANG = 'ru';               // язык интерфейса: сборка ставит ru (yandex) или en (playables); Lang.js

// Шим localStorage: в sandbox-iframe и при запрете данных сайта прямой доступ бросает SecurityError.
// Все обращения к хранилищу — только через Store.
/** @satisfies {Record<string, any>} */
const Store = {
    get(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* нечего удалять */ }
    },
    // Разбор JSON без падения: битое значение = как будто сохранения нет.
    getJSON(key, fallback = null) {
        const raw = Store.get(key);
        if (raw === null) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : fallback;
        } catch (e) {
            console.warn('Store: повреждённое значение "' + key + '", сбрасываю.');
            Store.remove(key);
            return fallback;
        }
    }
};

// Телефон или планшет: user agent, iPad под видом Mac, тач на небольшом экране.
const IS_MOBILE = (() => {
    const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = Math.max(window.innerWidth, window.innerHeight) <= 1366 &&
        Math.min(window.innerWidth, window.innerHeight) <= 1024;
    const isiPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return userAgentMobile || isiPad || (hasTouchScreen && isSmallScreen);
})();

// --- ЗЕМЛЯ (Terrain3D.js). Размер, текстура и рельеф — у каждой карты свои (Maps.js).
// Единицы мира — px: x вправо, y вниз по карте, высота вверх (скилл world3d, §Координаты). ---
const GROUND_TILE_SIZE = 512;           // px мира на один повтор текстуры земли
const TERRAIN_CELL = 8;                 // px: шаг сетки террейна (мобильные — не мельче 12)

// ============================================================================
// 1.40 — МИР И СБОРКА (отдельный блок: сливать как есть).
// TERRAIN_MAX_CELLS — число, его крутит редактор. GAME_GROUNDS и GAME_TITLES — ДАННЫЕ ИГРЫ: чистые
// литералы (без формул и переменных — их читает и сборка, и редактор), правятся руками, редактор их не трогает.
// ============================================================================
const TERRAIN_MAX_CELLS = 250000;       // узлов сетки земли не больше: у огромной карты шаг сетки растёт сам (TERRAIN_CELL — нижний предел шага)

// Свои текстуры земли поверх трёх встроенных (0 трава, 1 песок, 2 снег). Элемент i — земля с номером 3 + i
// (map.ground в Maps.js): добавлять только В КОНЕЦ, иначе карты поедут. Поля: url — путь ЛИТЕРАЛОМ от корня игры
// (сборка берёт в архив только ассеты с такими ссылками), type — тип земли для groundTypeAt (по умолчанию
// 'grass'), ru / en — название в списке редактора (по умолчанию «земля N»). Запись: url — путь к ground_ice.jpg
// в папке assets (в кавычках; здесь без них — сканер сборщика читает и комментарии), type 'ice', ru «лёд», en 'ice'.
/** @type {Array<{ url: string, type?: string, ru?: string, en?: string }>} */
const GAME_GROUNDS = [
    { url: 'assets/textures/ground_autumn.jpg', type: 'grass', ru: 'осенний луг', en: 'autumn meadow' },
];

// Название игры по площадке (ключ — имя сборки: 'yandex', 'playables', 'playgama', 'telegram', 'crazygames', 'android',
// 'test', 'web'): сборка ставит его в GAME_TITLE, <title> и ключ Lang 'title'. Значение — строка на все языки или
// { ru: '…', en: '…' }. Нет ключа — название не меняется. Пример: { playables: 'My Game: Playables Edition' }.
/** @type {Record<string, string | { ru?: string, en?: string }>} */
const GAME_TITLES = { pikabu: 'Найди иголку в стоге сена' };   // Пикабу Игры: в названии нельзя иностранные слова

// --- ЗВУК (Sound.js): громкость 0..1; выключенный звук игрок сохраняет сам (Store) ---
const SOUND_VOLUME = 0.8;               // эффекты
const MUSIC_VOLUME = 0.5;               // музыка

// --- ИГРА: игрок от первого лица и стог (GamePlayer.js, GamePile.js); px мира, секунды ---
const FP_EYE_HEIGHT = 165;              // высота глаз над ногами
const FP_RADIUS = 30;                   // радиус игрока для стен и стволов (Nav)
const FP_WALK_SPEED = 430;              // шаг, px/с
const FP_SPRINT_SPEED = 680;            // бег (Shift), px/с
const FP_JUMP_SPEED = 560;              // скорость прыжка вверх
const FP_GRAVITY = 1700;                // падение, px/с²
const FP_STEP = 55;                     // ступенька, на которую шагаем без карабканья
const FP_CLIMB_SPEED = 340;             // карабканье по стене сена, px/с
const FP_MOUSE_SENS = 0.0022;           // рад на px мыши (множитель — настройка игрока)
const FP_FOV_DEG = 70;                  // вертикальный угол обзора (в портрете шире сам)
const PILE_CELL = 10;                   // шаг поля высот стога, px (логика)
const PILE_SLOPE = 1.7;                 // осыпание: склон круче (высота на клетку) ссыпается
const VAC_TRIAL_AT_SEC = 300;           // подарок новичку: через столько секунд игры — один раз за игру попробовать Сеносос
const VAC_TRIAL_SEC = 20;               // сколько секунд длится пробный Сеносос
const MENU_INTERSTITIAL = 1;            // 1 — в сборке Playables межстраничная реклама на каждой кнопке меню и окон вне игрового процесса, 0 — выкл.

// --- ЯЗЫК (Lang.js) ---
const LANG_AUTO = 0;                    // 1 — язык платформы, если он есть в словаре; 0 — всегда GAME_LANG

// --- ПЛАТФОРМА И ТЕЛЕМЕТРИЯ (Platform.js, Telemetry.js) ---
const PLATFORM_SAVE_GZIP_MIN = 32768;   // знаков JSON сохранения, с которых облачная запись сжимается gzip (0 — не сжимать)
const TELEMETRY_WINDOW_MS = 30000;      // окно performance_sample: один агрегированный сэмпл примерно за столько мс активной игры
const TELEMETRY_TARGET_FPS = 60;        // целевой FPS игры для сэмпла (target_fps)
const TELEMETRY_MIN_FRAMES = 30;        // меньше кадров в окне — сэмпл не отправляется
const TELEMETRY_MAX_FRAMES = 8192;      // буфер кадров окна: заполнился — окно закрывается раньше
const TELEMETRY_MAX_FRAME_MS = 5000;    // кадр дольше — это разрыв (пауза, фон), а не «застывший кадр»: не считается

// --- ПЛАТФОРМЫ: Telegram Mini App и Android-обёртка (PlatformTelegram.js, PlatformAndroid.js) ---
const TELEGRAM_LANDSCAPE_ONLY = 1;      // Telegram: 1 — игра только альбомная: в портрете поверх всего картинка «Поверните устройство» и пауза; 0 — любая ориентация
const TELEGRAM_BG_COLOR = 0x101c22;     // Telegram: цвет шапки и фона Mini App (0xRRGGBB), как у экрана загрузки
const PLATFORM_ANDROID_BRIDGE = 'AndroidAds'; // Android: имя Java-интерфейса нативной обёртки (addJavascriptInterface); строка — редактор её не трогает

// --- КАМЕРА (CameraControl.js): цель на карте, азимут, наклон и зум. Зум —
// экранных px на мировой px в точке взгляда; расстояние выводится из него. ---
const CAMERA_FOV_DEG = 52;              // вертикальный угол обзора
const CAMERA_AZIMUTH_DEG = -90;         // куда смотрит камера по карте: −90 — север вверх, 0 — восток вверх
const CAMERA_PITCH_DEG = 57;            // наклон к земле: 90 — строго сверху, меньше — больше перспективы
const CAMERA_ZOOM = 1;                  // стартовый зум: ПК и планшеты
const CAMERA_ZOOM_MOBILE = 0.7;         // стартовый зум: телефоны (большая сторона экрана < 1024)
const CAMERA_ZOOM_MIN = 0.5;            // дальше колесо и щипок не отводят (ниже — в кадр попадёт край земли)
const CAMERA_ZOOM_MAX = 3;              // ближе не приближают
const CAMERA_ZOOM_WHEEL_STEP = 0.12;    // доля зума за один щелчок колеса
const CAMERA_ZOOM_LERP = 0.18;          // сглаживание зума: доля остатка за кадр
const CAMERA_FOLLOW_LERP = 0.05;        // слежение за объектом (follow): доля остатка за кадр
const CAMERA_PAN_KEY_SPEED = 900;       // WASD и стрелки: экранных px/с
const CAMERA_ORBIT = 1;                 // вращение камеры игроком (ПКМ): 0 — ориентация фиксирована, 1 — можно
const CAMERA_ORBIT_DEG_PER_PX = 0.3;    // градусов поворота на экранный px драга
const CAMERA_ORBIT_PITCH_MIN_DEG = 35;  // ниже к земле не опускается (предел поднимается и сам — край земли не в кадре)
const CAMERA_ORBIT_PITCH_MAX_DEG = 88;  // выше — почти строго сверху

// --- РЕНДЕР (World3D.js): свет, тени, небо, материалы, toon и контур. Читает
// World3D.cfg(), редактор применяет правки к живой сцене. ---
// Солнце одно на весь мир. Азимут — КУДА падает тень по карте (0 — вправо, 90 — вниз).
const WORLD3D_SUN_AZIMUTH_DEG = -58;
const WORLD3D_SUN_ELEVATION_DEG = 24;   // высота солнца над горизонтом
const WORLD3D_SUN_INTENSITY = 0.95;      // сила солнца (с небом в сумме ~1.0 на ровной земле — краска текстуры без изменений)
const WORLD3D_SUN_COLOR = 0xffc98f;     // цвет солнца
const WORLD3D_SKYLIGHT_INTENSITY = 0.64; // рассеянный свет неба (полусферический источник)
const WORLD3D_SKYLIGHT_COLOR = 0xc7b3e6; // цвет света неба (грани, смотрящие вверх)
const WORLD3D_GROUNDLIGHT_COLOR = 0xd8b27c; // подсветка снизу (отражение от земли)
const WORLD3D_SKY_COLOR = 0xf1c39c;     // цвет неба и тумана
const WORLD3D_FOG_DENSITY = 0.000105;    // экспоненциальный туман к горизонту (0 — выключить)
// Тени: один цвет на все (красит toon-плагин, Babylon даёт только видимость солнца)
const WORLD3D_SHADOW_COLOR = 0x4a2a6e;  // цвет тени
const WORLD3D_SHADOW_STRENGTH = 0.42;    // сила тени 0..1: поверхность в тени умножается на смесь белого и цвета тени
const WORLD3D_SHADOW_SOFT = 2;          // край: 0 — жёсткий (под toon), 1..3 — PCF низкое/среднее/высокое (мобильные — не выше 1)
const WORLD3D_SHADOW_MAP = 1024;        // размер карты теней (мобильные — вдвое меньше); правка пересоздаёт карту
const WORLD3D_SHADOW_RADIUS = 1100;      // px: ПРЕДЕЛ полуразмера ортокадра теней; сам кадр ужимается по объектам в кадре
const WORLD3D_SHADOW_BIAS = 0.001;     // смещение глубины против «акне» (полосы тени на освещённых гранях)
const WORLD3D_SHADOW_NORMAL_BIAS = 0.8; // смещение вдоль нормали против «акне» (полосы и «пила» на гранях под острым углом к солнцу), в текселях карты теней сверх радиуса сглаживания края (его прибавляет движок)
// Материалы по группам (блик — доля 0..1, размер — показатель степени: больше — блик мельче)
const WORLD3D_GROUND_SPECULAR = 0;      // блик земли (0 — матовая)
const WORLD3D_GROUND_SPEC_POWER = 1;    // размер блика земли
const WORLD3D_OUTER_TINT = 1;           // яркость земли ЗА краем локации (меньше 1 — граница локации видна)
const WORLD3D_PROP_SPECULAR = 0.04;     // блик окружения (группа 'prop')
const WORLD3D_PROP_SPEC_POWER = 7;     // размер блика окружения
const WORLD3D_ACTOR_SPECULAR = 0;       // блик главных объектов (группа 'actor'); под toon — яркость «зайчика»
const WORLD3D_ACTOR_SPEC_POWER = 23;    // размер блика главных объектов
// Toon-шейдер (LoryToonPlugin): свет всех источников (солнце + небо, с тенью) квантуется в ступени
const WORLD3D_TOON = 1;                 // 1 — toon-затенение и обводка силуэта, 0 — обычное плавное без обводки
const WORLD3D_TOON_BANDS = 4;           // ступеней света (2..6)
const WORLD3D_TOON_SOFT = 0.02;         // мягкость границы ступени (0 — резко, 0.5 — почти плавно)
const WORLD3D_TOON_LOW = 0.6;          // яркость самой тёмной ступени (доля от полной)
const WORLD3D_TOON_GROUND = 1;          // 1 — ступени и на земле, 0 — земля затеняется плавно
const WORLD3D_TOON_SPEC = 0.25;            // сила блика-«зайчика» (0 — без блика)
const WORLD3D_TOON_SPEC_SIZE = 0.075;    // порог блика (меньше — крупнее пятно)
const WORLD3D_TOON_RIM = 0.22;           // светлый ободок по краю силуэта объектов (0 — нет)
const WORLD3D_TOON_RIM_WIDTH = 0.24;    // ширина ободка
// Контур рёбер (EdgesRenderer): рёбра, изломанные круче порога
const WORLD3D_TOON_INK = 0;             // 0 — нет, 1 — главные объекты, 2 — и окружение
const WORLD3D_TOON_INK_WIDTH = 25;      // толщина линии (≈ мировых px × 100; тоньше с удалением камеры)
const WORLD3D_TOON_INK_COLOR = 0x171717; // цвет чернил: контур рёбер и обводка силуэта
const WORLD3D_TOON_INK_ANGLE = 40;      // °: ребро рисуется, если грани изломаны круче
const WORLD3D_TOON_INK_MAX_TRIS = 20000; // часть модели тяжелее (треугольников) — без контура рёбер; 0 — без предела
// Обводка внешнего силуэта: постэффект (HighlightLayer, isStroke), толщина — в экранных px
const WORLD3D_TOON_OUTLINE = 0;         // 0 — нет, 1 — главные объекты, 2 — и окружение (только при WORLD3D_TOON = 1)
const WORLD3D_TOON_OUTLINE_ACTOR_WIDTH = 1.5;   // экранных px: обводка главных объектов
const WORLD3D_TOON_OUTLINE_PROP_WIDTH = 1;  // экранных px: обводка окружения (его в кадре много — тоньше)

// ================================================================================================
// 1.30 · СИСТЕМЫ ИГРЫ (systems-b): магазин косметики (Shop.js), Daily Gift (DailyGift.js), колесо
// фортуны (Wheel.js). Модули опт-ин и чисто логические: цены, награды и секторы — данные игры
// (Shop.init / DailyGift.init / Wheel.init), здесь — лимиты и правила пользователя.
// ================================================================================================
const REWARDED_RETRY_SEC = 4;           // с: после неудачного/закрытого rewarded тот же запрос не повторяется (кнопка «реклама недоступна»)
// Shop.validate(): правило каталога — вкладки, предметы, доля валюты и рекламы
const SHOP_TABS_MIN = 5;                // вкладок в магазине: не меньше
const SHOP_TABS_MAX = 6;                // ...и не больше
const SHOP_ITEMS_MIN = 20;              // предметов во вкладке: не меньше
const SHOP_ITEMS_MAX = 50;              // ...и не больше
const SHOP_COINS_SHARE = 35;            // доля предметов за валюту во вкладке, % (остальные — за рекламу)
const SHOP_SHARE_TOLERANCE = 10;        // допуск доли, процентных пунктов
const SHOP_ADS_MIN = 1;                 // просмотров рекламы на предмет: не меньше
const SHOP_ADS_MAX = 5;                 // ...и не больше
// Daily Gift
const DAILY_CYCLE_DAYS = 7;             // дней в круге (1..6 — награды из данных игры, последний — эксклюзивный скин)
const DAILY_FALLBACK_COINS = 600;       // последний день, когда все эксклюзивные скины уже есть: крупная награда валютой
const DAILY_DUP_COINS = 50;             // предмет награды дня уже есть у игрока — вместо него столько валюты
// Колесо фортуны
const WHEEL_AD_SPINS_PER_DAY = 3;       // дополнительных вращений за рекламу в день (бесплатное — одно в календарный день)
const WHEEL_TURNS = 6;                  // полных оборотов диска до выпавшего сектора
const WHEEL_SPIN_SEC = 5.5;             // рекомендуемая длительность анимации, с (по ней Wheel.pendingSpin().stale)
const WHEEL_LAND_SPREAD = 0.32;         // где внутри сектора встанет указатель: ± доля сектора от его центра (не у самой границы)
const WHEEL_DUP_COINS = 75;             // сектор с уже имеющимся предметом: столько валюты вместо него
// --- Rig.js и Nav.js (world-a): риги и навигация. Ниже — только они ---
const RIG_FADE = 0.15;                  // с: переход между клипами рига по умолчанию (rig.play({ fade }) переопределяет)
const NAV_CELL = 50;                    // px: клетка сетки путей Nav.path (мельче — точнее и дороже)
const NAV_STEP_PX = 12;                 // px: перепад высот, который юнит берёт шагом (ступень), сверх уклона
const NAV_SLOPE = 1.6;                  // допустимый уклон: px высоты на px пути (пандус и арка моста проходимы, стенка помоста — нет)
// ===== 1.30: ВВОД, РАСКЛАДКА HUD, ОБУЧЕНИЕ (systems-a) =====================================
// Модули opt-in: Input.js, HudLayout.js, Tutorial.js. Игра, которая их не зовёт, живёт как в 1.20.
// --- ВВОД (Input.js): мышь, касания, геймпад ---
const INPUT_POINTER_LOCK = 1;           // 1 — в режиме mouse:'lock' захватывать курсор (pointer lock); 0 — всегда ПКМ-драг (iframe без allow-pointer-lock)
const INPUT_LOOK_CLAMP_PX = 200;        // выброс movementX/Y мыши обрезается до этого значения за событие (Chromium при захвате курсора)
const INPUT_MOUSE_LOOK_SCALE = 1;       // множитель взгляда мыши (px мыши -> px взгляда)
const INPUT_TOUCH_LOOK_SCALE = 1.35;    // множитель взгляда свайпом по правой половине экрана
const INPUT_PAD_LOOK_SPEED = 1250;      // px взгляда в секунду при полном отклонении правого стика геймпада
const INPUT_PAD_DEADZONE = 0.2;         // мёртвая зона стиков геймпада (0..1)
const INPUT_STICK_RADIUS = 64;          // экранных px хода сенсорного стика (на маленьком экране — меньше)
const INPUT_STICK_DEADZONE = 0.12;      // мёртвая зона сенсорного стика (0..1)
const INPUT_STICK_ZONE = 0.5;           // касание левее этой доли ширины экрана ведёт стик, правее — взгляд
const INPUT_ACTION_BUTTON_SIZE = 76;    // px: диаметр контекстной кнопки на телефоне

// --- РАСКЛАДКА HUD (HudLayout.js): режимы по размеру окна, поля, зазоры ---
const HUDLAYOUT_MARGIN = 10;            // px: поле от края безопасной области (при масштабе 1)
const HUDLAYOUT_GAP = 8;                // px: зазор между блоками (при масштабе 1)
const HUDLAYOUT_SCALE_MIN = 0.55;       // масштаб блоков не опускается ниже (дальше — переполнение)
const HUDLAYOUT_SCALE_MAX = 1.25;       // и не поднимается выше
const HUDLAYOUT_LOW_HEIGHT = 420;       // альбомное окно ниже этого (640×360, 568×320, iframe с рекламной полосой) — режим low
const HUDLAYOUT_WIDE_HEIGHT = 540;      // альбомное окно выше этого и шире WIDE_WIDTH — режим wide, иначе land
const HUDLAYOUT_WIDE_WIDTH = 820;       // см. WIDE_HEIGHT
const HUDLAYOUT_REFRESH_SEC = 0.3;      // период пересчёта по содержимому (меняется текст, блок показан/скрыт)

// --- ОБУЧЕНИЕ (Tutorial.js) ---
const TUTORIAL_STEP_DELAY = 0.7;        // с: «галочка» после выполненного шага перед следующим
const TUTORIAL_MOVE_SECONDS = 1.2;      // с: шаг-заготовка «идти» — сколько секунд игрок двигается
const TUTORIAL_LOOK_PIXELS = 260;       // px: шаг-заготовка «осмотреться» — сколько взгляда набрать
const TUTORIAL_FINAL_SECONDS = 2.5;     // с: сколько висит финальная фраза после прохождения (0 — без неё)
// ============================================================================================
// --- ЖИВАЯ ВОДА (LiveWater3D.js): волны Герстнера, рябь, берег, плавучесть. Области воды —
// маркеры карты water (круг радиуса scale[0]·100 px, уровень = земля в центре + h) или
// areas игры. Префикс LIVEWATER_, а не WATER_: WATER_* — плоская вода Terrain3D. ---
const LIVEWATER_QUALITY = 0;            // 0 — авто (ПК высокое, телефоны среднее), 1 — низкое, 2 — среднее, 3 — высокое
const LIVEWATER_WAVE_HEIGHT = 10;       // px: высота самой крупной волны (остальные ниже)
const LIVEWATER_WAVE_LENGTH = 1300;     // px: длина самой крупной волны
const LIVEWATER_WAVE_COUNT = 4;         // волн в сумме (1..6; низкое качество — не больше 3)
const LIVEWATER_WAVE_DIR_DEG = 20;      // °: куда бегут крупные волны по карте (0 — вправо, 90 — вниз)
const LIVEWATER_WAVE_SPREAD_DEG = 90;   // °: разброс направлений остальных волн
const LIVEWATER_WAVE_SPEED = 1;         // множитель скорости волн (0 — стоячая вода)
const LIVEWATER_WAVE_FADE = 140;        // px глубины: на меньшей волны затухают к берегу и не лезут на сушу
const LIVEWATER_STEEPNESS = 0.55;       // острота гребней 0..0.95 (выше — заворачиваются петлёй)
const LIVEWATER_RIPPLE_HEIGHT = 26;     // px: высота ряби при единичном всплеске
const LIVEWATER_RIPPLE_SPEED = 680;     // px/с: скорость кругов по воде
const LIVEWATER_RIPPLE_DAMP = 0.986;    // затухание ряби за шаг: ближе к 1 — круги живут дольше
const LIVEWATER_RIPPLE_CELL = 32;       // px: клетка сетки ряби (телефоны и низкое качество — крупнее)
const LIVEWATER_AMBIENT = 1.5;          // случайных капель в секунду (0 — гладь; низкое качество — без капель)
const LIVEWATER_GRID = 160;             // делений меша по большей стороне на высоком качестве (телефоны — ×0.7)
const LIVEWATER_SHALLOW_COLOR = 0x47d6dd; // цвет мелководья
const LIVEWATER_DEEP_COLOR = 0x137fa6;  // цвет глубины
const LIVEWATER_SKY_COLOR = 0x4f9fe8;   // отражение неба: зенит
const LIVEWATER_HORIZON_COLOR = 0xd4f1fd; // отражение неба: у горизонта
const LIVEWATER_FOAM_COLOR = 0xf7fcff;  // цвет пены
const LIVEWATER_DEPTH_FULL = 260;       // px: глубина, на которой вода становится «глубокой» (цвет, прозрачность)
const LIVEWATER_ALPHA_SHALLOW = 0.6;    // непрозрачность у самого берега 0..1 (на глубине — 1)
const LIVEWATER_FOAM = 1;               // сила пены 0..1 (прибой, гребни, рябь); 0 — без пены
const LIVEWATER_FOAM_WIDTH = 70;        // px: ширина прибоя у берега и препятствий
const LIVEWATER_GLINT = 1;              // блик солнца на воде (0 — нет)
const LIVEWATER_TOON = 1;               // 1 — ступени и жёсткая пена, когда включён toon мира; 0 — вода всегда плавная
const LIVEWATER_FLOAT_SPRING = 26;      // плавучесть: жёсткость пружины к поверхности
const LIVEWATER_FLOAT_DAMP = 5;         // плавучесть: затухание качки
const LIVEWATER_FLOAT_MAX = 24;         // плавающих предметов на воду
const LIVEWATER_BUDGET_MS = 2;          // мс на кадр на шаги ряби: исчерпан — оставшиеся шаги пропускаются
// ============================================================================
// 1.30 — МИР (ветка world-b): зоны земли и вода, декор, тени, уровни графики, камера,
// небо. Числа — литералами, редактор правит их (schema.js). Блок целиком — отдельный:
// при слиянии веток сохранить его как есть.
// ============================================================================

// --- ЗЕМЛЯ: зоны, покраска и вода по маркерам карты (Terrain3D.js, скилл world3d) ---
const TERRAIN_ZONE_BLEND = 0.35;        // zone-flat: ширина плавного перехода за кромкой — доля меньшей полуоси (внутри земля ровная)
const TERRAIN_PAINT_TEXEL = 12;         // покраска земли: мировых px на пиксель карты красок (телефоны — вдвое грубее)
const TERRAIN_PAINT_MAX = 2048;         // покраска земли: предел стороны карты красок, px (телефоны — не больше 1024)
const TERRAIN_PAINT_SOFT = 0.3;         // покраска земли: мягкий край — доля меньшей полуоси зоны
const TERRAIN_PAINT_DETAIL = 0.5;       // покраска земли: сколько рисунка тайла травы (по светлоте) остаётся поверх краски, 0..1
const WATER_SHALLOW_COLOR = 0x62dcd8;   // вода: цвет мелководья
const WATER_DEEP_COLOR = 0x2a78d0;      // вода: цвет глубины
const WATER_ALPHA_SHALLOW = 0.42;       // вода: непрозрачность у берега 0..1
const WATER_ALPHA_DEEP = 0.9;           // вода: непрозрачность на глубине 0..1
const WATER_DEPTH_FULL = 260;           // вода: глубина (px), на которой цвет и прозрачность становятся «глубокими»
const WATER_WAVE_SPEED = 1;             // вода: скорость волн и бликов (0 — стоячая)
const WATER_FOAM = 1;                   // вода: пена у берега 0..1

// --- ДЕКОР (Location3D.js): батчинг — игра, opts.batchDecor ---
const DECOR_BATCH_OUTLINE = 0;          // обводка силуэта у инстансов декора: 0 нет (остаётся контур рёбер), 1 только ПК, 2 везде; тон обводки один на меш — вдали видны «призраки» контура

// --- ТЕНИ И ЗЕМЛЯ ПОД TOON (World3D.js) ---
const WORLD3D_SHADOWS = 1;              // 1 — тени есть, 0 — нет (нет прохода карты теней и выборок в шейдерах)
const WORLD3D_SHADOW_CULL = 1;          // 1 — в карту теней рисуются только кастеры, задевающие ортокадр солнца (меньше draw calls), 0 — все
const WORLD3D_SHADOW_CULL_PAD = 160;    // px: запас к кадру теней при отсечении кастеров (мягкий край, смещение по нормали)
const WORLD3D_SHADOW_MIN_SIZE = 4;      // px: меши с радиусом габарита меньше (мелочь) тень не отбрасывают — меньше draw calls; 0 — все
const WORLD3D_TOON_GROUND_BANDS = 0;    // ступеней света на земле (0 — как у объектов): на склонах гор крупные тёмные пятна дробятся на мелкие шаги
const WORLD3D_TOON_GROUND_SOFT = -1;    // мягкость границ ступеней земли (отрицательное — как у объектов)
const WORLD3D_TOON_GROUND_LOW = -1;     // яркость самой тёмной ступени земли: склон, отвёрнутый от солнца, не чернеет (отрицательное — как у объектов)

// --- КАМЕРА (CameraControl.js) ---
const CAMERA_EDGE_GUARD = 1;            // 1 — наклон не такой, чтобы край земли за картой попал в кадр; 0 — можно смотреть в горизонт (вид от третьего лица: край прячут туман и кольцо земли)

// --- УРОВНИ ГРАФИКИ (Quality.js): низкий / средний / высокий. Уровень — по устройству, игрок может выбрать свой (Store) ---
const QUALITY_AUTO = 1;                 // 1 — уровень по устройству (если игрок не выбрал сам), 0 — всегда QUALITY_DEFAULT
const QUALITY_DEFAULT = 2;              // уровень без автоопределения: 0 низкий, 1 средний, 2 высокий
const QUALITY_DECOR_LOW = 0.25;         // доля декора (деревья, кусты из папки декора), которая остаётся: низкий (убирается ~75%)
const QUALITY_DECOR_MEDIUM = 0.5;       // средний (убирается ~50%)
const QUALITY_DECOR_HIGH = 0.7;         // высокий (убирается ~30%)
const QUALITY_SHADOWS_LOW = 0;          // тени: 0 — нет, 1 — облегчённые (карта теней мельче), 2 — полные
const QUALITY_SHADOWS_MEDIUM = 1;
const QUALITY_SHADOWS_HIGH = 2;
const QUALITY_SHADOW_LITE_SCALE = 0.5;  // облегчённые тени: размер карты теней — эта доля от WORLD3D_SHADOW_MAP
const QUALITY_OUTLINE_LOW = 0;          // контур и обводка: 0 — нет, 1 — главные объекты, 2 — как в WORLD3D_TOON_OUTLINE / _INK
const QUALITY_OUTLINE_MEDIUM = 1;
const QUALITY_OUTLINE_HIGH = 2;
const QUALITY_DPR_LOW = 1.25;           // потолок плотности пикселей рендера (пикселей на CSS px): низкий
const QUALITY_DPR_MEDIUM = 1.5;
const QUALITY_DPR_HIGH = 2;
const QUALITY_PIXELS_LOW = 0.55;        // телефоны и планшеты: бюджет кадра, мегапикселей — низкий
const QUALITY_PIXELS_MEDIUM = 0.85;
const QUALITY_PIXELS_HIGH = 1.4;
const QUALITY_SCALE_MIN = 0.87;         // рендер не мельче этой доли CSS-разрешения: ниже картинка мылится

// --- НЕБО И ВРЕМЯ СУТОК (Sky3D.js): день — это константы WORLD3D_SUN_* / _SKY*, ночь и сумерки — отсюда ---
const SKY_CYCLE_SECONDS = 480;          // секунд на сутки; 0 — время стоит на SKY_START_HOUR
const SKY_START_HOUR = 11;              // час суток при запуске (0..24)
const SKY_SUNRISE_HOUR = 6;             // час восхода
const SKY_SUNSET_HOUR = 18;             // час заката
const SKY_TWILIGHT_HOURS = 1.5;         // длительность рассвета и сумерек, часов
const SKY_SUN_SWEEP_DEG = 140;          // на сколько градусов за день поворачивается направление тени
const SKY_SUN_MIN_ELEVATION_DEG = 8;    // высота солнца у горизонта: ниже не опускается (тени не тянутся в бесконечность)
const SKY_MOON_ELEVATION_DEG = 38;      // высота лунного света ночью
const SKY_TWILIGHT_SUN_COLOR = 0xffa464; // цвет света на восходе и закате
const SKY_TWILIGHT_SKY_COLOR = 0xf0a37c; // цвет неба и тумана на восходе и закате
const SKY_NIGHT_SKY_COLOR = 0x0c1630;   // цвет неба и тумана ночью
const SKY_NIGHT_SUN_COLOR = 0xa8b8ea;   // цвет лунного света
const SKY_NIGHT_SUN_INTENSITY = 0.5;    // сила лунного света (у солнца — WORLD3D_SUN_INTENSITY)
const SKY_NIGHT_SKYLIGHT_COLOR = 0x8d9fd6; // цвет света неба ночью
const SKY_NIGHT_SKYLIGHT_INTENSITY = 0.55; // сила света неба ночью (форма предметов должна читаться)
const SKY_NIGHT_GROUNDLIGHT_COLOR = 0x3f4a68; // подсветка снизу ночью
const SKY_NIGHT_SHADOW = 0.5;           // сила тени ночью — доля дневной
const SKY_NIGHT_FOG = 1.6;              // густота тумана ночью — во сколько раз гуще дневной
const SKY_WEATHER_FADE = 6;             // секунд на плавную смену погоды

// ===== 1.40 · ads-ui: реклама и пауза, поле 2:1 на десктопе, варианты звука ===================
// --- РЕКЛАМА И ПАУЗА (Platform.js, Pause.js, Sound.js) ---
const ADS_REWARDED_PAUSE = 0;           // 0 — rewarded НЕ останавливает игру: она идёт дальше, молчит только звук игры (Sound.setAdMuted) до конца ролика; 1 — как в 1.30: пауза 'ad' и на rewarded. Interstitial паузит всегда. Адаптер может переопределить (rewardedNoPause)
const PAUSE_AD_GRACE_MS = 700;          // мс: после рекламы плашку «Пауза» платформы (Playables) показывать, только если пауза площадки держится дольше (SDK снимает её чуть позже конца ролика); 0 — сразу
const REWARDED_COOLDOWN_SEC = 16;       // с: общая пауза между rewarded после УСПЕШНОГО просмотра (Platform.rewardedCooldownLeft; кнопки Shop, DailyGift, Wheel пишут «Через N с»); 0 — без паузы
// --- ПОЛЕ 2:1 НА ДЕСКТОПЕ (ViewCap.js) ---
const VIEWCAP_MODE = 1;                 // 0 — выкл.; 1 — только сборка playgama (требование Playgama); 2 — на любой площадке. На телефонах не действует
const VIEWCAP_RATIO = 2;                // ширина / высота игрового поля не больше этого: шире окно — поле по центру, по бокам фон
// --- ВАРИАНТЫ ЗВУКА (Sound.js): Sound.play([url, url, …]) ---
const SOUND_VARIANT_DETUNE = 0.04;      // ± доля скорости у списка вариантов (живее повторы); 0 — без разброса высоты
const SOUND_VARIANT_VOLUME_JITTER = 0.08; // ± доля громкости у списка вариантов; 0 — без разброса громкости
// ===== конец блока 1.40 ads-ui ================================================================
// ============================================================================================
// 1.40 · ПЕРСОНАЖ (ветка motion): Humanoid.js, MotionMatch.js, CharacterPhysics.js, Ragdoll.js,
// Character.js. Физический блочный человечек: база движений Motion Matching, капсула с прыжком и
// ступенями, рэгдолл. Opt-in: игра, которая этих модулей не зовёт, живёт как раньше. Единицы — px
// мира (1 м = 100 px, рост базового тела 184 px), секунды. Блок отдельный: при слиянии веток
// сохранить как есть. Строки редактора — в конце _utils/editor/schema.js.
// ============================================================================================

// --- БАЗА ДВИЖЕНИЙ И ПОИСК (MotionMatch.js): база синтезируется при загрузке «виртуальным актёром» ---
const MOTION_WALK_SPEED = 140;          // px/с: скорость шага в базе (и желаемая скорость капсулы в режиме walk)
const MOTION_RUN_SPEED = 300;           // px/с: бег
const MOTION_SPRINT_SPEED = 470;        // px/с: спринт
const MOTION_VEL_HALFLIFE = 0.25;       // с: пружина скорости — разгон и торможение (в базе и в капсуле одинаково)
const MOTION_ROT_HALFLIFE = 0.18;       // с: пружина курса — повороты (в базе и в капсуле одинаково)
const MOTION_DB_SECONDS = 200;          // с: длина синтезируемой базы (больше — разнообразнее и дороже по памяти и поиску)
const MOTION_W_FOOT_POS = 0.75;         // веса признаков поиска: положения стоп
const MOTION_W_FOOT_VEL = 1;            // скорости стоп
const MOTION_W_HIP_VEL = 1;             // скорость таза
const MOTION_W_TRAJ_POS = 1.2;          // траектория: положения через 1/3, 2/3 и 1 с
const MOTION_W_TRAJ_DIR = 1.5;          // траектория: курс
const MOTION_SEARCH_INTERVAL = 0.1;     // с: как часто искать лучший кадр базы (резкая смена ввода — сразу)
const MOTION_BLEND_HALFLIFE = 0.1;      // с: инерциализация перехода между кадрами (полупериод затухания смещения)
const MOTION_ADJUST_HALFLIFE = 0.1;     // с: подтяжка анимационного корня к капсуле
const MOTION_ADJUST_RATIO = 0.5;        // подтяжка не больше этой доли собственной скорости корня (ноги не скользят)
const MOTION_MAX_ERROR = 15;            // px (× длина ноги): корень не отходит от капсулы дальше
const MOTION_FOOT_LOCK = 1;             // 1 — опорная стопа «прилипает» к земле, 0 — нет
const MOTION_SECONDARY = 1;             // 1 — «живая» вторичная физика корпуса, головы и рук по ускорениям
const MOTION_LOOK_AT_CAMERA = 1;        // 1 — голова смотрит за камерой (control({ camYaw })); 0 — нет

// --- КАПСУЛА (CharacterPhysics.js) ---
const CHAR_GRAVITY = 1200;              // px/с²: гравитация персонажа, базы движений и рэгдолла
const CHAR_MASS = 70;                   // кг: масса для давления на опору (world.support), ящики игры
const CHAR_STEP_HEIGHT = 22;            // px: ступень, которую капсула берёт без прыжка (растёт с масштабом тела)
const CHAR_TRACTION = 2300;             // px/с²: предел разгона на земле (сцепление)
const CHAR_AIR_CONTROL = 380;           // px/с²: предел разгона в воздухе
const CHAR_JUMP_HEIGHT = 88;            // px: высота прыжка при удержании кнопки
const CHAR_RIDE_SPRING_HZ = 5.5;        // Гц: пружина подвески капсулы над землёй
const CHAR_RIDE_SPRING_DAMPING = 0.75;  // демпфирование подвески (1 — критическое)
const CHAR_MAX_SLOPE_DEG = 48;          // °: круче — не опора, персонаж скользит
const CHAR_COYOTE_TIME = 0.12;          // с: прыжок разрешён ещё столько после схода с края
const CHAR_JUMP_BUFFER = 0.14;          // с: нажатие прыжка запоминается до приземления
const CHAR_RAGDOLL_FALL_SPEED = 1080;   // px/с: приземление быстрее — рэгдолл (HumanoidCharacter)
const CHAR_RAGDOLL_HIT_SPEED = 320;     // px/с: удар быстрее (hero.hit) — рэгдолл
const CHAR_LAND_SOUND_SPEED = 260;      // px/с: приземление быстрее — событие land (звук, пыль)

// --- РЭГДОЛЛ (Ragdoll.js, Character.js): частицы Верле в суставах ---
const RAGDOLL_ITERATIONS = 8;           // итераций связей и столкновений на шаг 1/120 с (больше — жёстче и дороже)
const RAGDOLL_DAMPING = 0.996;          // затухание скорости частиц за шаг
const RAGDOLL_FRICTION = 0.28;          // трение частицы о поверхность 0..1
const RAGDOLL_BOUNCE = 0.15;            // отскок частицы 0..1 (доля нормальной скорости)
const RAGDOLL_STILL_SPEED = 22;         // px/с: средняя скорость частиц ниже этой — тело лежит спокойно
const RAGDOLL_GETUP_DELAY = 1.1;        // с: раньше этого после падения не встаёт
const RAGDOLL_GETUP_MAX = 4.5;          // с: встаёт не позже этого, даже если ещё катится
const RAGDOLL_THUD_IMPACT = 420;        // px/с: касание частиц быстрее — событие thud (звук удара)
// --- КАМЕРА НЕ ЗАСЛОНЯЕТСЯ (CameraSight.js, 1.40): столкновение с геометрией и полупрозрачные заслоны. Оба выключены (опт-ин); работают в игровом режиме, пока камера следует за объектом ---
const CAMERA_COLLIDE = 0;               // 1 — луч от цели к камере укорачивает дистанцию перед твёрдой геометрией (меши с CameraSight.solid или свой camera.sight.query), 0 — камера как в 1.30
const CAMERA_COLLIDE_MARGIN = 40;       // px: запас камеры перед препятствием
const CAMERA_COLLIDE_MIN = 0.2;         // ближе этой доли полной дистанции камеру не подтягивать (иначе окажется в голове героя)
const CAMERA_COLLIDE_RADIUS = 20;       // px: радиус камеры — запрос по умолчанию пускает пучок лучей; 0 — один луч
const CAMERA_COLLIDE_RETURN = 2.5;      // 1/с: скорость возврата камеры после препятствия (подтягивание мгновенное)
const CAMERA_SIGHT_LIFT = 80;           // px: точка взгляда над целью — от неё идёт луч столкновения и линия видимости заслонов
const CAMERA_FADE = 0;                  // 1 — декор (деревья, столбы, арки) между камерой и целью становится полупрозрачным, 0 — нет
const CAMERA_FADE_ALPHA = 0.2;          // непрозрачность заслона: 0 — невидим, 1 — не растворять
const CAMERA_FADE_SEC = 0.25;           // секунд на растворение
const CAMERA_FADE_BACK_SEC = 0.5;       // секунд на возврат, когда заслон ушёл с линии взгляда
const CAMERA_FADE_PAD = 40;             // px: толщина линии взгляда — объект растворяется, если задевает её (отрицательное — только то, что точно закрывает)
const CAMERA_FADE_MAX = 8;              // одновременно растворённых объектов (ближайшие к камере — первыми)
// ============================================================================
// 1.40 — ОББИ (ветка obby): трасса из деталей карты, тело героя, боты-«игроки». Числа — литералами,
// редактор правит их (schema.js). Блок отдельный: при слиянии веток сохранить как есть.
// ============================================================================

// --- ТРАССА: детали карты, чекпоинты, падающие плиты (ObbyCourse.js, ObbyCourseView.js) ---
const OBBY_GRID = 1024;                 // px: клетка сетки поиска коллайдеров
const OBBY_CHUNK = 5000;                // px: участок слияния статичных деталей в пачки (draw calls = участки × материалы)
const OBBY_TILE = 240;                  // px: плитка покрытия на верхней грани деталей
const OBBY_FALL_SHAKE = 0.6;            // с: дрожь падающей плиты после касания (d= в имени детали переопределяет)
const OBBY_FALL_RETURN = 3;             // с: через сколько после начала падения плита возвращается (r= в имени)
const OBBY_FALL_GRAVITY = 2600;         // px/с²: ускорение падающей плиты
const OBBY_RESPAWN_LIFT = 30;           // px: на сколько выше поверхности чекпоинта ставят героя при возрождении
const OBBY_KILL_DEPTH = 1500;           // px: ниже самой низкой опоры трассы - смерть (если на карте нет маркера kill-plane)
const OBBY_BOUNCE_SPEED = 1750;         // px/с: выброс батута jump (v= в имени детали)
const OBBY_BOOST_SPEED = 1100;          // px/с: скорость ускорителя boost (v= в имени детали)

// --- ТЕЛО ГЕРОЯ: бег, прыжок, столкновения с трассой (ObbyBody.js) ---
const OBBY_RUN_SPEED = 620;             // px/с: скорость бега
const OBBY_JUMP_SPEED = 1120;           // px/с: начальная скорость прыжка вверх (высота = v²/2g)
const OBBY_GRAVITY = 3000;              // px/с²: гравитация
const OBBY_FALL_MAX = 2600;             // px/с: предельная скорость падения
const OBBY_RADIUS = 28;                 // px: радиус тела героя
const OBBY_HEIGHT = 180;                // px: рост героя
const OBBY_STEP = 34;                   // px: ступень, на которую герой поднимается без прыжка
const OBBY_ACCEL_GROUND = 9000;         // px/с²: разгон и торможение на земле
const OBBY_ACCEL_AIR = 4200;            // px/с²: управление в воздухе
const OBBY_ACCEL_ICE = 900;             // px/с²: разгон и торможение на льду (плита ice)
const OBBY_COYOTE = 0.1;                // с: прыжок ещё разрешён после схода с края
const OBBY_JUMP_BUFFER = 0.12;          // с: нажатие прыжка запоминается до приземления

// --- БОТЫ: живые на вид игроки (ObbyBots.js, ObbyChat.js) ---
const OBBY_BOTS = 5;                    // ботов на трассе на ПК
const OBBY_BOTS_MOBILE = 3;             // ботов на трассе на телефоне (на низком уровне графики - не больше 3)
const OBBY_BOT_SKILL_MIN = 0.55;        // умение самого слабого бота 0..1 (ошибки в прыжках, рыскание, нетерпение)
const OBBY_BOT_SKILL_MAX = 0.95;        // умение самого сильного бота 0..1
const OBBY_BOT_KNOCK_SPEED = 420;       // px/с: скорость сближения с ботом, быстрее которой игрок его сбивает (медленнее - расталкиваются)
const OBBY_BOT_SIM_DIST = 9000;         // px: дальше от игрока бота не считаем и не рисуем
const OBBY_BOT_LEAVE_DIST = 15000;      // px: бот дальше этого от игрока дольше OBBY_BOT_LEAVE_SEC «выходит», рядом «заходит» новый
const OBBY_BOT_LEAVE_SEC = 6;           // с: сколько бот должен пробыть далеко, чтобы «выйти»
const OBBY_BOT_LIFE_SEC = 240;          // с: среднее время «сессии» бота - потом он выходит, как живой игрок
const OBBY_BOT_SPAWN_SHIELD = 3;        // с: после появления бота сбить нельзя (мигает)
const OBBY_BOT_SKIP_AFTER = 5;          // падений подряд на одном чекпоинте, после которых бот «пропускает этап» (как нетерпеливый игрок)
const OBBY_BOT_CHAT_SEC = 8;            // с: в среднем между репликами ботов в чате (0 - не болтают)
