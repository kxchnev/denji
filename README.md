# power

Библиотека и CLI для диаграмм — альтернатива mermaid.js, в которой **можно
управлять положением элементов**. Главная боль mermaid (авто-раскладка, которой
нельзя рулить) решается гибридным layout: авто по умолчанию, но любой узел можно
прибить пином или задать относительно других.

Типы диаграмм: **flowchart** (готов каркас) и **sequence** (в планах).
Вывод — SVG.

> Статус: ранняя разработка. См. [`TODO.md`](./TODO.md) — план и прогресс.

## Установка

```bash
git clone <repo> && cd power
npm install
```

## Сборка и разработка

```bash
npm run typecheck            # проверка типов
npm run build                # компиляция в dist/
npm test                     # тесты (vitest)
npx tsx examples/basic.ts    # прогнать пример → examples/basic.svg
```

## Использование (программный API)

```ts
import { flowchart, toSvg } from "power";
import { writeFileSync } from "node:fs";

const chart = flowchart("TB")
  .node("A", "Start", { shape: "stadium" })
  .node("B", "Is it ready?", { shape: "diamond" })
  .node("C", "Ship it", { shape: "round" })
  // пин: узел встаёт в заданную точку (центр), авто-раскладка обходит его
  .node("D", "Fix it", { shape: "round", hint: { pin: { x: 320, y: 240 } } })
  .edge("A", "B")
  .edge("B", "C", { label: "yes" })
  .edge("B", "D", { label: "no", style: "dashed" })
  .build();

writeFileSync("out.svg", toSvg(chart));
```

### Управление раскладкой (ядро проекта)

Хинты задаются через `hint` у узла или методом `.place(id, hint)`:

| Хинт | Что делает |
|---|---|
| `pin: {x, y}` | Прибить узел к абсолютной точке (центр). Escape hatch: вне авто-потока. |
| `above` / `below` | Поместить рангом выше/ниже другого узла |
| `rightOf` / `leftOf` | Зафиксировать порядок относительно соседа в том же ранге |
| `sameRank` | Поставить на тот же уровень (ряд/колонку), что и другой узел |
| `gap` | Доп. отступ вокруг узла при раскладке |

Раскладка — слоистый движок в духе dagre (`src/layout/layered/`): узлы разносятся
по рангам, внутри ранга минимизируются пересечения, рёбра идут ортогонально.
Хинты работают как ограничения на соответствующих стадиях. Поддерживаются все
направления: `TB` / `BT` / `LR` / `RL`.

## CLI

```bash
power render diagram.txt -o diagram.svg
```

Парсер DSL появится в M3; сейчас команда подключена, но сообщает, что парсинг
ещё не реализован — используйте программный API.

## Формы узлов

`rect` · `round` · `stadium` · `diamond` · `circle` · `hexagon`

## Лицензия

MIT
