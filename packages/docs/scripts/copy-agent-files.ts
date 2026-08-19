/**
 * Publish the two files an agent needs as plain text next to the site.
 *
 * Both already exist and are already the source of truth — the grammar the CLI
 * prints, and the skill this repository's own agents load. Copying them at
 * build time rather than pasting them into a page is the only arrangement
 * where the site cannot start describing a language the parser stopped
 * speaking: there is one copy, and it is the one that ships.
 *
 * `llms.txt` is the convention agents look for at the root of a docs site;
 * `skill.md` is the same file Claude Code reads out of `.claude/skills/`, so
 * installing it is one `curl`.
 *
 * The typeface and the rasterizer travel the same way, for a different reason:
 * they are only needed when a reader saves a picture, and WebAssembly is not
 * something a module can be. The brand marks are *not* here — they come with the
 * engine's own import, which is the compatibility the package promises.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const out = join(here, "..", "public");

const core = join(repo, "packages", "core");
const assets = join(out, "denji");
const files: Array<[from: string, to: string]> = [
  [join(repo, "packages", "core", "LANGUAGE.md"), join(out, "llms.txt")],
  [join(repo, ".claude", "skills", "denji-diagrams", "SKILL.md"), join(out, "skill.md")],
  [join(core, "assets", "inter.ttf"), join(assets, "inter.ttf")],
  [join(core, "assets", "inter-latin.woff2"), join(assets, "inter-latin.woff2")],
  [join(core, "assets", "inter-cyrillic.woff2"), join(assets, "inter-cyrillic.woff2")],
  [join(repo, "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm"), join(assets, "resvg.wasm")],
];

mkdirSync(out, { recursive: true });
mkdirSync(assets, { recursive: true });
for (const [from, to] of files) {
  copyFileSync(from, to);
  console.log(`${to.slice(repo.length + 1)} ← ${from.slice(repo.length + 1)}`);
}
