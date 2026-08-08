# AGENTS.md

Instructions for coding agents. Two different jobs live here, so start by
working out which one you are doing.

## A. Drawing a diagram with `power`

You are writing a `.pwr` file, not changing the library.

**Read [`packages/core/LANGUAGE.md`](./packages/core/LANGUAGE.md) first** — it is
the complete, authoritative grammar. `power spec` prints it to stdout.

The loop:

```bash
npm run build                                          # once; the CLI runs from dist/
node packages/core/dist/cli.js check  diagram.pwr      # errors + layout problems
node packages/core/dist/cli.js render diagram.pwr -o /tmp/p.png   # then LOOK at it
node packages/core/dist/cli.js watch  diagram.pwr      # live preview in a browser
node packages/core/dist/cli.js icons                   # the bundled icon names
```

`check` reports syntax errors *and* layout problems (`--json` for structured
output, `--strict` to fail on warnings). Fix everything it lists — then render to
PNG and read the image, because `check` only knows the rules it was given and
says nothing about a colliding label or an ugly route. Only then hand it over.
They will most likely be watching your edits land in the VS Code preview
(`packages/vscode`), where they can also drag a node — which rewrites the file
under you, so re-read it before your next edit.

The rules that decide whether a diagram reads well, and the syntax traps worth
knowing before you start, are in
[`.claude/skills/power-diagrams/SKILL.md`](./.claude/skills/power-diagrams/SKILL.md).
The short version:

- Give every node a placement hint except the first. A node with no hint that
  nothing points at silently lands to the right of everything else.
- Group related nodes into containers; a long top-level row is unreadable.
- ids are `[A-Za-z0-9_]+` — no hyphens — and must never be a keyword
  (`app`, `database`, `queue`, `rect`, `service`, `group`, `text`,
  `architecture`).
- Connection directives go before the `:` label.

## B. Changing the library itself

Monorepo: `packages/core` is the library (`power`), `packages/docs` is a Next.js
documentation site, `packages/vscode` is the editor extension — both depend on
the built `dist`.

```bash
npm run build              # core → packages/core/dist, then the extension bundles
npm test                   # core tests (vitest) + extension tests
npm run typecheck          # core and extension types
npm run docs               # docs dev server on :3000
npm run docs:build         # static export → packages/docs/out
npm run -w docs validate   # render every documented example through the core
npm run vscode             # rebuild the extension on change; F5 launches it
```

Conventions:

- ESM with `NodeNext`. **Local imports inside core carry the `.js` extension.**
- `strict` plus `noUncheckedIndexedAccess`. Layout is deterministic — keep it so.
- The docs site and the extension consume the **built** `dist`, so run
  `npm run build` after touching core or they will show stale behaviour.
- Anything an interactive viewer needs to know about a laid-out diagram —
  hit-testing, which nodes a drag has to pin, the drag snap — lives in
  `packages/core/src/interact.ts`, because there are two viewers. Do not
  re-derive it in a component.

**Documentation is part of done.** A change to core behaviour needs an example in
`packages/docs/examples/*.ts` and a green `npm run -w docs validate`. A new
category also needs a page under `packages/docs/app/(docs)/` and an entry in
`packages/docs/lib/nav.ts`.

⚠️ The `.pwr` grammar exists in more than one place: the parser
(`packages/core/src/dsl/arch-parse.ts`), the editor tokenizer
(`packages/docs/lib/pwr-language.ts`), the document scan
(`packages/docs/lib/pwr-symbols.ts`), the autocomplete
(`packages/docs/lib/pwr-complete.ts` — in practice the largest surface: the
directive table, its per-context allow-list and the argument value lists) and
the reference (`packages/core/LANGUAGE.md`). Change the parser and you must
update the other four in the same commit.

The VS Code highlighter is deliberately **not** a sixth copy:
`packages/vscode/scripts/generate-grammar.ts` builds it from the parser's own
exported vocabulary at build time. If you add a shape kind, an operator or a
directive, export it there and the highlighter follows on its own.

`CLAUDE.md` holds the same repo guidance in more detail, in Russian.
