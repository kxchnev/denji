# Contributing

The repo is an npm-workspaces monorepo:

| Package | Path | What it is |
|---|---|---|
| `@kxchnev/denji` | `packages/core` | The library and the CLI: parser, layout engine, SVG renderer. |
| `kxchnev.denji` | `packages/vscode` | The VS Code extension: live preview with draggable nodes. |
| — | `packages/docs` | The documentation site (Next.js), with a live playground. |

## The loop

```bash
npm install                # all workspaces
npm run build              # core → packages/core/dist, then the extension bundles
npm test                   # core tests (vitest) + extension tests
npm run typecheck
npm run docs               # docs dev server on :3000, plus a tsc --watch on core
npm run -w packages/docs validate   # render every documented example through the core
npm run vscode             # rebuild the extension on change; F5 launches it
npm run vscode:package     # build a .vsix
```

The docs site and the extension consume the **built** `dist`, so run
`npm run build` after touching the core — with the exception of a running
`npm run docs`, which keeps its own `tsc --watch` and rebuilds the core itself.

## Conventions

- ESM with `NodeNext`. **Local imports inside the core carry the `.js` extension.**
- `strict` plus `noUncheckedIndexedAccess`. The layout is deterministic — keep it so.
- Anything an interactive viewer needs to know about a laid-out diagram —
  hit-testing, what a drop means, the drag snap — lives in
  `packages/core/src/interact.ts`, because there are two viewers. Do not
  re-derive it in a component.
- **Documentation is part of done.** A change to core behaviour needs an example
  in `packages/docs/examples/*.ts` and a green `validate`.

## The grammar lives in more than one place

The parser (`packages/core/src/dsl/arch-parse.ts`) is the source of truth. The
editor tokenizer, the document scan, the autocomplete (all under
`packages/docs/lib/`) and the reference (`packages/core/LANGUAGE.md`) each carry
a copy — change the parser and you must update them in the same commit.

The VS Code highlighter is deliberately **not** another copy:
`packages/vscode/scripts/generate-grammar.ts` builds it from the parser's own
exported vocabulary at build time. Add a shape kind, an operator or a directive
to the core, export it, and the highlighter follows on its own.

## The extension, specifically

It is two bundles plus that generated grammar. `dist/extension.js` runs in the
extension host and does three things: hand the document to the preview, write
drops back into it, and offer the CodeLens. `dist/webview.js` carries the whole
library and does everything else — parse, layout, render, pan, zoom, hit-test,
drag. Rendering lives there because a drag re-lays the document out on every
frame, and an IPC round trip per frame would be felt.

```bash
npm run -w packages/vscode test        # builds, then drives the real bundle in jsdom
npm run -w packages/vscode typecheck
```

Press F5, or run **Run the extension** from the debug panel — it opens a second
window on `packages/vscode/examples/sample.denji`.

## Releasing

A version in a manifest is what publishes. Land a change to one on `main` and CI
does the rest: publish, tag the commit, open a GitHub Release. Nothing is
published or tagged by hand.

```bash
npm run release:core 1.0.1     # → npm, tag core@1.0.1
npm run release:vscode 1.0.1   # → marketplace, tag vscode@1.0.1, .vsix on the release
git commit -am "Release 1.0.1"
git push
```

The two are independent: bump one manifest and only that package goes out. Tags
are namespaced by workspace — `core@1.0.1`, `vscode@1.0.1` — so it is obvious
which release a tag belongs to.

Go through the scripts rather than editing a manifest: `package-lock.json`
records each workspace's version too, and a lockfile that disagrees with its
manifest fails `npm ci` before it fails anything interesting.

A push that leaves both versions alone costs two cheap jobs that ask npm and the
marketplace what is already out there, and stop. That question, not the diff, is
what decides — so a rerun or a revert cannot double-publish.

There is no changelog file. **The release notes are the commit subjects**, taken
from the commits that reached the artifact since that package's previous
release — so a subject has to read on its own, in a list, to someone who is not
looking at the diff. For the core that means `packages/core`; for the extension
it also means `packages/core`, because the `.vsix` bundles the engine.

### Credentials

npm needs none: the registry trusts this repository's `release.yml` **by name**
and checks a signed statement from the runner on every publish. Renaming that
file breaks publishing until npm is told the new name.

The marketplace has no equivalent, so `VSCE_PAT` — an Azure DevOps token with
the *Marketplace → Manage* scope — sits in the repository secrets. It is the
only secret here, and the first thing to check when an extension release fails
on authentication.

⚠️ It has to be **organization-scoped**. Azure DevOps blocked the creation of
global PATs in March 2026 and retires the remaining ones on 1 December, so this
token also has an expiry worth writing down somewhere.

The alternative, if that ever stops working, is Microsoft Entra ID: a
user-assigned managed identity with a federated credential for this repository,
added to the publisher by its Azure DevOps profile id, and
`vsce publish --azure-credential` in place of the token. More moving parts, but
nothing stored.
