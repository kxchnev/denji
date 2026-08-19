"use client";

import { registerFont, registerRasterizer } from "@kxchnev/denji";

/**
 * The two big files a *download* needs, fetched instead of compiled into the page.
 *
 * The brand marks are not among them: importing `@kxchnev/denji` registers them,
 * which is the compatibility promise the package makes to every consumer, and
 * this site is one. The cost is real — the artwork is back in the page's
 * JavaScript — and it buys something this site genuinely wants: a prerendered page
 * arrives complete, with its logos, for a reader whose JavaScript never runs.
 *
 * The typeface and the rasterizer stay files. They are only needed when someone
 * saves a picture, they are useless to a reader, and the rasterizer is
 * WebAssembly, which is not a thing a module can be. They end up in the same
 * registry the CLI and the VS Code extension fill from disk — which is what makes
 * a PNG downloaded here the same bytes as one written by `denji render`.
 */

const BASE = "/denji";

/** Subsets of the shipped face, as `@fontsource/inter` publishes them. */
const SUBSETS = [
  {
    file: "inter-latin.woff2",
    unicodeRange:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  },
  { file: "inter-cyrillic.woff2", unicodeRange: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" },
];

const bytes = async (file: string): Promise<Uint8Array> => {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`denji: cannot load ${file} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
};

/**
 * What has arrived so far, and one registration that always states the whole of
 * it.
 *
 * `registerFont` replaces the entry for a family, so registering the woff2 on its
 * own after the TTF had landed would quietly take away the outlines the
 * rasterizer needs. Accumulating and re-stating both is order-independent, which
 * matters because the two downloads are triggered by different clicks.
 */
let web: Array<{ woff2: Uint8Array; unicodeRange?: string }> | undefined;
let ttf: Uint8Array | undefined;
const registerAll = (): void => registerFont({ family: "Inter", data: ttf, web });

let font: Promise<void> | undefined;
/**
 * The typeface alone — 31 KB of woff2, which is all an SVG needs.
 *
 * Kept apart from the rasterizer because an SVG download used to wait for it:
 * 0.9 MB of outlines and 2.4 MB of WebAssembly fetched to produce a file that
 * embeds neither.
 */
export function loadFont(): Promise<void> {
  font ??= Promise.all(SUBSETS.map((s) => bytes(s.file))).then((files) => {
    web = files.map((woff2, i) => ({ woff2, unicodeRange: SUBSETS[i]!.unicodeRange }));
    registerAll();
  });
  return font;
}

let raster: Promise<void> | undefined;
/** The outlines and the rasterizer, for a PNG or a JPEG. */
export function loadRasterizer(): Promise<void> {
  raster ??= (async () => {
    // The woff2 first, so the accumulated registration below is the union rather
    // than a race between two writers.
    await loadFont();
    const [outlines, wasm] = await Promise.all([bytes("inter.ttf"), bytes("resvg.wasm")]);
    ttf = outlines;
    registerAll();
    registerRasterizer(wasm);
  })();
  return raster;
}
