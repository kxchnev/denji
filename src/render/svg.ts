import type { Flowchart, FlowNode } from "../model/types.js";
import { center, type Point, type Rect } from "../model/geometry.js";
import { FONT_SIZE } from "../layout/measure.js";

export interface RenderOptions {
  padding?: number;
  fontFamily?: string;
  background?: string;
}

const DEFAULTS = {
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  background: "#ffffff",
};

/** Render a laid-out flowchart (every node must have a `rect`) to an SVG string. */
export function renderFlowchart(chart: Flowchart, opts: RenderOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const { width, height } = bounds(chart, o.padding);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="${esc(o.fontFamily)}">`,
  );
  parts.push(defs());
  parts.push(`<rect width="${width}" height="${height}" fill="${o.background}"/>`);

  for (const e of chart.edges) parts.push(renderEdge(e));
  for (const n of chart.nodes) parts.push(renderNode(n));

  parts.push("</svg>");
  return parts.join("\n");
}

function defs(): string {
  return (
    `<defs>` +
    `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="#334155"/></marker>` +
    `<marker id="open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10" fill="none" stroke="#334155" stroke-width="1.5"/></marker>` +
    `</defs>`
  );
}

function renderNode(n: FlowNode): string {
  const r = n.rect;
  if (!r) return "";
  const c = center(r);
  const fill = "#eef2ff";
  const stroke = "#6366f1";
  const shape = shapePath(n, r);
  const label = renderLabel(n.label, c);
  return `<g>${shape.replace("{{fill}}", fill).replace("{{stroke}}", stroke)}${label}</g>`;
}

function shapePath(n: FlowNode, r: Rect): string {
  const attrs = `fill="{{fill}}" stroke="{{stroke}}" stroke-width="1.5"`;
  const c = center(r);
  switch (n.shape) {
    case "round":
      return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="8" ry="8" ${attrs}/>`;
    case "stadium": {
      const rx = r.height / 2;
      return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${rx}" ry="${rx}" ${attrs}/>`;
    }
    case "circle": {
      const rad = Math.max(r.width, r.height) / 2;
      return `<circle cx="${c.x}" cy="${c.y}" r="${rad}" ${attrs}/>`;
    }
    case "diamond": {
      const pts = [
        `${c.x},${r.y}`,
        `${r.x + r.width},${c.y}`,
        `${c.x},${r.y + r.height}`,
        `${r.x},${c.y}`,
      ].join(" ");
      return `<polygon points="${pts}" ${attrs}/>`;
    }
    case "hexagon": {
      const inset = r.height / 2;
      const pts = [
        `${r.x + inset},${r.y}`,
        `${r.x + r.width - inset},${r.y}`,
        `${r.x + r.width},${c.y}`,
        `${r.x + r.width - inset},${r.y + r.height}`,
        `${r.x + inset},${r.y + r.height}`,
        `${r.x},${c.y}`,
      ].join(" ");
      return `<polygon points="${pts}" ${attrs}/>`;
    }
    default:
      return `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" ${attrs}/>`;
  }
}

function renderLabel(label: string, c: Point): string {
  const lines = label.split("\n");
  const lineH = FONT_SIZE + 6;
  const startY = c.y - ((lines.length - 1) * lineH) / 2;
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${c.x}" y="${startY + i * lineH}">${esc(line)}</tspan>`,
    )
    .join("");
  return (
    `<text text-anchor="middle" dominant-baseline="central" ` +
    `font-size="${FONT_SIZE}" fill="#1e293b">${tspans}</text>`
  );
}

function renderEdge(e: {
  path?: Point[];
  labelPos?: Point;
  label?: string;
  style: string;
  head: string;
}): string {
  if (!e.path || e.path.length < 2) return "";
  const d = e.path
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const dash = e.style === "dashed" ? ` stroke-dasharray="6 4"` : "";
  const w = e.style === "thick" ? 3 : 1.5;
  const marker = e.head === "none" ? "" : ` marker-end="url(#${e.head === "open" ? "open" : "arrow"})"`;
  let out = `<path d="${d}" fill="none" stroke="#334155" stroke-width="${w}"${dash}${marker}/>`;
  if (e.label && e.labelPos) {
    out +=
      `<rect x="${e.labelPos.x - e.label.length * 4 - 3}" y="${e.labelPos.y - 9}" ` +
      `width="${e.label.length * 8 + 6}" height="18" fill="#ffffff" opacity="0.9"/>` +
      `<text x="${e.labelPos.x}" y="${e.labelPos.y}" text-anchor="middle" ` +
      `dominant-baseline="central" font-size="12" fill="#475569">${esc(e.label)}</text>`;
  }
  return out;
}

function bounds(chart: Flowchart, padding: number): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const n of chart.nodes) {
    if (!n.rect) continue;
    maxX = Math.max(maxX, n.rect.x + n.rect.width);
    maxY = Math.max(maxY, n.rect.y + n.rect.height);
  }
  return { width: Math.ceil(maxX + padding), height: Math.ceil(maxY + padding) };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
