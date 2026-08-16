/**
 * The preview itself: parse → layout → render, plus everything a pointer can do
 * to the result.
 *
 * The whole of `@kxchnev/denji` is bundled into this script and runs here rather than in
 * the extension host, because a drag re-lays the document out on every frame —
 * that is what makes containers grow and connectors re-aim while the node is
 * still in hand. An IPC round-trip per frame would be felt. The host is asked
 * only for what a webview cannot do itself: write a drop into the file, put the
 * cursor on a declaration, open a link in a browser.
 *
 * The document is the only state. Nothing here owns a position; the webview
 * shows the source it was given, or — for the length of one drag — the source
 * that drag would produce.
 */
import {
  DiagramParseError,
  dropEdgeRect,
  isBoxed,
  layoutArchitecture,
  linkAt,
  nodeAt,
  nodeDepths,
  parseArchitecture,
  relationFor,
  type Relation,
  renderArchitecture,
  snapToGrid,
  type ArchDiagram,
  type Point,
} from "@kxchnev/denji";
import { DiagramGrid } from "./grid.js";
import type { FromWebview, PreviewConfig, ToWebview } from "../src/protocol.js";

declare const acquireVsCodeApi: () => {
  postMessage: (message: FromWebview) => void;
  setState: (state: unknown) => void;
  getState: () => unknown;
};

const vscode = acquireVsCodeApi();

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
/** Breathing room left around the diagram when fitting it to the viewport. */
const FIT_MARGIN = 16;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Rendered {
  svg: string | null;
  error: string | null;
  width: number;
  height: number;
  /** The source this render came from — not always the current document. */
  source: string;
  /** The laid-out model behind the SVG, for hit-testing a pointer against nodes. */
  diagram: ArchDiagram | null;
}

const EMPTY: Rendered = {
  svg: null,
  error: null,
  width: 0,
  height: 0,
  source: "",
  diagram: null,
};

function render(source: string, config: PreviewConfig): Rendered {
  try {
    const diagram = parseArchitecture(source);
    // Warnings belong to `denji check`; someone looking at the picture judges it
    // by looking at it. Without a sink this is a `console.warn` per keystroke.
    layoutArchitecture(diagram, { onWarn: () => {} });
    const svg = renderArchitecture(
      diagram,
      // In `selector` mode the SVG carries both palettes and switches on an
      // ancestor class, which the theme observer below keeps in step with the
      // editor. Switching colour themes then costs no re-render at all. A
      // document with `@theme(...)` overrides all of this, by design.
      config.theme === "auto"
        ? { themeMode: "selector" }
        : { theme: config.theme, themeMode: "fixed" },
    );
    // The core always emits `viewBox="0 0 W H"` — steadier than measuring the
    // DOM, and it keeps the padding knowledge in one place (the renderer).
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    return {
      svg,
      error: null,
      width: Number(m?.[1] ?? 0),
      height: Number(m?.[2] ?? 0),
      source,
      diagram,
    };
  } catch (e) {
    const error = e instanceof DiagramParseError ? e.message : (e as Error).message;
    return { svg: null, error, width: 0, height: 0, source, diagram: null };
  }
}

// ── DOM ──────────────────────────────────────────────────────────────────────

const root = document.createElement("div");
root.className = "root";

const grid = new DiagramGrid("denji");
const surface = document.createElement("div");
surface.className = "surface";
const stage = document.createElement("div");
stage.className = "stage";
const outline = document.createElement("div");
outline.className = "outline";
outline.hidden = true;
/** Where the node in hand currently is, and which sibling it would attach to. */
const ghost = document.createElement("div");
ghost.className = "ghost";
ghost.hidden = true;
const target = document.createElement("div");
target.className = "drop-target";
target.hidden = true;
/** The bar on the anchor's edge naming the side the drop will attach on. */
const edge = document.createElement("div");
edge.className = "drop-edge";
edge.hidden = true;
const outlineLayer = document.createElement("div");
outlineLayer.className = "outline-layer";
outlineLayer.append(outline, target, edge, ghost);
surface.append(stage, outlineLayer);

const errorBox = document.createElement("div");
errorBox.className = "error";
errorBox.hidden = true;

const empty = document.createElement("div");
empty.className = "empty";
empty.textContent = "Nothing to draw yet — write a diagram in the editor.";
empty.hidden = true;

const controls = document.createElement("div");
controls.className = "controls";
const zoomLabel = document.createElement("span");
zoomLabel.className = "zoom";
/**
 * Drawn icons rather than text glyphs: a glyph sits on the font's baseline, so
 * "−" and "⤢" landed visibly off-centre in a square button — and ⤢ reads as
 * "fullscreen", which is not what the fit button does.
 */
const icon = (paths: string): string =>
  `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"` +
  ` stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `${paths}</svg>`;
const ICON_MINUS = icon('<path d="M3.5 8h9"/>');
const ICON_PLUS = icon('<path d="M8 3.5v9M3.5 8h9"/>');
/** A box settling between a frame's corners — fit, not fullscreen. */
const ICON_FIT = icon(
  '<path d="M2 5V3.5A1.5 1.5 0 0 1 3.5 2H5M11 2h1.5A1.5 1.5 0 0 1 14 3.5V5' +
    'M14 11v1.5a1.5 1.5 0 0 1-1.5 1.5H11M5 14H3.5A1.5 1.5 0 0 1 2 12.5V11"/>' +
    '<rect x="5" y="6" width="6" height="4" rx="1"/>',
);
const button = (svg: string, title: string, onClick: () => void): HTMLButtonElement => {
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = svg;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.addEventListener("click", onClick);
  return b;
};
controls.append(
  zoomLabel,
  button(ICON_MINUS, "Zoom out", () => zoomBy(1 / 1.2)),
  button(ICON_PLUS, "Zoom in", () => zoomBy(1.2)),
  button(ICON_FIT, "Fit to view", () => {
    touched = false; // let resizes re-centre again
    fit();
  }),
);

root.append(grid.element, surface, errorBox, empty, controls);
document.body.append(root);

// ── State ────────────────────────────────────────────────────────────────────

let config: PreviewConfig = { grid: true, theme: "auto" };
/** The document, as the editor last told us. */
let source = "";
/** Whether the host has ever sent one — an empty document is not "no document". */
let seenSource = false;
/**
 * Set only while a committed edit is on its way back from the host, to keep the
 * pre-edit render on screen until the real one arrives.
 */
let preview: string | null = null;

let current: Rendered = EMPTY;
/** What `stage` currently holds, so a re-paint that changed nothing does not
 *  throw the SVG subtree away and rebuild it. */
let painted: string | null = null;
/**
 * Editing spends most of its keystrokes on a document that is momentarily
 * incomplete. Swapping the whole preview for an error each time — losing the pan
 * and zoom with it — makes it unusable, so the last render that parsed stays on
 * screen and the error is reported over it.
 */
let lastGood: Rendered = EMPTY;
/** What is actually on screen: `current` when it parsed, the last good one else. */
let shown: Rendered = EMPTY;
let depths = new Map<string, number>();

let view = { x: 0, y: 0, scale: 1 };
/** Whether a fit has ever landed, and the size it landed at. */
let everFit = false;
let size: { w: number; h: number } | null = null;
/** Once the view has been moved by hand, stop auto-fitting it out from under. */
let touched = false;

let panFrom: { x: number; y: number } | null = null;
/** The node being dragged: where it started, in both spaces, and where it is now. */
/**
 * The node being dragged.
 *
 * The document is not rewritten while the pointer is down. A drop now says
 * "this one belongs next to that one", and re-deciding which sibling that is on
 * every frame would make the whole drawing re-arrange under the pointer as the
 * answer flipped. So the drag is a ghost over the real render, and the document
 * changes once, on release.
 */
let nodeDrag: {
  id: string;
  /** The node's own coordinates at the start, in its scope's space. */
  base: Point;
  /** Where it sits on the drawing, for the ghost to start from. */
  fromRect: { x: number; y: number; width: number; height: number };
  /** The grab point and the zoom, in screen terms, so the delta stays honest. */
  fromCursor: Point;
  scale: number;
  at: Point;
  /** The relation the drop would write, or null while it would write nothing. */
  rel: Relation | null;
} | null = null;
let hoverId: string | null = null;
/**
 * A link button under the pointer, held between press and release.
 *
 * Deliberately not a drag and not a pan: a press on a button starts nothing, so
 * the "clicked without moving = reveal" branch in endDrag is unreachable from
 * here and the two gestures cannot be confused for one another.
 */
let linkArm: { id: string; url: string } | null = null;
let hoverLink: string | null = null;

/** Where the rendered drawing's own origin sits on screen.
 *
 * `view` pans in *document* coordinates, not in the rendered SVG's. The layout
 * shifts every rect to frame the drawing, and that shift changes the moment a
 * drag grows the diagram — panning in rendered coordinates would then slide the
 * whole picture, and the grid with it, instead of moving the node. */
function pan(): Point {
  const shift = shown.diagram?.originShift ?? { x: 0, y: 0 };
  return { x: view.x - shift.x * view.scale, y: view.y - shift.y * view.scale };
}

// ── Painting ─────────────────────────────────────────────────────────────────

function recompute(): void {
  const src = preview ?? source;
  current = src.trim() === "" ? { ...EMPTY, source: src } : render(src, config);
  if (current.svg) lastGood = current;
  shown = current.svg ? current : lastGood;
  depths = nodeDepths(shown.diagram);
  paint();
}

function paint(): void {
  const blank = source.trim() === "" && preview === null;
  empty.hidden = !blank;

  if (shown.svg !== painted) {
    stage.innerHTML = shown.svg ?? "";
    painted = shown.svg;
  }

  errorBox.hidden = !current.error || blank;
  if (current.error) errorBox.textContent = current.error;

  grid.element.style.display = config.grid ? "" : "none";
  paintView();
}

function paintView(): void {
  const p = pan();
  const t = `translate(${p.x}px, ${p.y}px) scale(${view.scale})`;
  stage.style.transform = t;
  outlineLayer.style.transform = t;
  grid.update(view.x, view.y, view.scale);
  zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;

  // Outlining the node under the pointer is the only hint that dragging is a
  // thing one can do here. A container is outlined whole, even though only its
  // title band is the handle — what moves is the container, children and all.
  const rect = hoverId ? shown.diagram?.nodes.find((n) => n.id === hoverId)?.rect : null;
  paintDrag();
  outline.hidden = !rect;
  if (rect) {
    outline.style.left = `${rect.x}px`;
    outline.style.top = `${rect.y}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    // Undo the layer's scale, so the hint is a hairline at every zoom.
    outline.style.outlineWidth = `${1 / view.scale}px`;
  }
  surface.classList.toggle("over-node", hoverId !== null);
  surface.classList.toggle("over-link", hoverLink !== null);
  // Where it goes, before it goes there — the only warning a preview can give
  // ahead of handing a URL to a browser.
  surface.title = hoverLink ?? "";
}

/**
 * The node in hand and the sibling it would attach to.
 *
 * Both are drawn over the finished render rather than into it: the diagram the
 * reader is aiming at has to hold still while they aim, or the target moves as
 * they reach for it.
 */
function paintDrag(): void {
  const nd = nodeDrag;
  ghost.hidden = nd === null;
  target.hidden = nd?.rel == null;
  edge.hidden = nd?.rel == null;
  if (!nd) return;
  const shift = shown.diagram?.originShift ?? { x: 0, y: 0 };
  const dx = nd.at.x - nd.base.x;
  const dy = nd.at.y - nd.base.y;
  ghost.style.left = `${nd.fromRect.x + dx}px`;
  ghost.style.top = `${nd.fromRect.y + dy}px`;
  ghost.style.width = `${nd.fromRect.width}px`;
  ghost.style.height = `${nd.fromRect.height}px`;
  ghost.style.borderWidth = `${2 / view.scale}px`;
  void shift;
  if (!nd.rel) return;
  const anchor = shown.diagram?.nodes.find((n) => n.id === nd.rel!.anchor)?.rect;
  target.hidden = !anchor;
  edge.hidden = !anchor;
  if (!anchor) return;
  target.style.left = `${anchor.x}px`;
  target.style.top = `${anchor.y}px`;
  target.style.width = `${anchor.width}px`;
  target.style.height = `${anchor.height}px`;
  target.style.outlineWidth = `${2 / view.scale}px`;
  // The slot the node is about to take: the outline says who it attaches to,
  // this bar says on which side.
  const slot = dropEdgeRect(anchor, nd.rel.side);
  edge.style.left = `${slot.x}px`;
  edge.style.top = `${slot.y}px`;
  edge.style.width = `${slot.width}px`;
  edge.style.height = `${slot.height}px`;
}

function fit(): void {
  const { width, height } = shown;
  if (!width || !height) return;
  const cw = surface.clientWidth;
  const ch = surface.clientHeight;
  if (!cw || !ch) return;
  const shift = shown.diagram?.originShift ?? { x: 0, y: 0 };
  // Never scale a small diagram up — only shrink what does not fit.
  const scale = clamp(
    Math.min((cw - FIT_MARGIN * 2) / width, (ch - FIT_MARGIN * 2) / height),
    MIN_SCALE,
    1,
  );
  // `+ shift * scale`: the view pans in document coordinates, so centring the
  // drawing has to put its framed top-left corner — not the document's origin —
  // in the middle of the viewport.
  view = {
    scale,
    x: (cw - width * scale) / 2 + shift.x * scale,
    y: (ch - height * scale) / 2 + shift.y * scale,
  };
  everFit = true;
  size = { w: cw, h: ch };
  paintView();
}

function zoomBy(factor: number): void {
  const cw = surface.clientWidth;
  const ch = surface.clientHeight;
  touched = true;
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const k = scale / view.scale;
  // Buttons have no cursor to anchor on, so hold the viewport centre still.
  view = { scale, x: cw / 2 - (cw / 2 - view.x) * k, y: ch / 2 - (ch / 2 - view.y) * k };
  paintView();
}

// ── Pointer ──────────────────────────────────────────────────────────────────

/** Pointer position in the rendered drawing's coordinates, i.e. in `rect` terms. */
function toDiagram(e: PointerEvent): Point {
  const box = surface.getBoundingClientRect();
  const p = pan();
  return {
    x: (e.clientX - box.left - p.x) / view.scale,
    y: (e.clientY - box.top - p.y) / view.scale,
  };
}

const cursorIn = (e: PointerEvent): Point => {
  const box = surface.getBoundingClientRect();
  return { x: e.clientX - box.left, y: e.clientY - box.top };
};

surface.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault(); // otherwise the browser starts selecting text and SVG
  touched = true;
  // Capture on the surface, not on e.target: the SVG subtree is replaced
  // wholesale whenever the source changes, which would drop the capture mid-drag.
  surface.setPointerCapture(e.pointerId);

  // A button beats the node it sits on: a container's hangs in the title band,
  // which is the only part of a container a drag can take hold of.
  const link = shown.diagram ? linkAt(shown.diagram, toDiagram(e), depths) : null;
  if (link) {
    linkArm = { id: link.node.id, url: link.url };
    return; // this pointer opens a link: not a drag, not a pan
  }

  const hit = shown.diagram ? nodeAt(shown.diagram, toDiagram(e), depths) : null;
  if (hit?.local && shown.diagram) {
    nodeDrag = {
      id: hit.id,
      base: hit.local,
      fromCursor: cursorIn(e),
      scale: view.scale,
      at: hit.local,
      fromRect: hit.rect!,
      rel: null,
    };
    return; // this pointer moves a node, not the viewport
  }
  panFrom = { x: e.clientX - view.x, y: e.clientY - view.y };
});

surface.addEventListener("pointermove", (e) => {
  if (nodeDrag) {
    const cursor = cursorIn(e);
    const at = {
      x: snapToGrid(nodeDrag.base.x + (cursor.x - nodeDrag.fromCursor.x) / nodeDrag.scale),
      y: snapToGrid(nodeDrag.base.y + (cursor.y - nodeDrag.fromCursor.y) / nodeDrag.scale),
    };
    if (at.x === nodeDrag.at.x && at.y === nodeDrag.at.y) return;
    nodeDrag.at = at;
    nodeDrag.rel = shown.diagram ? relationFor(shown.diagram, nodeDrag.id, at) : null;
    paintDrag();
    return;
  }
  if (panFrom) {
    view = { ...view, x: e.clientX - panFrom.x, y: e.clientY - panFrom.y };
    paintView();
    return;
  }
  const p = toDiagram(e);
  const overLink = shown.diagram ? linkAt(shown.diagram, p, depths) : null;
  // Over a button, say only "this opens": the dashed "this moves" outline of the
  // node underneath it is a mixed message about what the press will do.
  const hit = overLink || !shown.diagram ? null : nodeAt(shown.diagram, p, depths);
  const next = hit?.id ?? null;
  const nextLink = overLink?.url ?? null;
  if (next !== hoverId || nextLink !== hoverLink) {
    hoverId = next;
    hoverLink = nextLink;
    paintView();
  }
});

function endDrag(e?: PointerEvent): void {
  panFrom = null;
  const armed = linkArm;
  linkArm = null;
  if (armed) {
    // Only a release still over the button that was pressed counts, exactly as
    // a real button behaves: press, wander off, release — nothing happens.
    const still =
      e?.type === "pointerup" && shown.diagram ? linkAt(shown.diagram, toDiagram(e), depths) : null;
    if (still && still.node.id === armed.id && still.url === armed.url) {
      vscode.postMessage({ type: "open", url: still.url });
    }
    return;
  }
  const nd = nodeDrag;
  if (!nd) return;
  nodeDrag = null;
  paintDrag();
  // A press that moved nothing is not an edit — it is a request to find the node
  // in the text. Neither is a drop that would say what the node already says.
  if (!nd.rel) {
    vscode.postMessage({ type: "reveal", id: nd.id });
    return;
  }
  vscode.postMessage({
    type: "move",
    moves: [{ id: nd.rel.id, anchor: nd.rel.anchor, side: nd.rel.side }],
  });
}

surface.addEventListener("pointerup", endDrag);
surface.addEventListener("pointercancel", endDrag);
surface.addEventListener("lostpointercapture", endDrag);
surface.addEventListener("pointerleave", () => {
  if (hoverId === null && hoverLink === null) return;
  hoverId = null;
  hoverLink = null;
  paintView();
});

// Bailing out mid-drag has to leave the document alone, preview and all.
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  linkArm = null;
  if (!nodeDrag) return;
  nodeDrag = null;
  paintDrag();
});

// A passive wheel listener cannot preventDefault, and the webview would scroll
// or zoom along with the diagram.
surface.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    touched = true;
    // Normalise deltaMode so a line/page-scrolling device does not cross the
    // whole zoom range in one tick.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? surface.clientHeight : 1;
    const factor = Math.exp((-e.deltaY * unit) / 500);
    const box = surface.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
    const k = scale / view.scale;
    // Keep the diagram point under the cursor pinned to the cursor.
    view = { scale, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
    paintView();
  },
  { passive: false },
);

// Resizing the viewport must not rescale the diagram: revealing or hiding part
// of the editor is not a zoom. So the scale is left alone and only the offset
// moves, by half the change in each axis — whatever was in the middle of the
// pane stays in the middle.
new ResizeObserver(() => {
  const cw = surface.clientWidth;
  const ch = surface.clientHeight;
  // A pane squeezed shut has nothing to centre on, and recording its zero size
  // would make the next resize jump. Wait for it to come back.
  if (!cw || !ch) return;
  const prev = size;
  size = { w: cw, h: ch };
  if (!everFit) {
    fit();
    return;
  }
  if (!prev) return;
  const dx = (cw - prev.w) / 2;
  const dy = (ch - prev.h) / 2;
  if (!dx && !dy) return;
  view = { ...view, x: view.x + dx, y: view.y + dy };
  paintView();
}).observe(surface);

// ── Theme ────────────────────────────────────────────────────────────────────

/**
 * VS Code stamps the active theme onto `<body>`. Mirroring it as the `.dark`
 * class the renderer's `selector` mode looks for is what makes a theme switch
 * free: the SVG already carries both palettes.
 */
function syncTheme(): void {
  const dark =
    document.body.classList.contains("vscode-dark") ||
    document.body.classList.contains("vscode-high-contrast");
  root.classList.toggle("dark", dark);
}
new MutationObserver(syncTheme).observe(document.body, {
  attributes: true,
  attributeFilter: ["class"],
});
syncTheme();

// ── Host ─────────────────────────────────────────────────────────────────────

window.addEventListener("message", (e: MessageEvent<ToWebview>) => {
  const m = e.data;
  if (m.type === "config") {
    config = m.config;
    recompute();
    return;
  }
  if (m.type !== "source") return;

  const first = !seenSource;
  seenSource = true;
  source = m.text;
  // The incoming document supersedes a drag's own preview: either it is the
  // commit landing, or someone typed — and typing wins.
  preview = null;
  recompute();
  if (first || !touched) fit();
});

// The uri travels through `setState` so a panel restored after a window reload
// still knows which document it was showing.
vscode.setState(document.body.dataset.uri ?? null);
vscode.postMessage({ type: "ready" });
