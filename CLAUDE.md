# power

Монорепо: библиотека для **архитектурных диаграмм в свободном стиле** (не C4) +
сайт-документация. Фигуры (app/database/queue/rect), контейнеры (service/group),
связи. Позиционирование — только относительными хинтами. Стек: TypeScript, SVG.

## ⚠️ Документация — часть Definition of Done

**Добавили/изменили функциональность ядра → обновили доку-сайт.** Примеры живут в
`packages/docs/examples/*.ts` (единый источник: `{ title, description, dsl, api }`).
Порядок: добавить пример в нужный датасет (elements/arrows/blocks/layout) →
`npm run -w docs validate` (прогон через ядро) должен быть зелёным → при новой
категории добавить страницу и пункт в `packages/docs/lib/nav.ts`.

## Структура (npm workspaces)

```
packages/core/   пакет power — библиотека + CLI
packages/docs/   Next.js + shadcn дока с живым playground (зависит от power)
package.json     workspace-root (скрипты-прокси)
```

### packages/core (ядро)

Слои: `DSL (.pwr) → Model → Layout (relative + контейнеры) → Renderer → SVG`.

- `src/model/` — `geometry.ts`, `arch.ts` (типы), `arch-builder.ts` (билдер).
- `src/layout/arch/` — `relative.ts` (relative-solver), `index.ts` (оркестрация,
  bottom-up sizing контейнеров), `route.ts` (overlap-роутинг связей), `measure.ts`.
- `src/render/arch-svg.ts` — SVG-рендер без зависимостей.
- `src/dsl/` — `arch-parse.ts` (парсер `.pwr`), `error.ts` (`DiagramParseError`).
- `src/cli.ts` — CLI (`power render <in.pwr>`).

### packages/docs (дока)

Next.js App Router + Tailwind + shadcn-компоненты. Ядро подключено как пакет
`power` (собранный `dist`) и рендерит диаграммы в браузере. Ключевое:
`components/Diagram.tsx` (parse→layout→render→SVG, pan/zoom), `Example.tsx`
(превью + табы DSL/API), `examples/*` (датасет), `app/**/page.tsx` (страницы).

## Команды (из корня)

- `npm run build` — собрать ядро (`packages/core/dist`)
- `npm test` / `npm run typecheck` — тесты/типы ядра
- `npm run docs` — dev-сервер доки; `npm run docs:build` — статический экспорт
- `npm run -w docs validate` — прогнать все примеры доки через ядро

## Конвенции

- ESM, `NodeNext` в ядре. Импорты локальных модулей ядра — с расширением `.js`.
- `strict` + `noUncheckedIndexedAccess` в ядре. Раскладка детерминирована.
- Дока цепляется к **собранному** `power` → после правок ядра `npm run build`.
