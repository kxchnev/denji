import type { ArchDiagram, ArchNode, Connection, Container, Shape } from "../model/arch.js";
import { center, type Point, type Rect } from "../model/geometry.js";
import { FONT_SIZE } from "../layout/arch/measure.js";

export interface ArchRenderOptions {
  padding?: number;
  fontFamily?: string;
  background?: string;
  headerH?: number;
}

const DEFAULTS = {
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  // Transparent by default so the diagram sits on whatever surface hosts it.
  // Pass a color (e.g. "#ffffff") for a solid backdrop.
  background: "transparent",
  headerH: 28,
};

const PALETTE: Record<Shape["kind"], { fill: string; stroke: string }> = {
  app: { fill: "#eef2ff", stroke: "#6366f1" },
  database: { fill: "#ecfdf5", stroke: "#10b981" },
  queue: { fill: "#fef3c7", stroke: "#d97706" },
  rect: { fill: "#f1f5f9", stroke: "#94a3b8" },
};

const ACCENT = "#6366f1";
const EDGE = "#334155";
const TEXT = "#1e293b";

/** Render a laid-out architecture diagram (every node has a rect) to SVG. */
export function renderArchitecture(diagram: ArchDiagram, opts: ArchRenderOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const { width, height } = bounds(diagram, o.padding);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="${esc(o.fontFamily)}">`,
  );
  parts.push(defs());
  parts.push(`<rect width="${width}" height="${height}" fill="${o.background}"/>`);

  // Containers back-to-front (outer first), then shapes, then connections on top.
  const depth = containerDepths(diagram);
  const containers = diagram.nodes
    .filter((n): n is Container => n.type === "container")
    .sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0));
  for (const c of containers) parts.push(renderContainer(c, o.headerH));

  for (const n of diagram.nodes) {
    if (n.type === "shape" && n.rect) parts.push(renderShape(n));
  }
  for (const c of diagram.connections) parts.push(renderConnection(c));

  parts.push("</svg>");
  return parts.join("\n");
}

function defs(): string {
  return (
    `<defs>` +
    `<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${EDGE}"/></marker>` +
    `</defs>`
  );
}

function renderShape(n: Shape): string {
  const r = n.rect!;
  const c = PALETTE[n.kind];
  let body: string;
  switch (n.kind) {
    case "app":
      body = `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="10" ry="10" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`;
      break;
    case "database":
      body = cylinderVertical(r, c.fill, c.stroke);
      break;
    case "queue":
      body = cylinderHorizontal(r, c.fill, c.stroke);
      break;
    default:
      body = `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`;
  }
  return `<g>${body}${label(n.label, center(r), FONT_SIZE, TEXT)}</g>`;
}

/** Vertical cylinder (database): body path plus a top rim ellipse. */
function cylinderVertical(r: Rect, fill: string, stroke: string): string {
  const rx = r.width / 2;
  const ry = 7;
  const cx = r.x + rx;
  const body =
    `M ${r.x},${r.y + ry} A ${rx},${ry} 0 0 1 ${r.x + r.width},${r.y + ry} ` +
    `V ${r.y + r.height - ry} A ${rx},${ry} 0 0 1 ${r.x},${r.y + r.height - ry} Z`;
  return (
    `<path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<ellipse cx="${cx}" cy="${r.y + ry}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`
  );
}

/** Horizontal cylinder (queue): body path plus a left rim ellipse. */
function cylinderHorizontal(r: Rect, fill: string, stroke: string): string {
  const rx = 8;
  const ry = r.height / 2;
  const cy = r.y + ry;
  const body =
    `M ${r.x + rx},${r.y} H ${r.x + r.width - rx} A ${rx},${ry} 0 0 1 ${r.x + r.width - rx},${r.y + r.height} ` +
    `H ${r.x + rx} A ${rx},${ry} 0 0 1 ${r.x + rx},${r.y} Z`;
  return (
    `<path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
    `<ellipse cx="${r.x + rx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`
  );
}

function renderContainer(n: Container, headerH: number): string {
  const r = n.rect!;
  if (n.kind === "service") {
    const header =
      `<path d="M ${r.x},${r.y + 10} q 0,-10 10,-10 H ${r.x + r.width - 10} q 10,0 10,10 V ${r.y + headerH} H ${r.x} Z" fill="${ACCENT}"/>`;
    return (
      `<g>` +
      `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="10" ry="10" ` +
      `fill="#f5f6ff" stroke="${ACCENT}" stroke-width="1.5"/>` +
      header +
      `<text x="${r.x + 12}" y="${r.y + headerH / 2}" dominant-baseline="central" ` +
      `font-size="13" font-weight="600" fill="#ffffff">${esc(n.label)}</text>` +
      `</g>`
    );
  }
  // group: plain dashed rectangle with a top-left label
  return (
    `<g>` +
    `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="8" ry="8" ` +
    `fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6 4"/>` +
    `<text x="${r.x + 12}" y="${r.y + 18}" font-size="13" font-weight="600" fill="#475569">${esc(n.label)}</text>` +
    `</g>`
  );
}

function renderConnection(c: Connection): string {
  if (!c.path || c.path.length < 2) return "";
  const d = c.path.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const dash = c.style === "dashed" ? ` stroke-dasharray="6 4"` : "";
  const start = c.fromArrow ? ` marker-start="url(#arr)"` : "";
  const end = c.toArrow ? ` marker-end="url(#arr)"` : "";
  let out = `<path d="${d}" fill="none" stroke="${EDGE}" stroke-width="1.5"${dash}${start}${end}/>`;
  if (c.label && c.labelPos) {
    const w = c.label.length * 7 + 8;
    out +=
      `<rect x="${c.labelPos.x - w / 2}" y="${c.labelPos.y - 9}" width="${w}" height="18" rx="3" fill="#ffffff" opacity="0.9"/>` +
      `<text x="${c.labelPos.x}" y="${c.labelPos.y}" text-anchor="middle" dominant-baseline="central" ` +
      `font-size="12" fill="#475569">${esc(c.label)}</text>`;
  }
  return out;
}

function label(text: string, c: Point, size: number, color: string): string {
  return (
    `<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" ` +
    `font-size="${size}" fill="${color}">${esc(text)}</text>`
  );
}

function containerDepths(diagram: ArchDiagram): Map<string, number> {
  const parent = new Map<string, string>();
  for (const n of diagram.nodes) {
    if (n.type === "container") for (const c of n.children) parent.set(c, n.id);
  }
  const depth = new Map<string, number>();
  for (const n of diagram.nodes) {
    if (n.type !== "container") continue;
    let d = 0;
    let cur = parent.get(n.id);
    while (cur) {
      d++;
      cur = parent.get(cur);
    }
    depth.set(n.id, d);
  }
  return depth;
}

function bounds(diagram: ArchDiagram, padding: number): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const n of diagram.nodes) {
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
