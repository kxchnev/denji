import type { Icon } from "./model/icon.js";

/**
 * The big things a drawing needs, handed in rather than compiled in.
 *
 * Three artefacts are too large to live inside the code that uses them: the
 * brand marks (4.9 MB of path data), the font a rasterizer draws text with
 * (0.9 MB) and the rasterizer itself (2.4 MB of WebAssembly). Bundling them made
 * three copies of each — one per product — and paid for all of it on the way to
 * *any* diagram, even one with no icons that is never rasterized.
 *
 * So they ship as files in `assets/` and each product loads them the way its
 * platform loads a file: the CLI reads the disk, the VS Code extension reads its
 * own installation directory, the web playground fetches them once. What arrives
 * here is bytes; nothing in this module knows where they came from, and nothing
 * downloads anything on its own — a product that never registers them simply
 * cannot rasterize, and says so.
 *
 * Registration is idempotent and global, because these are properties of the
 * *installation*, not of a diagram: a second call with the same asset is what
 * happens when two previews open, and it must not cost anything.
 */

/** A font for the rasterizer to draw with, and how to embed the same face in SVG. */
export interface FontAsset {
  /** Family name as the SVG's `font-family` will ask for it. */
  family: string;
  /** TTF/OTF bytes. What resvg reads; it does not decompress woff2. */
  data?: Uint8Array;
  /**
   * The same face as web fonts, for `@font-face` in an exported SVG: woff2 is
   * an eighth of the size and every browser reads it, which is what keeps an
   * exported file small enough to embed its own typeface.
   */
  web?: Array<{ woff2: Uint8Array; unicodeRange?: string }>;
}

interface Registry {
  icons: Record<string, Icon>;
  fonts: FontAsset[];
  wasm: Uint8Array | undefined;
}

/**
 * One registry per process, kept on `globalThis`.
 *
 * A module-level variable would be one registry per *bundle*, and the VS Code
 * extension really does run two bundles that both draw. Registering in one and
 * rendering in the other would then silently draw without icons.
 */
const KEY = "__denji_resources__";
const registry: Registry = ((globalThis as Record<string, unknown>)[KEY] ??= {
  icons: {},
  fonts: [],
  wasm: undefined,
} as Registry) as Registry;

/**
 * Add brand marks, as `assets/icons.json` holds them: name → path and colour.
 *
 * Merged rather than replaced, so a product may register the bundled set and a
 * document's own marks separately, in either order.
 */
export function registerIcons(icons: Record<string, Icon>): void {
  Object.assign(registry.icons, icons);
}

/** Every registered mark. Empty until a product hands the artwork over. */
export function registeredIcons(): Record<string, Icon> {
  return registry.icons;
}

/** Add a font for rasterizing and for embedding. Later registrations win. */
export function registerFont(font: FontAsset): void {
  registry.fonts = [font, ...registry.fonts.filter((f) => f.family !== font.family)];
}

export function registeredFonts(): readonly FontAsset[] {
  return registry.fonts;
}

/** Hand over `assets/resvg.wasm`. Compiled once, on the first raster. */
export function registerRasterizer(wasm: Uint8Array): void {
  registry.wasm = wasm;
}

export function registeredRasterizer(): Uint8Array | undefined {
  return registry.wasm;
}
