# power

Библиотека + CLI для диаграмм (аналог mermaid.js) с **управляемым layout**.
Типы: flowchart и sequence. Стек: TypeScript, вывод в SVG.

## ⚠️ Держи план в синхроне

**`TODO.md` — живой план. Обновляй его при каждом изменении прогресса**: отмечай
сделанные пункты `[x]`, добавляй новые задачи, правь решения. Не давай ему
устаревать относительно кода.

## Архитектура

Слои (данные текут слева направо):

```
DSL → Model (IR + builder) → Layout engine → Renderer → SVG
```

- `src/model/` — типы (`types.ts`), геометрия (`geometry.ts`), fluent-билдер (`builder.ts`). Это ядро; и API, и DSL сходятся в эту модель.
- `src/layout/` — раскладка. Сейчас `simple.ts` (M1, поддерживает пины); дальше — слоистый движок.
- `src/render/` — SVG-рендер без внешних зависимостей.
- `src/dsl/` — парсер DSL (M3, ещё нет).
- `src/cli.ts` — CLI.

## Команды

- `npm run typecheck` — проверка типов
- `npm run build` — сборка в `dist/`
- `npm test` — тесты (vitest)
- `npx tsx examples/basic.ts` — прогнать пример, сгенерить SVG

## Конвенции

- ESM, `NodeNext`. Импорты локальных модулей — с расширением `.js`.
- `strict` + `noUncheckedIndexedAccess` включены.
