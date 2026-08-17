/**
 * Install the freshly packaged `.vsix` into every editor on this machine.
 *
 * For debugging the extension you are working on, the Marketplace build is the
 * wrong one: it is whatever was last published, and while it stays installed the
 * editor keeps loading it over anything local. `--force` replaces it even when the
 * version string is the same, which it usually is mid-work.
 *
 * Every CLI found is installed into, because "which editor is this" is not
 * something the repo should have an opinion about — VS Code, Insiders, Cursor and
 * Windsurf all speak the same flag.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const vsix = resolve(root, "denji.vsix");
const remove = process.argv.includes("--remove");
const id = "kxchnev.denji";
if (!remove && !existsSync(vsix)) {
  console.error("no denji.vsix — run `npm run vscode:package` first");
  process.exit(1);
}

const CLIS = ["code", "code-insiders", "cursor", "windsurf"];
const found = CLIS.filter((cli) => {
  try {
    execFileSync("which", [cli], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});

if (found.length === 0) {
  console.error(`no editor CLI found (looked for ${CLIS.join(", ")})`);
  console.error("in VS Code: Command Palette → Shell Command: Install 'code' command in PATH");
  process.exit(1);
}

for (const cli of found) {
  if (remove) {
    console.log(`${cli}: removing ${id}`);
    execFileSync(cli, ["--uninstall-extension", id], { stdio: "inherit" });
    continue;
  }
  console.log(`${cli}: installing ${vsix}`);
  execFileSync(cli, ["--install-extension", vsix, "--force"], { stdio: "inherit" });
}
console.log(
  remove
    ? "\nRemoved. Install from the Marketplace again to go back to the published build."
    : "\nDone. Reload the editor window (Developer: Reload Window) to pick it up.\n" +
        "The Marketplace copy wins again the next time it publishes a higher version:\n" +
        "right-click the extension → Auto Update → off, to keep this build.",
);
