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
node packages/core/dist/cli.js watch  diagram.pwr      # they run this: live preview
node packages/core/dist/cli.js icons                   # the bundled icon names
```

`check` reports syntax errors *and* layout problems (`--json` for structured
output, `--strict` to fail on warnings). Fix everything it lists — then render to
PNG and read the image, because `check` only knows the rules it was given and
says nothing about a colliding label or an ugly route. Only then hand it over,
and suggest they keep `watch` open so they can see your edits land.

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
documentation site that depends on the built `dist`.

```bash
npm run build              # build core → packages/core/dist
npm test                   # core tests (vitest)
npm run typecheck          # core types
npm run docs               # docs dev server on :3000
npm run docs:build         # static export → packages/docs/out
npm run -w docs validate   # render every documented example through the core
```

Conventions:

- ESM with `NodeNext`. **Local imports inside core carry the `.js` extension.**
- `strict` plus `noUncheckedIndexedAccess`. Layout is deterministic — keep it so.
- The docs site consumes the **built** `dist`, so run `npm run build` after
  touching core or the site will render stale behaviour.

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

`CLAUDE.md` holds the same repo guidance in more detail, in Russian.
