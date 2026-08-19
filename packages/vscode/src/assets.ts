import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { registerFont, registerRasterizer } from "@kxchnev/denji";

/**
 * The host's copy of the shipped assets, read straight off the extension's own
 * installation directory.
 *
 * The core has a Node loader of its own (`@kxchnev/denji/assets-node`), and it is
 * the wrong one here: it looks beside the *package*, and this bundle has no
 * package around it — esbuild copies the files to `dist/assets` instead. Reading
 * them here is three lines and keeps `node:module` out of a CJS bundle.
 *
 * Only two things are read: the typeface and the rasterizer. The brand marks are
 * not among them — importing the engine registers them, at the price of carrying
 * them in this bundle, and that price is the same promise the npm package makes
 * to everyone else.
 *
 * Loaded on first use and kept, because an export is a keystroke someone is
 * waiting on.
 */

/** Split by script, as `@fontsource/inter` publishes them. */
const SUBSETS = [
  {
    file: "inter-latin.woff2",
    unicodeRange:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  },
  { file: "inter-cyrillic.woff2", unicodeRange: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" },
];

let loaded = false;

/** What an export needs beyond the engine itself: the typeface and the rasterizer. */
export function loadAssets(context: vscode.ExtensionContext): void {
  if (loaded) return;
  const dir = join(context.extensionUri.fsPath, "dist", "assets");
  registerFont({
    family: "Inter",
    data: readFileSync(join(dir, "inter.ttf")),
    web: SUBSETS.map((s) => ({
      woff2: readFileSync(join(dir, s.file)),
      unicodeRange: s.unicodeRange,
    })),
  });
  registerRasterizer(readFileSync(join(dir, "resvg.wasm")));
  loaded = true;
}
