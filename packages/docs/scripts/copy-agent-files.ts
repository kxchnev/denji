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
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const out = join(here, "..", "public");

const files: Array<[from: string, to: string]> = [
  [join(repo, "packages", "core", "LANGUAGE.md"), join(out, "llms.txt")],
  [join(repo, ".claude", "skills", "power-diagrams", "SKILL.md"), join(out, "skill.md")],
];

mkdirSync(out, { recursive: true });
for (const [from, to] of files) {
  copyFileSync(from, to);
  console.log(`${to.slice(repo.length + 1)} ← ${from.slice(repo.length + 1)}`);
}
