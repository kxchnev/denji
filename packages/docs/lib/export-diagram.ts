export type ExportFormat = "svg" | "png" | "jpeg";

/** Render at 2x the diagram's own units so raster exports stay crisp on retina. */
export const DEFAULT_SCALE = 2;

/**
 * Fallbacks tried, in order, when the browser refuses the requested scale.
 *
 * Browsers cap canvas size by side *and* by total area, and the ceiling differs
 * per browser and per device — Chrome allows 65535 a side but only 2^28 pixels
 * in total, while iOS Safari is far stricter. Rather than hard-coding a limit
 * low enough for the worst case, ask for what was requested and step down only
 * when it actually fails. These are whole numbers so the filename stays honest:
 * an export labelled @5x really is 5x.
 */
const FALLBACK_SCALES = [4, 3, 2, 1];

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** One attempt at one scale. Resolves to null when the browser will not give us
 *  a canvas that big, which it signals by handing back no blob. */
async function encodeAt(
  img: HTMLImageElement,
  width: number,
  height: number,
  format: "png" | "jpeg",
  matte: string,
  scale: number,
): Promise<Blob | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (format === "jpeg") {
      // JPEG has no alpha channel — flatten onto the theme's own surface, or a
      // dark diagram lands on white.
      ctx.fillStyle = matte;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        resolve,
        format === "jpeg" ? "image/jpeg" : "image/png",
        format === "jpeg" ? 0.92 : undefined,
      );
    });
    return blob && blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

async function rasterize(
  svg: string,
  width: number,
  height: number,
  format: "png" | "jpeg",
  matte: string,
  scale: number,
): Promise<{ blob: Blob; scale: number }> {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to rasterize diagram"));
    });
    img.src = svgUrl;
    await loaded;

    for (const s of [scale, ...FALLBACK_SCALES.filter((f) => f < scale)]) {
      const blob = await encodeAt(img, width, height, format, matte, s);
      if (blob) return { blob, scale: s };
    }
    throw new Error("Failed to encode diagram");
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
  const done = await rasterize(svg, width, height, format, matte, scale);
  // Name it after the scale that was actually produced, not the one asked for:
  // if the browser could not manage 5x, the file should not claim to be 5x.
  // Only unusual sizes are marked, so the ordinary retina export stays clean.
  const suffix = done.scale === DEFAULT_SCALE ? "" : `@${done.scale}x`;
  triggerDownload(done.blob, `${filename}${suffix}.${format === "jpeg" ? "jpg" : "png"}`);
}

/** Save the diagram's own `.pwr` source, so an export can be edited back. */
export function downloadSource(dsl: string, filename = "diagram"): void {
  triggerDownload(
    new Blob([`${dsl.trimEnd()}\n`], { type: "text/plain;charset=utf-8" }),
    `${filename}.pwr`,
  );
}
