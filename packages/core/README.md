# power

Библиотека и CLI для **архитектурных диаграмм в свободном стиле**. Раскладку
задают **связи**: объявляешь коробки, соединяешь их, а движок решает, где что
стоит, и проводит связи **в обход** коробок. Хинты (`rightOf/below/...`) —
ограничения для движка, а не координаты; контейнеры сами обнимают содержимое.
Вывод — SVG.

Фигуры: **приложение** (скруглённый прямоугольник), **база** (вертикальный
цилиндр), **очередь** (горизонтальный цилиндр), простой прямоугольник.
Группировка: **сервис** (акцентный блок с заголовком) и **группа** (рамка).

> **Язык описан в [`LANGUAGE.md`](./LANGUAGE.md)** — это единственный источник
> правды по грамматике, и его же печатает `power spec`. Здесь только пакет:
> установка, программный API и CLI. Живые примеры и playground — на доке-сайте
> (`npm run docs` из корня монорепо).

## Установка

```bash
npm install power
```

ESM-only, типы в комплекте. Node 18.17+. Растр (PNG/JPEG) тянет нативную
зависимость; для SVG её не нужно.

## Из текста

```ts
import { parseArchitecture, toSvg } from "power";
import { readFileSync, writeFileSync } from "node:fs";

const diagram = parseArchitecture(readFileSync("diagram.pwr", "utf8"));
writeFileSync("diagram.svg", toSvg(diagram));
```

`parseArchitecture` бросает `DiagramParseError` с номером строки, колонкой и
самой строкой — этого хватает, чтобы показать каретку под ошибкой.

## Из кода

```ts
import { architecture, toSvg } from "power";

const diagram = architecture()
  .app("gw", "API Gateway")
  .app("oapi", "Orders API")
  .database("odb", "Postgres", { hint: { below: "oapi" } })
  .container("orders", "Orders", {
    kind: "service",
    children: ["oapi", "odb"],
    hint: { below: "gw" },
  })
  .connect("gw", "orders", { label: "http" })
  .build();

writeFileSync("out.svg", toSvg(diagram));
```

Билдер и парсер дают **одну и ту же модель**. Методы: `app` · `database` ·
`queue` · `rect` · `container` · `connect` · `place` · `theme` · `spacing` ·
`margin` · `defineStyle` · `defineIcon` · `build`. Каждый возвращает билдер;
`build()` проверяет ссылки — неизвестный id, узел в двух контейнерах, цикл
вложенности, неизвестный стиль или иконка бросаются здесь, а не рисуются молча.

## Шаги по отдельности

`toSvg` — это три шага, и иногда нужен доступ к среднему:

```ts
const diagram = parseArchitecture(src);
layoutArchitecture(diagram); // проставляет rect/local каждому узлу и path связям
const svg = renderArchitecture(diagram, { themeMode: "selector" });
```

- `layoutArchitecture(diagram, opts?)` — `gap` / `gapX` / `gapY`, `padding`,
  `margin`, `headerH`, `onWarn`. Документ бьёт опции: `@spacing` в исходнике
  сильнее переданного `gap`.
- `renderArchitecture(diagram, opts?)` — `theme` (имя или целый `Theme`),
  `darkTheme`, `themeMode` (`fixed` — одна палитра запечена; `auto` — обе, через
  `prefers-color-scheme`; `selector` — обе, переключаются классом `darkSelector`),
  `background`, `padding`, `fontFamily`, `idPrefix`, `linkAnchors`.
  `@theme(...)` в документе форсирует `fixed`.
- `checkDiagram(src)` — разбор, раскладка и проверки одним вызовом: возвращает
  `{ diagnostics, failed }`, каждая находка со `code`, `line`, `col`, `endCol`.

## Своё превью

Всё, что нужно интерактивному просмотрщику поверх разложенной диаграммы, лежит
в пакете и не требует переизобретения: `nodeAt` / `pickAt` / `linkAt` (хит-тест),
`relationFor` (во что превращается бросок), `setNodeRelation` (построчная правка
исходника), `dropEdgeRect`, `snapToGrid`, `findDeclaration`. На них построены и
playground, и расширение VS Code.

## CLI

```bash
power render <input.pwr> [-o out.svg|png|jpg] [-t light|dark]
power watch  <input.pwr> [-p 4400] [--no-open]
power check  <input.pwr> [--json] [--strict]
power icons  [запрос]
power spec
```

`render` берёт формат из расширения `-o`. `check` пишет находки в stderr, а с
`--json` — структуру в stdout, и читает stdin по `-`. `icons` ищет по слагу,
названию и алиасу. `spec` печатает `LANGUAGE.md`.

## Редактор

`power watch` поднимает живое превью в браузере. В VS Code есть расширение —
[`packages/vscode`](../vscode/README.md): превью рядом с файлом, обновление по
мере набора (без сохранения), проблемы в панели Problems и драг узлов, который
вписывает в исходник, рядом с кем узел оказался.

## Лицензия

MIT
