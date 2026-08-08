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
packages/vscode/ расширение VS Code: живое превью .pwr с драгом
package.json     workspace-root (скрипты-прокси)
```

### packages/core (ядро)

Слои: `DSL (.pwr) → Model → Layout (relative + контейнеры) → Renderer → SVG`.

- `src/model/` — `geometry.ts`, `arch.ts` (типы), `arch-builder.ts` (билдер).
- `src/layout/arch/` — `relative.ts` (relative-solver + прибитые `@at`-узлы:
  ставятся точно, для потока — препятствия), `index.ts` (оркестрация, bottom-up
  sizing контейнеров, заполняет `node.local`), `curve.ts` (кривые связи: грань +
  точка стыковки + кубическая кривая), `measure.ts`.
- `src/render/arch-svg.ts` — SVG-рендер без зависимостей.
- `src/dsl/` — `arch-parse.ts` (парсер `.pwr`), `arch-edit.ts` (запись `@at` в
  исходник построчно — для драга; там же `findDeclaration` и `findHeaderLine`:
  строка **и колонки** объявления, потому что «где в объявлении лежит id» — факт
  о его форме, а не то, что каждый вызывающий пересчитывает сам; та же
  «объявление — это одна строка», что и у `setNodePosition`), `error.ts`
  (`DiagramParseError`).
- `src/dsl/arch-parse.ts` заодно экспортирует свой словарь — `SHAPE_KIND_NAMES`,
  `CONTAINER_KIND_NAMES`, `ARCH_OPERATORS` (порядок «длинные вперёд» —
  обязателен), `DIRECTIVE_NAMES`, `ICON_PROP_NAMES`. Это для тех, кому язык надо
  **написать**, а не разобрать (генератор подсветки). `test/arch-vocabulary.test.ts`
  скармливает каждое слово парсеру, чтобы списки не разъехались с реальностью.
- `src/interact.ts` — чистые функции для интерактивного просмотрщика:
  `nodeAt` (хит-тест; фигура берётся целиком, контейнер — только за шапку,
  побеждает самый глубокий), `nodeDepths`, `pinsFor`, `isBoxed`, `snapToGrid`.
  Живут в ядре, потому что просмотрщиков теперь два (playground и VS Code) —
  повторять эти правила по месту нельзя.
- `src/check.ts` — статические проверки: ошибки парса/build плюс предупреждения
  о раскладке (`loose-node`, `hint-cycle`, `overlapping-siblings`,
  `unconnected-node`, `extreme-aspect-ratio`, `at-overrides-hint`). Проверку пересечений
  переиспользует `docs/scripts/validate-examples.ts` — не дублировать.
  ⚠️ **Каждая находка обязана знать, где она.** `nodes[]` был там всегда, а
  позиция — нет, и из-за этого предупреждения не могли попасть ни в Problems, ни
  в кликабельный вывод CLI. Теперь `warn()` берёт `findDeclaration(source,
  nodes[0])` и заполняет `line`/`col`/`endCol`/`srcLine`; `extreme-aspect-ratio`
  единственный без узлов — он про рисунок целиком и садится на строку
  `architecture`, где и лежит лечение. Если id не нашёлся — остаются `null`:
  выдуманная позиция уводит читателя не туда с полной уверенностью.
- `src/watch.ts` — живое превью: `node:http` + SSE, следит за **директорией**
  (atomic rename при сохранении убивает file-watcher), держит последний удачный
  рендер и показывает ошибку оверлеем.
- `src/cli.ts` — CLI: `render`, `check`, `watch`, `spec`, `icons`, `icon`.

**Грамматика для моделей.** `packages/core/LANGUAGE.md` — единственный источник
правды по языку (английский), печатается через `power spec`. `AGENTS.md` в корне
и `.claude/skills/power-diagrams/SKILL.md` ссылаются на него и несут правила
авторства. При правке `arch-parse.ts` синхронно обновляй `LANGUAGE.md`.

⚠️ Цикл в хинтах теперь идёт в `ArchLayoutOptions.onWarn`; по умолчанию —
`console.warn`, как раньше. `check` подставляет свой сборщик.

⚠️ `@at` — координаты в локальном пространстве своего скоупа, а `node.rect` —
абсолютный (каждый скоуп нормализован к своему нулю). Обратный ход — `node.local`,
которую раскладка заполняет для **всех** узлов: это то, что должно стоять в `@at`,
чтобы узел не сдвинулся. Драг считает новую координату как `local + delta` и пишет
её только через `setNodePosition`/`setNodePositions` (`src/dsl/arch-edit.ts`), а не
сериализацией модели — иначе форматирование и комментарии автора умрут.

⚠️ Три вещи, без которых драг в плейграунде (`Diagram.tsx`) разъезжается:

1. Скоуп с координатами **не пере-нормализуется** (`settle` в `relative.ts`): он
   мерится от своего нуля, а не поджимается к самому левому узлу. Иначе сдвиг
   одного ребёнка переставляет всех остальных — именно так и выглядел баг «двигается
   всё, кроме того, что тащишь».
2. Первый драг **прибивает весь документ** (`pinsFor`), а не только соседей: рост
   контейнера переставляет и его собственный скоуп.
3. Вид панорамируется в координатах **документа**: раскладка отдаёт
   `diagram.originShift` (сдвиг рамки), а `Diagram` его вычитает. Поэтому сетка
   (`DiagramGrid`) получает чистый `view` и не ползёт, когда рисунок растёт.

### packages/docs (дока)

Next.js App Router + Tailwind + shadcn-компоненты. Ядро подключено как пакет
`power` (собранный `dist`) и рендерит диаграммы в браузере. Ключевое:
`components/Diagram.tsx` (parse→layout→render→SVG, pan/zoom; при ошибке парса
держит последний удачный рендер и показывает ошибку оверлеем), `Example.tsx`
(превью + табы DSL/API), `examples/*` (датасет), `app/**/page.tsx` (страницы).

Роутинг разделён на две обвязки: `app/(docs)/layout.tsx` — шапка и сайдбар
справочника, `app/playground/` — полноэкранный редактор без них. В корневом
`app/layout.tsx` остаётся только `<html>`, тема и `globals.css`. Плейграунд:
`lib/playground-store.ts` (диаграммы в `localStorage` под одним ключом
`power.playground.diagrams.v1`, наружу — external store для
`useSyncExternalStore`), `lib/use-playground.ts` (сессия, дебаунс-автосейв,
дип-линк `#<id>`), `lib/playground-templates.ts` (стартовые шаблоны — берут DSL
из `examples/*` **по id**), `components/playground/*` (тулбар, список, пикер
шаблонов).

Правила плейграунда: новая диаграмма сохраняется и появляется в списке сразу,
даже пустая (пустая переиспользуется, а не плодится). `/playground` открывает
последнюю по `updatedAt`, новую заводит только если список пуст; `#<id>` —
конкретную. Удаление мягкое: запись остаётся с меткой `deletedAt`, лежит в
секции «Recently deleted» и вычищается при чтении через `TRASH_TTL_MS` (30
дней); есть восстановление и удаление насовсем (с подтверждением). ⚠️ Записи
идут через внутренний `all()`, а не через `getSnapshot()` — иначе удалённые
затрутся.

Подсветка синтаксиса и автокомплит — на CodeMirror 6: `lib/pwr-language.ts`
(токенайзер `.pwr`, `StreamLanguage`), `lib/ts-language.ts` (обёртка над
`@lezer/javascript` для API-таба), `lib/pwr-symbols.ts` + `lib/pwr-complete.ts`
(скан документа и контекстный автокомплит в плейграунде), `lib/editor-theme.ts`
(общая тема редактора). `components/CodeViewer.tsx` — read-only редактор для
статичных примеров (`CodeBlock.tsx`), `components/PwrEditor.tsx` — редактируемый
для `app/playground/page.tsx`. Палитра токенов — CSS-переменные `--tok-*` /
`--code-*` в `globals.css`, **вне `@layer base`** (Tailwind иначе вычищает эти
классы, т.к. они не встречаются как литералы в файлах из `content`).
⚠️ Токенайзер `.pwr` дублирует грамматику ядра — при правках
`core/src/dsl/arch-parse.ts` синхронно обновляй `lib/pwr-language.ts`,
`lib/pwr-symbols.ts` и `lib/pwr-complete.ts` (там же таблица директив с
разрешёнными контекстами и списки значений аргументов — самый большой кусок).

### packages/vscode (расширение)

Живое превью `.pwr` как у markdown, плюс драг узлов прямо в файл пользователя.
Две сборки (esbuild, `esbuild.mjs`):

- `dist/extension.js` (CJS, host) — `src/extension.ts` (команды
  `power.showPreview` / `...ToSide`), `src/preview.ts` (`PreviewManager` — одно
  превью на документ, HTML с CSP, дебаунс 60 мс как в `watch.ts`, сериализатор
  для переживания reload), `src/lens.ts` (CodeLens «Open preview to the side»
  над первой строкой), `src/diagnostics.ts` (`checkDiagram` → Problems, дебаунс
  300 мс — не 60 как у превью: мигающая волнистая линия под недопечатанной
  строкой хуже опоздавшей, и тут полный parse+layout; `nodes[1..]` становятся
  `relatedInformation` через `findDeclaration`; настройка `power.diagnostics` —
  `all`/`errors`/`off`, потому что предупреждения раскладки эвристичны и спорить
  с ними должно быть можно выключателем), `src/edit.ts` + `src/diff.ts` (запись
  дропа), `src/protocol.ts` (типы сообщений — общие с вебвью).
- `syntaxes/pwr.tmLanguage.json` — подсветка. **Генерируется** скриптом
  `scripts/generate-grammar.ts` из экспортов ядра, в гите её нет.
- `dist/webview.js` (IIFE, browser) — `webview/main.ts` целиком тащит `power` и
  делает всё: parse→layout→render, pan/zoom/fit, сетка (`webview/grid.ts` — порт
  `docs/components/DiagramGrid.tsx`), хит-тест, драг, оверлей ошибки.

⚠️ Ядро исполняется **в вебвью**, а не в host: драг перекладывает документ на
каждом кадре (иначе контейнеры не растут и связи не перецеливаются), а IPC
round-trip внутри 60fps-цикла заметен. Расширение самодостаточно всё равно —
`power` забандлен, у пользователя ничего ставить не нужно.

⚠️ Дроп пишется **построчным диффом** (`src/diff.ts` → `WorkspaceEdit`), а не
заменой всего документа: `setNodePositions` переписывает объявления на месте и
никогда не меняет число строк, поэтому сопоставление по индексу точное — и
курсор, выделение и свёрнутые блоки автора остаются на месте. Один `applyEdit`
на дроп = один шаг undo. Источник берётся из `document.getText()` в момент
коммита, а не из копии вебвью (пока тянут узел, в редакторе могли печатать).

⚠️ На каждый `move` host **обязательно** отвечает `source`, даже если правка
ничего не изменила: вебвью до прихода авторитетного текста держит на экране
собственный рендер драга, иначе узел прыгает домой на время round-trip.

⚠️ Подсветка **не написана руками** — шестой копии грамматики в репозитории нет.
`scripts/generate-grammar.ts` берёт слова из ядра (`SHAPE_KIND_NAMES`,
`CONTAINER_KIND_NAMES`, `ARCH_OPERATORS`, `DIRECTIVE_NAMES`, `ICON_PROP_NAMES`,
`STYLE_PROPS`, `CORNERS`, `themes`), а формы строк — из самого скрипта, потому
что TextMate умеет только регэкспы. Добавил вид фигуры или директиву в ядро —
подсветка узнает о ней на следующей сборке. Регистр: виды фигур ядро сверяет
буквально (`App` — не вид), а имена директив и свойств прогоняет через
`normalizePropName` — отсюда `alt` против `altI` в генераторе.
⚠️ `test/grammar.test.ts` гоняет реальный движок (`vscode-textmate` +
`vscode-oniguruma`) и проверяет **скоупы токенов**. Проверять, что нужные слова
«есть в JSON», бесполезно: так и было, пока подсветка не работала вовсе.


## Команды (из корня)

- `npm run build` — собрать ядро (`packages/core/dist`) и расширение
- `npm test` / `npm run typecheck` — тесты/типы ядра и расширения
- `npm run docs` — dev-сервер доки; `npm run docs:build` — статический экспорт
- `npm run -w docs validate` — прогнать все примеры доки через ядро
- `npm run vscode` — пересборка расширения по изменениям; F5 (`.vscode/launch.json`)
  открывает Extension Development Host на `packages/vscode/examples/sample.pwr`
- `npm run vscode:package` — `.vsix`

## Конвенции

- ESM, `NodeNext` в ядре. Импорты локальных модулей ядра — с расширением `.js`.
- `strict` + `noUncheckedIndexedAccess` в ядре. Раскладка детерминирована.
- Дока и расширение цепляются к **собранному** `power` → после правок ядра
  `npm run build`. Тесты расширения гоняют реальный `dist/webview.js` в jsdom,
  так что сборка входит в `npm run -w power-vscode test`.
