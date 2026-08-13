/**
 * Smoke test for the webview half, run against the **built** bundle.
 *
 * There is no clicking in a real editor from here, and the webview is where
 * almost all of the moving parts are: it renders, it hit-tests, it decides what
 * a drag means. So the bundle is loaded into a DOM with the VS Code API stubbed
 * out, and driven through the same messages the host would send.
 *
 * jsdom has no layout engine and no pointer events, which is why the shims below
 * exist. Nothing here asserts on pixels — screen positions are read back out of
 * the transform the webview itself wrote, so the test measures what a person
 * would be pointing at rather than re-deriving it from the layout.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import { layoutArchitecture, linkBadgeRect, parseArchitecture } from "@kxchnev/denji";
import type { FromWebview, ToWebview } from "../src/protocol.js";

const BUNDLE = fileURLToPath(new URL("../dist/webview.js", import.meta.url));
const STYLES = fileURLToPath(new URL("../dist/webview.css", import.meta.url));

const SOURCE = `architecture
  service orders "Orders" {
    app api "API"
    database db "Postgres" @below(api)
    api -> db
  }
  app client "Client" @below(orders)
  client -> api
`;

/** The viewport the fake surface reports, so `fit()` has something to work with. */
const VIEW_W = 800;
const VIEW_H = 600;

type Window = JSDOM["window"];

interface Harness {
  window: Window;
  document: Document;
  /** Everything the webview asked the host to do, oldest first. */
  sent: FromWebview[];
  send: (m: ToWebview) => void;
  surface: HTMLElement;
}

function boot(): Harness {
  // Without a virtual console jsdom swallows whatever the bundle throws, and
  // every assertion below fails with the same unhelpful message.
  const console_ = new VirtualConsole();
  console_.on("jsdomError", (e: Error) => {
    throw e;
  });
  const dom = new JSDOM("<!doctype html><html><body data-uri='file:///x.denji'></body></html>", {
    pretendToBeVisual: true,
    runScripts: "dangerously",
    virtualConsole: console_,
  });
  const { window } = dom;
  const sent: FromWebview[] = [];

  // jsdom ships neither of these, and the webview installs one and acquires the
  // other on the first lines it runs.
  Object.defineProperty(window, "ResizeObserver", {
    value: class {
      observe(): void {}
      disconnect(): void {}
    },
  });
  Object.defineProperty(window, "acquireVsCodeApi", {
    value: () => ({
      postMessage: (m: FromWebview) => sent.push(m),
      setState: () => {},
      getState: () => null,
    }),
  });
  // There is no layout in jsdom, so every measured element is the whole viewport.
  for (const prop of ["clientWidth", "clientHeight"] as const) {
    Object.defineProperty(window.HTMLElement.prototype, prop, {
      value: prop === "clientWidth" ? VIEW_W : VIEW_H,
      configurable: true,
    });
  }
  window.HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: VIEW_W,
      bottom: VIEW_H,
      width: VIEW_W,
      height: VIEW_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};

  // The real stylesheet, so `getComputedStyle` below answers from what ships.
  const style = window.document.createElement("style");
  style.textContent = readFileSync(STYLES, "utf8");
  window.document.head.append(style);

  const script = window.document.createElement("script");
  script.textContent = readFileSync(BUNDLE, "utf8");
  window.document.body.append(script);

  const surface = window.document.querySelector<HTMLElement>(".surface");
  assert.ok(surface, "the webview built a surface to draw on");

  return {
    window,
    document: window.document,
    sent,
    send: (m) => window.dispatchEvent(new window.MessageEvent("message", { data: m })),
    surface,
  };
}

/**
 * What the webview has sent, as plain data. The round-trip matters: objects the
 * bundle built live in jsdom's realm, and a strict deep-equal against a literal
 * written here compares prototypes and fails on identical values.
 */
const sent = (h: Harness): unknown => JSON.parse(JSON.stringify(h.sent));

/**
 * Whether the webview means an element to be on screen.
 *
 * ⚠️ Only as far as jsdom can tell, which is not far: it answers `display` from
 * the `hidden` attribute instead of running the cascade, so it cannot see an
 * author rule overriding `[hidden]` — the exact bug that put "nothing to draw
 * yet" over every diagram. That one is pinned by the stylesheet test below;
 * this covers the webview's own logic about *when* to hide things.
 */
function visible(h: Harness, selector: string): boolean {
  const el = h.document.querySelector<HTMLElement>(selector);
  assert.ok(el, `${selector} exists`);
  return h.window.getComputedStyle(el).display !== "none";
}

/** jsdom has no PointerEvent constructor; the webview only reads these fields. */
function pointer(window: Window, type: string, x: number, y: number): Event {
  const e = new window.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
  Object.defineProperty(e, "pointerId", { value: 1 });
  return e;
}

/** The pan and zoom the webview last painted, read back off the stage. */
function viewport(h: Harness): { x: number; y: number; scale: number } {
  const t = h.document.querySelector<HTMLElement>(".stage")!.style.transform;
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(t);
  assert.ok(m, `stage carries a transform (got ${JSON.stringify(t)})`);
  return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
}

/** Where the centre of `id` currently sits on screen. */
function onScreen(h: Harness, id: string): { x: number; y: number } {
  const diagram = parseArchitecture(SOURCE);
  layoutArchitecture(diagram, { onWarn: () => {} });
  const r = diagram.nodes.find((n) => n.id === id)!.rect!;
  const v = viewport(h);
  return { x: v.x + (r.x + r.width / 2) * v.scale, y: v.y + (r.y + r.height / 2) * v.scale };
}

/** The top of `id` on screen — a container is only grabbable by its title band. */
function onScreenHeader(h: Harness, id: string): { x: number; y: number } {
  const diagram = parseArchitecture(SOURCE);
  layoutArchitecture(diagram, { onWarn: () => {} });
  const r = diagram.nodes.find((n) => n.id === id)!.rect!;
  const v = viewport(h);
  return { x: v.x + (r.x + r.width / 2) * v.scale, y: v.y + (r.y + 6) * v.scale };
}

const LINKED = `architecture
  service orders "Orders" @link(https://example.com/runbook) {
    app api "API" @link(https://example.com/api)
    database db "Postgres" @below(api)
    api -> db
  }
`;

/** The centre of `id`'s link button on screen, taken from core's own geometry. */
function onScreenLink(h: Harness, id: string): { x: number; y: number } {
  const diagram = parseArchitecture(LINKED);
  layoutArchitecture(diagram, { onWarn: () => {} });
  const r = linkBadgeRect(diagram.nodes.find((n) => n.id === id)!)!;
  const v = viewport(h);
  return { x: v.x + (r.x + r.width / 2) * v.scale, y: v.y + (r.y + r.height / 2) * v.scale };
}

/** Boot, hand over the linked document, and drop the `ready` from the log. */
function bootLinked(): Harness {
  const h = boot();
  h.send({ type: "config", config: { grid: true, theme: "auto" } });
  h.send({ type: "source", text: LINKED });
  h.sent.length = 0;
  return h;
}

// ── runner ───────────────────────────────────────────────────────────────────

const tests: Array<[string, () => void | Promise<void>]> = [];
const test = (name: string, fn: () => void | Promise<void>): void => {
  tests.push([name, fn]);
};

// ── the tests ────────────────────────────────────────────────────────────────

test("asks the host for the document as soon as it loads", () => {
  const h = boot();
  assert.deepEqual(sent(h), [{ type: "ready" }]);
});

test("renders a diagram it is given", () => {
  const h = boot();
  h.send({ type: "config", config: { grid: true, theme: "auto" } });
  h.send({ type: "source", text: SOURCE });
  assert.ok(h.document.querySelector(".stage svg"), "an SVG landed on the stage");
  assert.ok(!visible(h, ".error"), "no error is shown");
  assert.ok(!visible(h, ".empty"), "and nothing tells the reader there is nothing to draw");
  assert.ok(!visible(h, ".outline"), "and no hover outline until a pointer says so");
});

test("the stylesheet lets `hidden` win, which no author rule may outrank", () => {
  const css = readFileSync(STYLES, "utf8");
  // This is asserted on the text rather than on a rendered page because no DOM
  // available here runs the real cascade — and in a real browser an author rule
  // that sets `display` beats the user agent's `[hidden] { display: none }`.
  // `.empty { display: flex }` did exactly that, and printed "nothing to draw
  // yet" over every diagram while its `hidden` property said otherwise.
  assert.match(css, /\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important/);
});

test("fits the drawing into the viewport once it arrives", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  const v = viewport(h);
  assert.ok(v.scale > 0 && v.scale <= 1, `never scales a small diagram up (got ${v.scale})`);
});

test("keeps the last good drawing when the document stops parsing", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  const good = h.document.querySelector(".stage svg")!.outerHTML;
  h.send({ type: "source", text: `${SOURCE}  app\n` });
  assert.equal(h.document.querySelector(".stage svg")!.outerHTML, good, "the drawing stayed put");
  assert.ok(visible(h, ".error"), "the error is reported over it");
  assert.match(h.document.querySelector(".error")!.textContent ?? "", /line \d+/, "and says where");
});

test("says so when there is nothing to draw, and stops saying it once there is", () => {
  const h = boot();
  h.send({ type: "source", text: "" });
  assert.ok(visible(h, ".empty"), "an empty document says so");
  h.send({ type: "source", text: SOURCE });
  assert.ok(!visible(h, ".empty"), "and a diagram takes the message away");
});

test("a drag on a node reports where it belongs, not where the pointer left it", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  h.sent.length = 0;

  const from = onScreen(h, "client");
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", from.x, from.y));
  h.surface.dispatchEvent(pointer(h.window, "pointermove", from.x + 240, from.y + 40));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", from.x + 240, from.y + 40));

  const move = h.sent.find((m) => m.type === "move");
  assert.ok(move?.type === "move", "a move was reported");
  assert.equal(move.moves.length, 1, "only the node that was dragged — nothing else is pinned");
  const moved = move.moves[0]!;
  assert.equal(moved.id, "client", "the node that was dragged");
  assert.ok(moved.anchor && moved.anchor !== "client", "next to some other node");
  assert.ok(
    ["rightOf", "leftOf", "above", "below"].includes(moved.side),
    "on a side of it",
  );
});

test("the drawing holds still while a node is being dragged over it", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  const before = h.document.querySelector(".stage")!.innerHTML;

  const from = onScreen(h, "client");
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", from.x, from.y));
  h.surface.dispatchEvent(pointer(h.window, "pointermove", from.x + 240, from.y + 40));
  // Aiming at a target that moves as you reach for it is the reason the document
  // is not rewritten until the pointer comes up.
  assert.equal(h.document.querySelector(".stage")!.innerHTML, before, "nothing re-laid out");
  assert.ok(visible(h, ".ghost"), "the node in hand follows the pointer instead");
});

test("picks the child out of the container it sits in", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  h.sent.length = 0;

  const at = onScreen(h, "db");
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", at.x, at.y));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", at.x, at.y));
  assert.deepEqual(sent(h), [{ type: "reveal", id: "db" }]);
});

test("grabs a container by its title band", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  h.sent.length = 0;

  const at = onScreenHeader(h, "orders");
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", at.x, at.y));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", at.x, at.y));
  assert.deepEqual(sent(h), [{ type: "reveal", id: "orders" }]);
});

test("a drag on empty canvas pans instead of moving anything", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  h.sent.length = 0;
  const before = viewport(h);

  h.surface.dispatchEvent(pointer(h.window, "pointerdown", 2, 2));
  h.surface.dispatchEvent(pointer(h.window, "pointermove", 62, 42));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", 62, 42));

  assert.deepEqual(sent(h), [], "the document was left alone");
  const after = viewport(h);
  assert.equal(after.x - before.x, 60, "and the view moved with the pointer");
  assert.equal(after.y - before.y, 40);
});

test("Escape during a drag leaves the document alone", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  h.sent.length = 0;

  const from = onScreen(h, "client");
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", from.x, from.y));
  h.surface.dispatchEvent(pointer(h.window, "pointermove", from.x + 80, from.y + 40));
  h.window.dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "Escape" }));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", from.x + 80, from.y + 40));

  assert.deepEqual(sent(h), []);
});

test("the wheel zooms around the pointer", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  const before = viewport(h);
  const e = new h.window.Event("wheel", { bubbles: true, cancelable: true });
  Object.defineProperties(e, {
    deltaY: { value: -100 },
    deltaMode: { value: 0 },
    clientX: { value: 400 },
    clientY: { value: 300 },
  });
  h.surface.dispatchEvent(e);
  const after = viewport(h);
  assert.ok(after.scale > before.scale, "zoomed in");
  // The point under the cursor stayed under the cursor.
  const doc = (v: typeof before) => (400 - v.x) / v.scale;
  assert.ok(Math.abs(doc(after) - doc(before)) < 0.001, "and stayed anchored");
});

test("the grid can be turned off", () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  const grid = h.document.querySelector<SVGElement>(".grid")!;
  assert.notEqual(grid.style.display, "none");
  h.send({ type: "config", config: { grid: false, theme: "auto" } });
  assert.equal(grid.style.display, "none");
});

test("follows the editor's colour theme", async () => {
  const h = boot();
  h.send({ type: "source", text: SOURCE });
  const root = h.document.querySelector(".root")!;
  assert.equal(root.classList.contains("dark"), false);
  h.document.body.classList.add("vscode-dark");
  // The mirroring runs in a MutationObserver, which jsdom delivers as a microtask.
  await Promise.resolve();
  assert.ok(root.classList.contains("dark"));
});

test("a pinned palette is baked in instead of switched", () => {
  const h = boot();
  h.send({ type: "config", config: { grid: true, theme: "dark" } });
  h.send({ type: "source", text: SOURCE });
  const style = h.document.querySelector(".stage svg style")!.textContent ?? "";
  assert.ok(!style.includes(".dark "), "no selector half is emitted for a fixed theme");
});


test("a press on a link button opens it instead of revealing the declaration", () => {
  const h = bootLinked();
  const p = onScreenLink(h, "api");
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", p.x, p.y));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", p.x, p.y));
  // deepEqual on the whole log, because the absence of `reveal` is the point.
  assert.deepEqual(sent(h), [{ type: "open", url: "https://example.com/api" }]);
});

test("a press beside the button still reveals the node", () => {
  const h = bootLinked();
  const diagram = parseArchitecture(LINKED);
  layoutArchitecture(diagram, { onWarn: () => {} });
  const r = diagram.nodes.find((n) => n.id === "api")!.rect!;
  const v = viewport(h);
  // The left edge of the box, as far from its top-right button as it gets.
  const p = { x: v.x + (r.x + 8) * v.scale, y: v.y + (r.y + r.height / 2) * v.scale };
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", p.x, p.y));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", p.x, p.y));
  assert.deepEqual(sent(h), [{ type: "reveal", id: "api" }]);
});

test("a container's link button beats the title band it hangs in", () => {
  const h = bootLinked();
  const p = onScreenLink(h, "orders");
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", p.x, p.y));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", p.x, p.y));
  assert.deepEqual(sent(h), [{ type: "open", url: "https://example.com/runbook" }]);
});

test("a press that wanders off the button opens nothing, and drags nothing", () => {
  const h = bootLinked();
  const p = onScreenLink(h, "api");
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", p.x, p.y));
  h.surface.dispatchEvent(pointer(h.window, "pointermove", p.x + 200, p.y + 200));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", p.x + 200, p.y + 200));
  assert.deepEqual(sent(h), []);
});

test("Escape cancels an armed link", () => {
  const h = bootLinked();
  const p = onScreenLink(h, "api");
  h.surface.dispatchEvent(pointer(h.window, "pointerdown", p.x, p.y));
  h.window.dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "Escape" }));
  h.surface.dispatchEvent(pointer(h.window, "pointerup", p.x, p.y));
  assert.deepEqual(sent(h), []);
});

test("says where a link goes before anyone presses it", () => {
  const h = bootLinked();
  const p = onScreenLink(h, "api");
  h.surface.dispatchEvent(pointer(h.window, "pointermove", p.x, p.y));
  assert.ok(h.surface.classList.contains("over-link"), "the cursor says `this opens`");
  assert.ok(!h.surface.classList.contains("over-node"), "and not also `this moves`");
  assert.equal(h.surface.title, "https://example.com/api");

  const q = onScreen(h, "orders");
  h.surface.dispatchEvent(pointer(h.window, "pointermove", q.x, q.y));
  assert.ok(!h.surface.classList.contains("over-link"));
  assert.equal(h.surface.title, "");
});

// ── go ───────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  let failures = 0;
  console.log("webview");
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failures++;
      console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} failing`);
    process.exitCode = 1;
  } else {
    console.log(`\n${tests.length} passing`);
  }
}

void run();
