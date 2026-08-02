export type ExportFormat = "svg" | "png" | "jpeg";

/** Render at 2x the diagram's own units so raster exports stay crisp on retina. */
export const DEFAULT_SCALE = 2;

/**
 * Browsers cap how large a canvas may be, and the limit is both per-side and by
 * total area — Safari is the strictest. Past it `toBlob` simply hands back null,
 * so a 5x export of a big diagram would fail with nothing to show for it.
 * Scaling down to fit gives a slightly smaller file instead of no file.
 */
const MAX_DIMENSION = 8192;

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function rasterize(
  svg: string,
  width: number,
  height: number,
  format: "png" | "jpeg",
  matte: string,
  scale: number,
): Promise<Blob> {
  const safe = Math.max(0.1, Math.min(scale, MAX_DIMENSION / Math.max(width, height, 1)));
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to rasterize diagram"));
    });
    img.src = svgUrl;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * safe);
    canvas.height = Math.round(height * safe);
    const ctx = canvas.getContext("2d")!;
    if (format === "jpeg") {
      // JPEG has no alpha channel — flatten onto the theme's own surface, or a
      // dark diagram lands on white.
      ctx.fillStyle = matte;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.scale(safe, safe);
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode diagram"))),
        format === "jpeg" ? "image/jpeg" : "image/png",
        format === "jpeg" ? 0.92 : undefined,
      );
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function downloadDiagram(
  svg: string,
  width: number,
  height: number,
  format: ExportFormat,
  filename = "diagram",
  matte = "#ffffff",
  scale = DEFAULT_SCALE,
): Promise<void> {
  if (format === "svg") {
    triggerDownload(new Blob([svg], { type: "image/svg+xml" }), `${filename}.svg`);
    return;
  }
  const blob = await rasterize(svg, width, height, format, matte, scale);
  // Only mark the unusual size, so the ordinary retina export keeps a clean name.
  const suffix = scale === DEFAULT_SCALE ? "" : `@${scale}x`;
  triggerDownload(blob, `${filename}${suffix}.${format === "jpeg" ? "jpg" : "png"}`);
}

/** Save the diagram's own `.pwr` source, so an export can be edited back. */
export function downloadSource(dsl: string, filename = "diagram"): void {
  triggerDownload(
    new Blob([`${dsl.trimEnd()}\n`], { type: "text/plain;charset=utf-8" }),
    `${filename}.pwr`,
  );
}
