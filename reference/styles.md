# Стили: как устроены и как сделать свой

Стиль — это **данные**, а не код движка. Папка `styles/<имя>/` содержит `style.json` и, по желанию, свой модуль компонентов и CSS. Новый стиль создаётся без правки движка. Пресеты `premium`, `sticker`, `kinetic` — примеры, а не предел; `base` — нейтральная основа, в которой всё нарисовано по токенам.

## Где лежат стили

Порядок поиска (первое совпадение выигрывает):
1. каталоги из переменной `REEL_STYLES` (через `:`);
2. `~/.reels-motion/styles` — свои стили пользователя: обновление скилла их не затирает;
3. `styles/` в папке скилла — пресеты.

`reel.py styles` — список с путями, `reel.py styles --preview` — лист с кадрами каждого стиля (стоп-кадр с плашкой, лид с субтитрами, призыв).

## style.json

```json
{
  "title": "Неон",
  "description": "Тонкие светящиеся линии на тёмном, моноширинный шрифт",
  "extends": "base",                      // от какого стиля наследовать (глубокое слияние)
  "module": "my.js",                      // необязательно: свой модуль компонентов
  "components": {"*": "base", "captions": "premium"},   // кто рисует какой тип элемента
  "extras": ["progress"],                 // постоянные элементы стиля
  "tokens": {…}, "motion": {…}, "captions": {…},
  "camera": {…}, "transitions": {…}, "audio": {…}, "blur": {"sub": 4, "shutter": 0.5}
}
```

### Карта компонентов `components`

Ключ — тип элемента (или `*` — все), значение:
- `"base"` — базовые компоненты, читают токены этого стиля;
- имя стиля с модулем (`"sticker"`, `"premium"`, `"kinetic"`, свой) — компоненты того стиля;
- `"./components/x.js"` — свой файл внутри папки стиля.

Если у выбранного модуля нет нужного типа, берётся запасной (вопрос → хук, сфера → блок, ответ → призыв), а затем базовый компонент. Поэтому у пресета sticker реакции, комментарий и стрелки рисует база — в его токенах.

Типы элементов: `hook`, `question`, `lead`, `block`, `sphere`, `loop`, `list`, `cta`, `answer`, `emotion`, `captions`, `progress`, `counter`, `reaction`, `comment`, `arrow`, `callout`, `sticker`, `accent`.

### Токены `tokens` (их читают базовые компоненты)

| Группа | Ключ | Значение |
|---|---|---|
| `color` | `ink`, `paper`, `accent`, `accent2`, `plate`, `plate_text`, `tag`, `tag_text`, `muted`, `line`, `shadow`, `depth` | любые CSS-цвета |
| `fonts` | `head`, `head_weight`, `body`, `body_weight` | CSS font-family и насыщенность |
| | `faces` | свои шрифты: `[{"family", "url": "/styles/<имя>/файл.ttf", "weight"}]` — файл в папке стиля |
| | `check` | какие начертания обязательно должны загрузиться: `["700 60px MyFont"]` |
| `plate` | `shape` | `rounded`, `pill`, `sticker`, `tag`, `cut`, `glass`, `outline`, `extrude` |
| | `radius`, `padding` `[верт, гор]`, `outline` (белая вырубка, px), `border`, `border_color` | |
| | `shadow`, `glow` | CSS box-shadow |
| | `skew`, `rotate` | наклон подложки тега, поворот плашки |
| | `pointer` | `arrow` (нос к пальцу), `line` (линия от пальца), `none` |
| | `texture` | `none`, `scanlines`, `grid`, `dots` |
| `chip` | `radius`, `fill`, `text`, `dot` | пункты списка |
| `text` | `head_size`, `sub_size`, `tracking`, `case` (`upper` / `as-is`), `accent_mark` (`marker`, `underline`, `box`, `none`) | |
| `reaction` | `size`, `particles`, `palette` | реакции |

### Моушн `motion`

| Ключ | Значения |
|---|---|
| `enter` | `spring`, `pop`, `slide`, `wipe`, `flip`, `fade` |
| `enter_dur`, `exit_dur` | секунды (вход 0,25–0,4, выход 0,12–0,2) |
| `ease_in`, `ease_out` | `outCubic`, `outExpo`, `outQuint`, `inCubic`, `inOutCubic`, `outBack:1.7`, `spring:0.5`, `linear` |
| `exit` | `drop`, `slide`, `shrink`, `fade` |
| `from_scale`, `from_rotate`, `from_y` | откуда приезжает плашка (перелёт даёт кривая) |
| `stagger` | шаг между словами или буквами, с |
| `text_reveal` | `word`, `letter`, `mask`, `none` |
| `idle` | `float` (px), `rotate` (°), `shine_period` (с; 0 — без блика) |

### Остальное

- `captions` — вид и группировка субтитров (`captions.md`).
- `camera` — `punch_scale`, `punch_ease`, `punch_frames`, `punch_lead_f`, `punch_release` (с), `punch_shake` `{amp, frames}`, `shake` (`{"kind": "table" | "sine" | "decay", …}`), `frost` (матовое стекло под полупрозрачными плашками), `interp`.
- `transitions` — `whip` `{at, table: {кадр: [сдвиг px, смаз px]}, min_scale, zoom, post, sfx, gain_db}`, `flash` `{at, color | radial, peak, rise_f, tau, dur | table, sfx}`, `freeze_flash` `{table, color}`. `at` — швы: `block`, `block:0`, `cta`, `answer`, `emotion`.
- `audio` — `voice` (фильтры ffmpeg), `music` `{preset: pad | beat | pulse | none, bpm, level_lu, start}`, `sidechain`, `sfx` (уровни к голосу по типам), `freeze_accent`, `master` `{lufs, tp, limit}` (`sound.md`).
- `blur` — подкадры размытия в движении: `sub`, `shutter`.

## Контракт модуля компонентов

```js
// styles/<имя>/my.js
import { el, prog, ease, E, fit } from '/engine/page/lib.js';      // общие функции (чистые функции от t)
export default {
  name: 'my',
  css: ['my.css'],                 // относительно модуля; правила — внутри .s-<имя модуля>
  fonts: ['900 80px Inter'],       // дождаться загрузки
  defs: '<svg>…</svg>',            // необязательно: SVG-фильтры
  elements: {
    hook(spec, ctx) {              // spec — элемент из plan.json (времена — секунды выхода)
      ctx.sfx(0, 'pop', spec.id);  // звук на кадре появления
      return {
        mount(root) { /* создать DOM один раз */ return { /* состояние */ }; },
        update(st, t) { /* стили от t; вернуть true, если виден */ },
        fast(st, t) { /* true на кадрах входа и выхода — там рендер снимет 4 подкадра */ },
        boxes(st, t) { return [{ el, text }]; },   // рамки текста для qa
      };
    },
  },
};
```

`ctx`: `plan` (весь plan.json), `tokens`, `motion`, `style`, `fps`, `lib`, `sfx(t, тип, слой, {gain_db, dur})`. Правила: никаких `Date`, `Math.random`, CSS-анимаций и `requestAnimationFrame`; случайность — `rng(hash(id))`; `filter: blur` на большие площади не использовать.

## Новый стиль по описанию или референсу — пошагово

1. **Разобрать референс.** Скрин или чужой рилс → выписать: форма плашки, цвета (3–5), шрифт (кириллица!), как появляется текст, есть ли микродвижение, вид субтитров, переходы, звук. По видео — лист кадров (`reel.py probe ролик.mp4 --sheets папка`) и покадрово на появлениях.
2. **Заготовка:** `reel.py style-new <имя> --from base` — style.json со всеми токенами для правки, в `~/.reels-motion/styles/<имя>/` (или `--dir`, тогда добавить папку в `REEL_STYLES`). `--from sticker --keep-components` — оставить компоненты пресета и поменять только звук, камеру и переходы.
3. **Токены:** цвета → `tokens.color`; форма → `tokens.plate.shape`, `radius`, `outline`, `shadow`, `glow`, `texture`; шрифт → `tokens.fonts` (свой файл — в папку стиля и в `fonts.faces`; лицензия должна разрешать встраивание); анимация → `motion`; субтитры → `captions`; удары и переходы → `camera`, `transitions`; звук → `audio`.
4. **Тест:** `reel.py style-test <имя> [--project таймлайн]` — 4 с: стоп-кадр с плашкой, лид, субтитры, призыв; mp4 и лист кадров через 0,25 с. Смотреть кадры глазами, сравнить с референсом, поправить токены, повторить.
5. **Если токенов мало** (особая форма, 3D, необычная анимация) — свой компонент только для этого типа: `"components": {"hook": "./components/hook.js"}`, остальное остаётся базовым.
6. **Показать тест пользователю.** Полный рендер — только после его «ок».

## Смеси

```json
{"title": "Стикеры + чистые субтитры", "extends": "sticker",
 "components": {"*": "sticker", "captions": "premium"}}
```

```json
{"title": "Стекло, но кинетичный призыв", "extends": "premium",
 "components": {"*": "premium", "cta": "kinetic"}}
```

```json
{"title": "Неон-стикеры", "extends": "base",
 "components": {"*": "base", "lead": "sticker", "list": "sticker"},
 "tokens": {"plate": {"shape": "outline", "glow": "0 0 18px #3CFFE1"}}}
```

Камера, переходы и звук берутся у стиля целиком (из `extends` или своих полей). Пресеты рисуют свои элементы своими компонентами: их вид зафиксирован (это принятые ролики), токены пресета используют базовые элементы — реакции, комментарий, стрелки.

## Пресеты

| Стиль | Характер |
|---|---|
| `base` | белая плашка, Inter, мягкая пружина, субтитры pop — нейтральная основа |
| `premium` | тёмное матовое стекло, тонкая светлая обводка, тёплый акцент, контурные цифры 01–03, раскрытие из-под маски, засвет на швах, тонкая полоска прогресса |
| `sticker` | белая вырубка с жёсткой тенью, жёлтый маркер с неровным краем, круглые стикеры-номера, пружины с перелётом, чек-лист лида с галочками |
| `kinetic` | плиты из глубины, двери на петлях, экструзия, красные скошенные теги, счётчик 1/N, кодовое слово по буквам в поле комментария, whip + вспышка на швах |
