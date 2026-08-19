import { toJpeg, toPng, toSvgFile, type ArchDiagram, type ThemeName } from "@kxchnev/denji";
import { loadFont, loadRasterizer } from "@/lib/denji-assets";

export type ExportFormat = "svg" | "png" | "jpeg";

/** Twice the diagram's own units — the size every product writes a raster at. */
export const DEFAULT_SCALE = 2;

/**
 * Downloading a diagram, through the engine rather than through the browser.
 *
 * This used to draw the SVG into a `<canvas>` and ask the canvas for a blob,
 * which meant the site's PNG was a *different picture* from the one `denji
 * render` writes: a different rasterizer, and whatever fonts the reader's machine
 * happens to have. It also meant a maze of fallback scales, because a canvas has
 * size limits that differ per browser and per device.
 *
 * Now it calls the same three functions as the CLI and the VS Code extension, so
 * the same source gives the same bytes in all three, on any machine. The cost is
 * paid per format and only on the first download, never on the way to reading the
 * page: 31 KB of woff2 for an SVG, and the outlines and the rasterizer (3.3 MB)
 * for a PNG or a JPEG.
 */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadDiagram(
  diagram: ArchDiagram,
  format: ExportFormat,
  opts: { name?: string; theme?: ThemeName; scale?: number } = {},
): Promise<void> {
  const name = opts.name ?? "diagram";
  const scale = opts.scale ?? DEFAULT_SCALE;

  if (format === "svg") {
    // Only the woff2 the file embeds — 31 KB. A raster needs the outlines and
    // the rasterizer as well, which is 3.3 MB nobody should pay for to save an
    // SVG.
    await loadFont();
    const svg = toSvgFile(diagram, { theme: opts.theme });
    triggerDownload(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
    return;
  }
  await loadRasterizer();
  const bytes =
    format === "png"
      ? await toPng(diagram, { theme: opts.theme, scale })
      : await toJpeg(diagram, { theme: opts.theme, scale });
  // Only an unusual size is marked, so the ordinary retina export stays clean.
  const suffix = scale === DEFAULT_SCALE ? "" : `@${scale}x`;
  const ext = format === "jpeg" ? "jpg" : "png";
  triggerDownload(
    new Blob([bytes as BlobPart], { type: `image/${format}` }),
    `${name}${suffix}.${ext}`,
  );
}

/** Save the diagram's own `.denji` source, so an export can be edited back. */
export function downloadSource(dsl: string, filename = "diagram"): void {
  triggerDownload(
    new Blob([`${dsl.trimEnd()}\n`], { type: "text/plain;charset=utf-8" }),
    `${filename}.denji`,
  );
}
