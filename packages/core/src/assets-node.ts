import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Icon } from "./model/icon.js";
import { registerFont, registerIcons, registerRasterizer } from "./resources.js";

/**
 * Loading the shipped assets, the way Node loads files.
 *
 * Kept out of the main entry point on purpose: it imports `node:fs`, and a
 * browser bundle that reached this module would fail to build. Products that run
 * in a browser register the same bytes from a `fetch` instead — see
 * `resources.ts`. Reached as `@kxchnev/denji/assets-node`.
 *
 * Three functions rather than one, because the three assets are needed at
 * different moments and cost very different amounts: 4.9 MB of marks for any
 * drawing that has one, 31 KB of web font for an SVG that embeds its typeface,
 * 0.9 MB of TTF and 2.4 MB of WebAssembly only when something is rasterized.
 * `denji check` pays for none of it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** `dist/` at runtime, so the assets sit one level up beside it. */
export const ASSETS_DIR = join(HERE, "..", "assets");

/** Subsets of the shipped face, and what each covers. From `@fontsource/inter`. */
const WEB_SUBSETS = [
  {
    file: "inter-latin.woff2",
    unicodeRange:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  },
  {
    file: "inter-cyrillic.woff2",
    unicodeRange: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
  },
] as const;

export const FONT_FAMILY = "Inter";

/** The brand marks. Needed by anything that draws an `@icon(...)`. */
export function loadIcons(dir: string = ASSETS_DIR): void {
  const json = readFileSync(join(dir, "icons.json"), "utf8");
  registerIcons(JSON.parse(json) as Record<string, Icon>);
}

/**
 * The typeface: woff2 subsets always, the TTF only when asked.
 *
 * An SVG export embeds the woff2 (31 KB) so the file carries its own type; the
 * rasterizer needs real outlines it can walk, which is the 0.9 MB TTF — and only
 * PNG and JPEG ever pay for that.
 */
export function loadFont(dir: string = ASSETS_DIR, opts: { outlines?: boolean } = {}): void {
  registerFont({
    family: FONT_FAMILY,
    data: opts.outlines ? readFileSync(join(dir, "inter.ttf")) : undefined,
    web: WEB_SUBSETS.map((s) => ({
      woff2: readFileSync(join(dir, s.file)),
      unicodeRange: s.unicodeRange,
    })),
  });
}

/**
 * The rasterizer.
 *
 * Read out of the `@resvg/resvg-wasm` package itself rather than copied into
 * `assets/`: it is a declared dependency, so an npm consumer already has exactly
 * the version this build was tested against, and a copy could only ever drift
 * from it. Bundling products (the extension, the site) hand over their own copy.
 */
export function loadRasterizer(file?: string): void {
  const path = file ?? createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm");
  registerRasterizer(readFileSync(path));
}

/** Everything at once, for a caller that is about to rasterize. */
export function loadAll(dir: string = ASSETS_DIR): void {
  loadIcons(dir);
  loadFont(dir, { outlines: true });
  loadRasterizer();
}
