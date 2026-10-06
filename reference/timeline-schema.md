# Схема таймлайна

Один JSON на ролик. Описывает **что и когда** показать; **как это выглядит** — решает стиль (`styles.md`). Один и тот же таймлайн рендерится любым стилем: `reel.py render timeline.json --style <имя>`.

`plan` превращает таймлайн в `plan.json`: все якоря — в секунды, к времени прибавлен стоп-кадр, субтитры собраны в карточки, у планов — рамка лица и масштаб. Страница стиля читает только `plan.json`.

## Время

Все времена в таймлайне — **в шкале основы** (смонтированного `base.mov`, без стоп-кадра). Значение времени — одно из:

| Запись | Смысл |
|---|---|
| `3.42` | секунды основы |
| `{"w": 13}` | начало слова №13 из `words.json` (номера — `reel.py words`) |
| `{"word": "франшиза", "occurrence": 1, "edge": "start"}` | слово по тексту (без регистра и пунктуации; от 4 букв — по началу слова) |
| `{"word": "…", "after": 20.0}` | первое такое слово после момента |
| `{"cut": 2}` | первый кадр плана №3 (склейки нумеруются с 0) |
| `"END"` | конец ролика |

К любому якорю-объекту можно добавить `"offset": −0.2` (секунды) и `"offset_f": 2` (кадры), `"edge": "end"` — конец слова.

## Поля

```json
{
  "version": 1,
  "template": "A",                       // "A" | "B" — reference/templates.md
  "fps": 30,
  "base": "work/base.mov",               // пути — относительно файла таймлайна
  "words": "work/words.json",            // [{"w", "start", "end"}] — или формат fal chunks
  "beats": "work/beats.json",            // необязательно: из него берутся cuts и стоп-кадр
  "faces": "work/faces.json",            // reel.py faces
  "cuts": [8.1, 12.767],                 // склейки (начала планов), секунды основы
  "freeze": {"image": "work/freeze.png", "hold": 0.5, "fingertip": [583, 1152]},

  "hook": {"kicker": "ВОТ", "number": "3", "lines": ["ГЛАВНЫЕ", "ПРИЧИНЫ"], "sub": ["почему…", "не…"],
           "end": {"w": 8, "edge": "end"}, "number_at": {"w": 1}, "accent_at": {"w": 7}, "pointer": true},
  "lead": {"title": "3 ПРИЧИНЫ", "end": {"cut": 0},
           "items": [{"qual": "высокий", "term": "ЛЕЙБОР-КОСТ", "dir": "up", "at_qual": {"w": 10}, "at_term": {"w": 11}}]},
  "blocks": [{"num": 1, "term": "ЛЕЙБОР-КОСТ", "expl": ["расходы на персонал"], "start": {"cut": 0}, "end": null}],
  "loops":  [{"text": "Причина №2", "kicker": "ДАЛЬШЕ", "start": {"cut": 2, "offset": -1.45}, "end": {"cut": 2}}],
  "lists":  [{"items": [{"text": "КАТЕГОРИИ", "at": {"w": 97}, "icon": "grid"}], "end": 42.7}],
  "cta":    {"word": "ФРАНШИЗА", "caption": "пиши в комментариях", "caption_at": {"w": 122}, "word_at": {"w": 123}, "start": {"cut": 7}},

  "question": {"lines": ["КАКОЙ СТИЛЬ", "ВЫБРАТЬ?"], "number": "?", "end": 2.0},
  "emotion":  {"words": ["ОГО,", "ЧАСТЫЙ", "ВОПРОС"], "accent": 2, "start": 2.0, "end": {"cut": 0}, "at": [2.0, 2.5, 2.9]},
  "spheres":  [{"num": 1, "name": "ДЕНЬГИ", "text": ["уходят в пустоту"], "start": {"cut": 0}}],
  "answer":   {"text": "СВОЙ СТИЛЬ", "at": {"word": "свой"}, "start": {"word": "ответ"}},

  "elements": [
    {"type": "reaction", "kind": "fire", "at": {"w": 40}, "x": 820, "y": 1000},
    {"type": "comment", "author": "подписчик", "text": "Какой стиль выбрать?", "at": 0, "end": 2.0},
    {"type": "arrow", "from": "tip", "to": [420, 1180], "at": 0.2, "dur": 1.5},
    {"type": "callout", "box": [120, 900, 520, 1100], "label": "вот здесь", "at": 5.0, "dur": 2},
    {"type": "sticker", "text": "НОВОЕ", "at": 7.0, "x": 760, "y": 1000, "rotate": 6, "variant": "accent"},
    {"type": "accent", "text": "НИКОГДА", "at": 9.0, "dur": 1.2},
    {"type": "progress"},
    {"type": "counter"}
  ],

  "camera": {"shot_scale": [1.0, 1.0, 1.065], "punches": [{"at": {"w": 7}, "until": 3.15, "scale": 1.07}], "shake": {"w": 123}},
  "captions": {"accents": [20, "фудкост"], "breaks": [82], "suppress": [[0, {"cut": 0}], [47.45, "END"]], "off": false}
}
```

Комментарии `//` — только для описания, в настоящем JSON их нет.

### Шаблон А

| Поле | Обязательно | Заметки |
|---|---|---|
| `hook` | да | `lines` — крупные строки, последняя с акцентом; `kicker` и `number` — верхняя строка («ВОТ 3»); `sub` — пояснение мельче; `end` — конец хука; `number_at` — когда число подпрыгивает; `accent_at` — когда рисуется подчёркивание пояснения; `pointer: false` — без указателя на палец |
| `lead` | да | пункты появляются на словах `at_qual` и `at_term`; `title` — подпись списка; `end` по умолчанию — начало первого блока |
| `blocks` | да | `expl` — строка или список строк; `end` по умолчанию — начало следующего блока или призыва |
| `loops` | нет | между блоками, 1–2 с |
| `lists` | нет | пункты внутри блока, каждый на своём слове; `icon`: check, heart, globe, phone, grid, tag, gift, star |
| `cta` | да | `start` — шов к призыву (для перехода); подпись на `caption_at`, слово на `word_at` |

### Шаблон Б

`question` (как `hook`), `emotion`, `spheres` (как `blocks`: `name` — сфера, `text` — последствие), `answer`. Вход «ответ на комментарий» — элемент `comment`.

### Свободные элементы `elements`

Тип и параметры; время — `at` (или `start`) и `end` (или `dur`). Вид — из стиля.

| Тип | Параметры | Длительность по умолчанию |
|---|---|---|
| `reaction` | `kind`: fire, wow, like, heart, star, text; `text` для text («ЛАЙК», «ВАУ»); `x`, `y`, `size` | 1,3 с |
| `comment` | `author`, `text`, `label`, `y` | 2,5 с |
| `arrow` | `from`, `to` — точки `[x, y]` или `"tip"` (кончик пальца); `bend`, `width`, `color`, `draw` | 2 с |
| `callout` | `box: [x0, y0, x1, y1]`, `label` | 2,5 с |
| `sticker` | `text`, `x`, `y`, `rotate`, `size`, `variant`: accent, paper, tag | 2 с |
| `accent` | `text` (1–3 слова), `accent` — номер акцентного слова | 1,6 с |
| `progress` | `at`, `end` (по умолчанию от конца хука до конца) | — |
| `counter` | — (номер блока n/N на старте каждого блока) | — |

Стиль может добавлять постоянные элементы сам: `style.json → extras` (premium — полоска прогресса, kinetic — счётчик).

### Камера

- `shot_scale` — масштаб каждого плана (между склейками). Чередование 1,00 / 1,065 маскирует склейку внутри одной локации.
- `punches` — панч-ины: `at`, `until` (по умолчанию — конец плана), `scale` (по умолчанию из стиля).
- `shake` — момент удара (одна тряска на ролик).
- Кривая, длительность, вид тряски, whip и вспышки — в стиле (`camera`, `transitions`).

### Субтитры

`accents` (номера или слова), `breaks` (номера слов, перед которыми рвать), `suppress` (интервалы без субтитров), `off: true` — без субтитров; можно переопределить `max_words`, `max_chars`, `pause`, `lead`, `tail`, `hang`, `split_on_cuts`.

## plan.json

Те же блоки, но времена — секунды выхода (`s`, `e`, `q_t`, `t_t`, `tag_t`, `word_t`), плюс:
`N`, `duration`, `hold`, `hold_f`, `cuts`, `segments` (план: `t0`, `t1`, `med`, `box`, `center`, `scale`), `freeze_face`, `tip`, `freeze_image`,
`words` (`w` — верхний регистр без пунктуации, `raw`, `text`, `s`, `e`, `acc`), `captions` (`s`, `e`, `words`), `captions_suppress`,
`seams` (швы этапов: `kind` block | cta | emotion | answer, `i`, `t`), `camera` (`punches: [[a, b, scale]]`, `shake`), `warnings`.

## EDL для `cut`

Раскладка дублей — отдельный JSON, его описание — в `engine/rm/cut.py`: источники, куски `{src, in, out, stage}`, деление этапа по слову (`splits`), стоп-кадр с кончиком пальца, правки слов (`retime`, `replace`, `override`).
