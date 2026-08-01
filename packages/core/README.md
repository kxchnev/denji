# power

Библиотека и CLI для **архитектурных диаграмм в свободном стиле** (не C4).
Фиксит главную боль mermaid — невозможность управлять раскладкой: здесь
позиционирование задаётся **относительными хинтами** (`rightOf/below/...`), а
блоки-контейнеры сами обнимают своё содержимое. Вывод — SVG.

Базовые фигуры: **приложение** (скруглённый прямоугольник), **база данных**
(вертикальный цилиндр), **очередь** (горизонтальный цилиндр), плюс простой
прямоугольник. Группировка: фигуры объединяются в **сервис** (акцентный блок с
заголовком) или **группу** (простой прямоугольник с названием).

> Статус: ранняя разработка.

## Установка

```bash
git clone <repo> && cd power
npm install
```

## Сборка и разработка

```bash
npm run typecheck               # проверка типов
npm run build                   # компиляция в dist/
npm test                        # тесты (vitest)
```

> Живые интерактивные примеры и playground — в доке (`packages/docs`,
> `npm run docs` из корня монорепо).

## Использование (DSL, из текста)

```
architecture
  app gw "API Gateway"

  service orders "Orders" @below(gw) {
    app oapi "Orders API"
    database odb "Postgres" @below(oapi)
  }

  service pay "Payments" @rightOf(orders) {
    app papi "Payments API"
    queue pq "Charges" @below(papi)
  }

  queue bus "Event Bus" @below(orders)

  gw -> orders : http
  gw -> pay : http
  orders -> bus
  pay -> bus
  orders -- pay
```

```bash
power render diagram.pwr -o diagram.svg
# без установки, из packages/core:
npx tsx src/cli.ts render diagram.pwr -o diagram.svg
```

### Синтаксис DSL

- **Заголовок:** `architecture` (опционально), может нести настройки уровня
  диаграммы: `architecture @spacing(60) @margin(40)`.
- **Фигуры:** `<kind> <id> "label" [@hints]`, где kind ∈ `app` · `database` ·
  `queue` · `rect`.
- **Контейнеры:** `service|group <id> "label" [@hints] {` … дети … `}` —
  вложенность блоками (можно вкладывать друг в друга).
- **Связи:** `<id> <op> <id> [: label]`, где op ∈ `->` (стрелка) · `<-` ·
  `<->` (обе) · `--` (линия) · `-.->` / `-.-` (пунктир).
- **@-хинты** раскладки (на фигуре или контейнере): `@rightOf(id)` ·
  `@leftOf(id)` · `@above(id)` · `@below(id)` · `@gap(n)` ·
  `@align(start|center|end)`.
- **@-настройки** расстояний (на `architecture` или контейнере):
  `@spacing(n)` · `@spacingX(n)` · `@spacingY(n)` · `@padding(n)` (только
  контейнер) · `@margin(n)` (только `architecture`).
- **Комментарии:** строки на `#` или `%%`.

## Использование (программный API)

```ts
import { architecture, toSvg } from "power";
import { writeFileSync } from "node:fs";

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

### Управление раскладкой (ядро проекта)

Позиционирование — **только относительное**: каждый узел ставится относительно
соседа, контейнеры авто-подгоняются под содержимое.

| Хинт | Что делает |
|---|---|
| `rightOf` / `leftOf` | Разместить справа/слева от узла |
| `above` / `below` | Разместить выше/ниже узла |
| `gap` | Расстояние до своего якоря (замещает `spacing` по этой оси) |
| `align` | Выравнивание по поперечной оси (`start`/`center`/`end`) |

Одна ось-связь задаёт и выравнивание по другой оси. Узел без хинтов встаёт
справа от предыдущего сиблинга.

### Расстояния

`@gap` — про **один узел** и его якорь. Настройки ниже — про **область**
(`architecture` или контейнер) и расстояния **между её детьми**; они наследуются
внутрь, пока вложенный контейнер их не переопределит.

| Настройка | Где | По умолчанию | Что делает |
|---|---|---|---|
| `spacing` | `architecture`, контейнер | 40 | Зазор между сиблингами, обе оси |
| `spacingX` / `spacingY` | `architecture`, контейнер | 40 | То же по одной оси, уточняет `spacing` |
| `padding` | контейнер | 24 | Отступ от рамки контейнера до детей |
| `margin` | `architecture` | 24 | Поля вокруг всего рисунка |

```
architecture @spacingX(120) @spacingY(16) @margin(40)

  app gw "Gateway"

  service orders "Orders" @spacing(64) @padding(32) {
    app api "API"
    database db "PG" @below(api) @gap(80)
  }
```

Те же значения есть и в программном API: `.spacing({ x, y })` / `.margin(n)` на
билдере, `spacing` / `padding` в опциях `container()`, а `ArchLayoutOptions`
(`gap`, `gapX`, `gapY`, `padding`, `headerH`, `margin`) задаёт дефолты со
стороны вызывающего — **написанное в документе важнее**.

## Связи

`connect(from, to, { dir })`, где `dir` ∈ `to` (по умолчанию) · `from` · `both`
· `none`. Стрелка на каждом конце независима. Концом связи может быть и
контейнер.

## CLI

```bash
power render <input.pwr> [-o output.svg]
```

Читает `.pwr`-файл, раскладывает и пишет SVG (по умолчанию — `<input>.svg`).
Ошибки парсинга печатаются с номером строки и указателем.

## Лицензия

MIT
