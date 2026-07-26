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
| `pin: {x, y}` | Прибить узел к абсолютной точке (центр). Не двигается. |
| `rightOf` / `leftOf` / `above` / `below` | Разместить относительно другого узла _(M2)_ |
| `sameRank` | Поставить на тот же уровень (ряд/колонку) _(M2)_ |
| `gap` | Доп. отступ для относительных хинтов _(M2)_ |

Сейчас (M1) работают пины; относительные хинты подключаются в M2 вместе с
полноценным слоистым движком.

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
