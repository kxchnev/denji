export type ExportFormat = "svg" | "png" | "jpeg";

/** Render at 2x the diagram's own units so raster exports stay crisp on retina. */
const SCALE = 2;

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
): Promise<Blob> {
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
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext("2d")!;
    if (format === "jpeg") {
      // JPEG has no alpha channel — flatten onto white instead of black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.scale(SCALE, SCALE);
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
): Promise<void> {
  if (format === "svg") {
    triggerDownload(new Blob([svg], { type: "image/svg+xml" }), `${filename}.svg`);
    return;
  }
  const blob = await rasterize(svg, width, height, format);
  triggerDownload(blob, `${filename}.${format === "jpeg" ? "jpg" : "png"}`);
}
