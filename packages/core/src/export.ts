import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { encode as encodeJpeg } from "jpeg-js";
import type { ArchDiagram, ThemeName } from "./model/arch.js";
import { renderArchitecture } from "./render/arch-svg.js";
import { resolveTheme, type Theme } from "./render/theme.js";
import { registeredFonts, registeredRasterizer } from "./resources.js";

/**
 * The one road from a laid-out diagram to a file, taken by all three products.
 *
 * That is the whole point of the module: the CLI, the VS Code extension and the
 * web playground call *these* functions, so "the same diagram looks the same
 * everywhere" is true by construction rather than by three careful
 * implementations agreeing. Two things had to be pinned for that to hold:
 *
 * - **one rasterizer.** resvg, compiled to WebAssembly, is the only engine that
 *   runs in Node and in a browser; librsvg (through sharp) is native and
 *   platform-shaped, and a canvas exists in only two of the three places.
 * - **one font.** The WASM build has no access to system fonts, which sounds like
 *   a limitation and is really the guarantee: the typeface comes from a file we
 *   ship, so a PNG made on a Mac, in a Linux container and in someone's browser
 *   is the same PNG. The exported SVG embeds the same face, so a viewer that has
 *   never heard of it still draws the diagram the way its raster looks.
 *
 * Neither the font nor the rasterizer is imported here — see `resources.ts`.
 */

export interface ExportOptions {
  /** Palette. A `@theme(...)` in the document beats it, as everywhere. */
  theme?: ThemeName | Theme;
  /** Multiplier over the diagram's own units; 2 keeps text crisp on a raster. */
  scale?: number;
  /**
   * Embed the registered face as `@font-face`, so the file carries its own
   * typeface. On by default: an exported SVG travels, and a diagram redrawn in
   * Helvetica is a different diagram.
   */
  embedFont?: boolean;
  /** JPEG only: what the transparency is flattened onto. Defaults to the theme's surface. */
  background?: string;
  /** JPEG only, 0…1. */
  quality?: number;
}

/** Twice the diagram's units — the size raster output has always been written at. */
const DEFAULT_SCALE = 2;
const DEFAULT_QUALITY = 0.92;

/**
 * A standalone `.svg`: one palette written out as literals, its own typeface, and
 * `@link` buttons as real anchors.
 *
 * `plain` rather than `fixed` because an exported file is the copy most likely to
 * be fed to some other renderer, and half of those do not implement CSS custom
 * properties — resvg drops such a declaration together with its fallback, which
 * turns the whole drawing black. A file that travels should not depend on the
 * cleverness of whatever opens it.
 */
export function toSvgFile(diagram: ArchDiagram, opts: ExportOptions = {}): string {
  const svg = renderArchitecture(diagram, {
    theme: opts.theme,
    themeMode: "plain",
    linkAnchors: true,
  });
  return opts.embedFont === false ? svg : withEmbeddedFont(svg);
}

export async function toPng(diagram: ArchDiagram, opts: ExportOptions = {}): Promise<Uint8Array> {
  const { pixels: _, png } = await raster(diagram, opts, undefined);
  return png();
}

export async function toJpeg(diagram: ArchDiagram, opts: ExportOptions = {}): Promise<Uint8Array> {
  // JPEG has no alpha, so the backdrop has to be decided here rather than left
  // to whoever opens the file: white would ruin a dark diagram.
  const theme = resolveTheme(diagram.theme ?? opts.theme ?? "light");
  const { pixels, width, height } = await raster(
    diagram,
    opts,
    opts.background ?? theme.surface,
  );
  const { data } = encodeJpeg(
    { data: Buffer.from(pixels()), width, height },
    Math.round((opts.quality ?? DEFAULT_QUALITY) * 100),
  );
  return new Uint8Array(data);
}

/**
 * Rasterize once and hand back both forms of the result.
 *
 * PNG comes out of resvg already encoded; JPEG needs the raw pixels and an
 * encoder of its own, and rendering twice to get both would be silly.
 */
async function raster(
  diagram: ArchDiagram,
  opts: ExportOptions,
  background: string | undefined,
): Promise<{ png: () => Uint8Array; pixels: () => Uint8Array; width: number; height: number }> {
  await ready();
  const fonts = registeredFonts();
  const buffers = fonts.map((f) => f.data).filter((d): d is Uint8Array => d !== undefined);
  if (buffers.length === 0) {
    throw new Error(
      "denji: no font registered — raster output needs one, see registerFont() and assets/inter.ttf",
    );
  }
  // No embedded `@font-face` on this path: resvg is handed the same bytes
  // directly, and base64 in the markup would only be parsed and thrown away.
  const svg = toSvgFile(diagram, { ...opts, embedFont: false });
  const image = new Resvg(svg, {
    font: {
      fontBuffers: buffers,
      defaultFontFamily: fonts[0]!.family,
      // Nothing to find, and looking is what makes output machine-shaped.
      loadSystemFonts: false,
    },
    fitTo: { mode: "zoom", value: opts.scale ?? DEFAULT_SCALE },
    ...(background === undefined ? {} : { background }),
  }).render();
  return {
    png: () => image.asPng(),
    pixels: () => image.pixels,
    width: image.width,
    height: image.height,
  };
}

/** Compile the WebAssembly once per process; `initWasm` refuses a second call. */
let compiled: Promise<void> | undefined;
function ready(): Promise<void> {
  if (!compiled) {
    const wasm = registeredRasterizer();
    if (!wasm) {
      return Promise.reject(
        new Error(
          "denji: no rasterizer registered — PNG and JPEG need one, see registerRasterizer() and assets/resvg.wasm",
        ),
      );
    }
    compiled = initWasm(wasm);
  }
  return compiled;
}

/**
 * Put the registered face into the file, as `@font-face` with base64 woff2.
 *
 * woff2 and not the TTF the rasterizer uses: an eighth of the bytes for the same
 * outlines, and every browser reads it. Split by `unicode-range` so a Latin
 * diagram carries 23 KB and one with Cyrillic labels carries 31 — the alternative
 * is one file covering every script, which is 343 KB in every exported diagram.
 */
function withEmbeddedFont(svg: string): string {
  const faces: string[] = [];
  for (const font of registeredFonts()) {
    for (const web of font.web ?? []) {
      const range = web.unicodeRange ? `unicode-range:${web.unicodeRange};` : "";
      faces.push(
        `@font-face{font-family:'${font.family}';font-style:normal;font-weight:400;` +
          `${range}src:url(data:font/woff2;base64,${base64(web.woff2)}) format('woff2')}`,
      );
    }
  }
  if (faces.length === 0) return svg;
  return svg.replace("<style>", `<style>${faces.join("")}`);
}

const base64 = (bytes: Uint8Array): string =>
  typeof Buffer !== "undefined"
    ? Buffer.from(bytes).toString("base64")
    : btoa(String.fromCharCode(...bytes));
