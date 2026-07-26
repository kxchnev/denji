# power

Библиотека + CLI для **архитектурных диаграмм в свободном стиле** (не C4) с
**управляемым layout**. Фигуры (app / database / queue / rect), контейнеры
(service / group), связи. Позиционирование — только относительными хинтами.
Стек: TypeScript, вывод в SVG.

## Архитектура

Слои (данные текут слева направо):

```
DSL (.pwr) → Model (IR + builder) → Layout (relative + контейнеры) → Renderer → SVG
```

- `src/model/` — `geometry.ts` (Rect/Point), `arch.ts` (типы: Shape/Container/
  Connection/PlaceHint/ArchDiagram), `arch-builder.ts` (fluent `architecture()`).
  И API, и DSL сходятся в эту модель.
- `src/layout/arch/` — раскладка: `relative.ts` (relative-solver: X из rightOf/
  leftOf, Y из above/below, топосорт), `index.ts` (пост-обход контейнеров,
  bottom-up sizing, нормализация), `route.ts` (ортогональные связи), `measure.ts`.
- `src/render/arch-svg.ts` — SVG-рендер без внешних зависимостей (цилиндры БД/
  очереди, контейнеры, z-order).
- `src/dsl/` — `arch-parse.ts` (парсер `.pwr`: фигуры, контейнеры через `{}`,
  связи, @-хинты), `error.ts` (`DiagramParseError` с позицией).
- `src/cli.ts` — CLI (`power render <in.pwr>`).

## Команды

- `npm run typecheck` — проверка типов
- `npm run build` — сборка в `dist/`
- `npm test` — тесты (vitest)
- `npx tsx examples/basic/basic.ts` — прогнать пример, сгенерить SVG (примеры — по папкам в `examples/`)

## Конвенции

- ESM, `NodeNext`. Импорты локальных модулей — с расширением `.js`.
- `strict` + `noUncheckedIndexedAccess` включены.
- Раскладка детерминирована (в среде нет `Math.random`/`Date.now`).
