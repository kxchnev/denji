import { describe, expect, it } from "vitest";
import { architecture } from "../src/model/arch-builder.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import { renderArchitecture } from "../src/render/arch-svg.js";
import { ROUTE_GRID } from "../src/layout/arch/route.js";
import type { ArchDiagram, ArchNode } from "../src/model/arch.js";
import type { Rect } from "../src/model/geometry.js";

function node(d: ArchDiagram, id: string): ArchNode {
  const n = d.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}
function rectOf(d: ArchDiagram, id: string): Rect {
  const r = node(d, id).rect;
  if (!r) throw new Error(`node ${id} not laid out`);
  return r;
}
function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

describe("architecture layout", () => {
  it("places `below` and `rightOf` relative to the anchor", () => {
    const d = architecture()
      .app("a", "A")
      .app("b", "B", { hint: { below: "a" } })
      .app("c", "C", { hint: { rightOf: "a" } })
      .build();
    layoutArchitecture(d);
    const a = rectOf(d, "a");
    const b = rectOf(d, "b");
    const c = rectOf(d, "c");
    expect(b.y).toBeGreaterThan(a.y + a.height - 1); // below
    expect(b.x).toBeCloseTo(a.x, 5); // aligned on cross axis
    expect(c.x).toBeGreaterThan(a.x + a.width - 1); // right of
    expect(c.y).toBeCloseTo(a.y, 5);
  });

  it("sizes a container to wrap its children with padding", () => {
    const d = architecture()
      .app("api", "API")
      .database("db", "DB", { hint: { below: "api" } })
      .container("svc", "Service", { kind: "service", children: ["api", "db"] })
      .build();
    layoutArchitecture(d);
    const svc = rectOf(d, "svc");
    expect(contains(svc, rectOf(d, "api"))).toBe(true);
    expect(contains(svc, rectOf(d, "db"))).toBe(true);
    // header leaves room above the first child
    expect(rectOf(d, "api").y).toBeGreaterThan(svc.y + 20);
  });

  it("sizes nested containers bottom-up", () => {
    const d = architecture()
      .app("leaf", "Leaf")
      .container("inner", "Inner", { kind: "service", children: ["leaf"] })
      .container("outer", "Outer", { kind: "group", children: ["inner"] })
      .build();
    layoutArchitecture(d);
    expect(contains(rectOf(d, "outer"), rectOf(d, "inner"))).toBe(true);
    expect(contains(rectOf(d, "inner"), rectOf(d, "leaf"))).toBe(true);
  });

  it("routes connection endpoints onto the node borders", () => {
    const d = architecture()
      .app("a", "A")
      .app("b", "B", { hint: { below: "a" } })
      .connect("a", "b")
      .build();
    layoutArchitecture(d);
    const path = d.connections[0]!.path!;
    const a = rectOf(d, "a");
    const start = path[0]!;
    // start sits on A's bottom edge
    expect(start.y).toBeCloseTo(a.y + a.height, 3);
    expect(start.x).toBeGreaterThanOrEqual(a.x - 0.5);
    expect(start.x).toBeLessThanOrEqual(a.x + a.width + 0.5);
  });

  it("leaves and enters diagonally-placed nodes perpendicular to their edges", () => {
    const d = architecture()
      .app("a", "A")
      .app("b", "B", { hint: { rightOf: "a", below: "a" } }) // offset on both axes → diagonal
      .connect("a", "b")
      .build();
    layoutArchitecture(d);
    const path = d.connections[0]!.path!;
    const a = rectOf(d, "a");
    const b = rectOf(d, "b");
    const outside = (p: { x: number; y: number }, r: Rect) =>
      p.x < r.x - 0.5 || p.x > r.x + r.width + 0.5 || p.y < r.y - 0.5 || p.y > r.y + r.height + 0.5;
    const axisAligned = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5;

    expect(path.length).toBeGreaterThanOrEqual(3);
    // first segment is a perpendicular stub that leaves A's rect
    expect(axisAligned(path[0]!, path[1]!)).toBe(true);
    expect(outside(path[1]!, a)).toBe(true);
    // last segment is a perpendicular stub that enters B from outside
    const n = path.length;
    expect(axisAligned(path[n - 2]!, path[n - 1]!)).toBe(true);
    expect(outside(path[n - 2]!, b)).toBe(true);
  });

  it("snaps connector jogs to the routing grid", () => {
    const d = architecture()
      .app("a", "A")
      .app("b", "B", { hint: { rightOf: "a", below: "a" } }) // diagonal → vertical jog
      .connect("a", "b")
      .build();
    layoutArchitecture(d);
    const path = d.connections[0]!.path!;
    const jogX = path[1]!.x; // x of the vertical jog lane
    expect(jogX % ROUTE_GRID).toBe(0);
  });

  it("distributes multiple connections entering the same side", () => {
    const d = architecture()
      .app("t", "Target")
      .app("a", "A", { hint: { leftOf: "t" } })
      .app("b", "B", { hint: { leftOf: "t", above: "a" } })
      .connect("a", "t")
      .connect("b", "t")
      .build();
    layoutArchitecture(d);
    const t = rectOf(d, "t");
    const end0 = d.connections[0]!.path!.at(-1)!;
    const end1 = d.connections[1]!.path!.at(-1)!;
    // both enter T's left edge...
    expect(end0.x).toBeCloseTo(t.x, 1);
    expect(end1.x).toBeCloseTo(t.x, 1);
    // ...but at distinct points, not merged.
    expect(Math.abs(end0.y - end1.y)).toBeGreaterThan(5);
  });

  it("routes a stacked connection as a straight vertical line", () => {
    const d = architecture()
      .app("a", "Orders API")
      .database("b", "DB", { hint: { below: "a" } })
      .connect("a", "b")
      .build();
    layoutArchitecture(d);
    const path = d.connections[0]!.path!;
    expect(path).toHaveLength(2); // no bend
    expect(path[0]!.x).toBeCloseTo(path[1]!.x, 5); // perfectly vertical
  });

  it("routes a side-by-side connection as a straight horizontal line", () => {
    const d = architecture()
      .app("a", "A")
      .database("b", "Wide Postgres Store", { hint: { rightOf: "a" } })
      .connect("a", "b")
      .build();
    layoutArchitecture(d);
    const path = d.connections[0]!.path!;
    expect(path).toHaveLength(2);
    expect(path[0]!.y).toBeCloseTo(path[1]!.y, 5); // perfectly horizontal
  });

  it("honors connection direction flags", () => {
    const d = architecture()
      .app("a")
      .app("b", "B", { hint: { below: "a" } })
      .connect("a", "b", { dir: "none" })
      .connect("a", "b", { dir: "both" })
      .build();
    expect(d.connections[0]).toMatchObject({ fromArrow: false, toArrow: false });
    expect(d.connections[1]).toMatchObject({ fromArrow: true, toArrow: true });
  });

  it("is deterministic and renders without throwing", () => {
    const make = () =>
      architecture()
        .app("a", "A")
        .rect("b", "B", { hint: { rightOf: "a" } })
        .container("g", "Group", { kind: "group", children: ["a", "b"] })
        .queue("q", "Q", { hint: { below: "g" } })
        .connect("g", "q")
        .build();
    const d1 = layoutArchitecture(make());
    const d2 = layoutArchitecture(make());
    expect(d1.nodes.map((n) => n.rect)).toEqual(d2.nodes.map((n) => n.rect));
    expect(() => renderArchitecture(d1)).not.toThrow();
  });

  it("does not hang on a hint cycle", () => {
    const d = architecture()
      .app("a", "A", { hint: { rightOf: "b" } })
      .app("b", "B", { hint: { rightOf: "a" } })
      .build();
    layoutArchitecture(d);
    for (const n of d.nodes) expect(n.rect).toBeDefined();
  });
});
