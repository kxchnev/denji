import { describe, expect, it } from "vitest";
import { architecture } from "../src/model/arch-builder.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import { renderArchitecture } from "../src/render/arch-svg.js";
import { parseArchitecture as parse } from "../src/dsl/arch-parse.js";
import type { ArchDiagram, ArchNode } from "../src/model/arch.js";
import type { Point, Rect } from "../src/model/geometry.js";
import { cubicAt, sideNormal, type Side } from "../src/layout/arch/curve.js";

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
/** A cubic is a straight line exactly when its four points are collinear. */
function isStraight(a: Point, c1: Point, c2: Point, b: Point): boolean {
  const cross = (p: Point, q: Point): number => (q.x - a.x) * (p.y - a.y) - (q.y - a.y) * (p.x - a.x);
  return Math.abs(cross(c1, b)) < 0.5 && Math.abs(cross(c2, b)) < 0.5;
}

/** The side a point sits on, by which border it touches. */
function sideOf(p: Point, r: Rect): Side {
  if (Math.abs(p.x - r.x) < 0.6) return "left";
  if (Math.abs(p.x - (r.x + r.width)) < 0.6) return "right";
  if (Math.abs(p.y - r.y) < 0.6) return "top";
  return "bottom";
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}
/** Every pair of siblings, in every scope, must be disjoint. */
function overlappingSiblings(d: ArchDiagram): string[] {
  const parent = new Map<string, string>();
  for (const n of d.nodes) {
    if (n.type === "container") for (const c of n.children) parent.set(c, n.id);
  }
  const scopes = new Map<string, ArchNode[]>();
  for (const n of d.nodes) {
    const key = parent.get(n.id) ?? "<top>";
    const list = scopes.get(key) ?? [];
    list.push(n);
    scopes.set(key, list);
  }
  const bad: string[] = [];
  for (const [scope, list] of scopes) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.rect && b.rect && overlaps(a.rect, b.rect)) bad.push(`${scope}: ${a.id}×${b.id}`);
      }
    }
  }
  return bad;
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

  it("leaves and enters diagonally-placed nodes along their side normals", () => {
    const d = architecture()
      .app("a", "A")
      .app("b", "B", { hint: { rightOf: "a", below: "a" } }) // offset on both axes → diagonal
      .connect("a", "b")
      .build();
    layoutArchitecture(d);
    const c = d.connections[0]!;
    const [start, end] = [c.path![0]!, c.path![1]!];
    const { c1, c2 } = c.curve!;
    // The tangent at each end is the outward normal of the side it docks on —
    // which is what makes the arrowhead meet the box square on.
    const na = sideNormal(sideOf(start, rectOf(d, "a")));
    const nb = sideNormal(sideOf(end, rectOf(d, "b")));
    expect(c1.x - start.x).toBeCloseTo(na.x * Math.hypot(c1.x - start.x, c1.y - start.y), 3);
    expect(c1.y - start.y).toBeCloseTo(na.y * Math.hypot(c1.x - start.x, c1.y - start.y), 3);
    expect(c2.x - end.x).toBeCloseTo(nb.x * Math.hypot(c2.x - end.x, c2.y - end.y), 3);
    expect(c2.y - end.y).toBeCloseTo(nb.y * Math.hypot(c2.x - end.x, c2.y - end.y), 3);
  });

  it("distributes multiple connections entering the same side", () => {
    // A tall target, so its left side has room for both docks at the pitch: a
    // 46px-high shape would only fit one, and the second would spill to another
    // side rather than crowd the first.
    const d = architecture()
      .app("t1", "One")
      .app("t2", "Two", { hint: { below: "t1" } })
      .app("t3", "Three", { hint: { below: "t2" } })
      .container("t", "Target", { kind: "service", children: ["t1", "t2", "t3"] })
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

  it("draws a stacked connection as a straight vertical line", () => {
    const d = architecture()
      .app("a", "Orders API")
      .database("b", "DB", { hint: { below: "a" } })
      .connect("a", "b")
      .build();
    layoutArchitecture(d);
    const c = d.connections[0]!;
    const [start, end] = [c.path![0]!, c.path![1]!];
    expect(start.x).toBeCloseTo(end.x, 5); // perfectly vertical
    expect(isStraight(start, c.curve!.c1, c.curve!.c2, end)).toBe(true);
  });

  it("draws a side-by-side connection as a straight horizontal line", () => {
    const d = architecture()
      .app("a", "A")
      .database("b", "Wide Postgres Store", { hint: { rightOf: "a" } })
      .connect("a", "b")
      .build();
    layoutArchitecture(d);
    const c = d.connections[0]!;
    const [start, end] = [c.path![0]!, c.path![1]!];
    expect(start.y).toBeCloseTo(end.y, 5); // perfectly horizontal
    expect(isStraight(start, c.curve!.c1, c.curve!.c2, end)).toBe(true);
  });

  // Both of these come from a real diagram whose arrows looked wrong.
  describe("connector regressions", () => {
    /** Where the port sits on its side, measured from that side's midpoint. */
    function offCentre(point: { x: number; y: number }, r: Rect): number {
      const onVerticalSide =
        Math.abs(point.x - r.x) < 0.6 || Math.abs(point.x - (r.x + r.width)) < 0.6;
      return onVerticalSide
        ? Math.abs(point.y - (r.y + r.height / 2))
        : Math.abs(point.x - (r.x + r.width / 2));
    }

    it("centres a lone edge on each node when their centres are far apart", () => {
      // Ports used to land in the middle of the band where the two rects
      // overlap. Facing a container four times its height, that band is the
      // small node's own extent, so the edge met the container 81px above its
      // centre. Both ends must sit on their own centre instead.
      const d = parse(
        [
          "architecture",
          '  app a "A"',
          '  service b "B" @rightOf(a) @align(start) {',
          '    app b1 "One"',
          '    app b2 "Two" @below(b1)',
          "  }",
          "  a -> b",
        ].join("\n"),
      );
      layoutArchitecture(d);
      const path = d.connections[0]!.path!;
      expect(offCentre(path[0]!, rectOf(d, "a"))).toBeLessThan(0.6);
      expect(offCentre(path[path.length - 1]!, rectOf(d, "b"))).toBeLessThan(0.6);
    });

    it("merges centres that differ by a few px into one straight line", () => {
      // An app and a taller database sharing a bottom edge are 7px apart —
      // close enough that a visible S-bend would read as a wobble.
      const d = parse(
        'architecture\n  app a "A"\n  database b "Store" @rightOf(a) @align(end)\n  a -> b\n',
      );
      layoutArchitecture(d);
      const c = d.connections[0]!;
      expect(isStraight(c.path![0]!, c.curve!.c1, c.curve!.c2, c.path![1]!)).toBe(true);
    });

    it("keeps the curve out of both nodes in a corridor a few px wide", () => {
      // With the control reach capped at half the dock distance, a gap this small
      // gives a nearly straight hop; without the cap the controls reach past each
      // other and the curve bulges out through both boxes.
      const d = parse(
        [
          "architecture",
          '  app a "A"',
          '  database b "Locks" @rightOf(a) @below(a) @gap(7)',
          "  a -> b",
        ].join("\n"),
      );
      layoutArchitecture(d);
      const c = d.connections[0]!;
      const rects = [rectOf(d, "a"), rectOf(d, "b")];
      for (let i = 1; i < 32; i++) {
        const p = cubicAt(c.path![0]!, c.curve!.c1, c.curve!.c2, c.path![1]!, i / 32);
        for (const r of rects) {
          const inside =
            p.x > r.x + 0.01 && p.x < r.x + r.width - 0.01 && p.y > r.y + 0.01 && p.y < r.y + r.height - 0.01;
          expect(inside).toBe(false);
        }
      }
    });

    it("still merges near-aligned centres into one straight line", () => {
      // An app and a taller database centred on each other must not gain a
      // dogleg just because their heights differ.
      const d = parse('architecture\n  app a "A"\n  database b "Store" @rightOf(a)\n  a -> b\n');
      layoutArchitecture(d);
      const c = d.connections[0]!;
      expect(isStraight(c.path![0]!, c.curve!.c1, c.curve!.c2, c.path![1]!)).toBe(true);
    });
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
    expect(d1.connections.map((c) => [c.path, c.curve, c.labelPos])).toEqual(
      d2.connections.map((c) => [c.path, c.curve, c.labelPos]),
    );
    expect(renderArchitecture(d1)).toBe(renderArchitecture(d2));
    expect(() => renderArchitecture(d1)).not.toThrow();
  });

  it("flows unhinted siblings left to right", () => {
    // No hints anywhere: the plain flow must stay exactly as it was.
    const d = architecture()
      .app("a", "A")
      .database("b", "Wide Postgres Store")
      .app("c", "C")
      .build();
    layoutArchitecture(d);
    const a = rectOf(d, "a");
    const b = rectOf(d, "b");
    const c = rectOf(d, "c");
    expect(b.x).toBeCloseTo(a.x + a.width + 40, 5);
    expect(c.x).toBeCloseTo(b.x + b.width + 40, 5);
    // each centers on the previous sibling, whatever its height
    expect(b.y + b.height / 2).toBeCloseTo(a.y + a.height / 2, 5);
    expect(c.y + c.height / 2).toBeCloseTo(b.y + b.height / 2, 5);
  });

  it("parks an unhinted node beside the hinted structure, not on top of it", () => {
    const d = architecture()
      .app("a", "A")
      .app("loose", "Loose") // declared mid-structure, anchored to nothing
      .app("b", "B", { hint: { rightOf: "a" } })
      .build();
    layoutArchitecture(d);
    const a = rectOf(d, "a");
    const b = rectOf(d, "b");
    const loose = rectOf(d, "loose");
    expect(b.x).toBeCloseTo(a.x + a.width + 40, 5); // the hint still wins
    expect(overlappingSiblings(d)).toEqual([]);
    expect(loose.x).toBeGreaterThanOrEqual(b.x + b.width); // parked past the structure
  });

  it("keeps an unhinted anchor inside the structure it anchors", () => {
    // `a` has no hint of its own but `b` hangs off it — it must not be parked.
    const d = architecture()
      .app("a", "A")
      .app("b", "B", { hint: { below: "a" } })
      .app("loose", "Loose")
      .build();
    layoutArchitecture(d);
    const a = rectOf(d, "a");
    const b = rectOf(d, "b");
    expect(b.x).toBeCloseTo(a.x, 5); // still centered under its anchor
    expect(b.y).toBeGreaterThan(a.y + a.height - 1);
    expect(rectOf(d, "loose").x).toBeGreaterThanOrEqual(Math.max(a.x + a.width, b.x + b.width));
  });

  it("slides a node clear when its slot is taken", () => {
    const side = architecture()
      .app("a", "A")
      .app("b", "B", { hint: { rightOf: "a" } })
      .app("c", "C", { hint: { rightOf: "a" } })
      .build();
    layoutArchitecture(side);
    // Same column as b, pushed down onto the next row.
    expect(rectOf(side, "c").x).toBeCloseTo(rectOf(side, "b").x, 5);
    expect(rectOf(side, "c").y).toBeGreaterThan(rectOf(side, "b").y + rectOf(side, "b").height - 1);
    expect(overlappingSiblings(side)).toEqual([]);

    const stacked = architecture()
      .app("a", "A")
      .app("b", "B", { hint: { below: "a" } })
      .app("c", "C", { hint: { below: "a" } })
      .build();
    layoutArchitecture(stacked);
    // Same row as b, pushed right into the next column.
    expect(rectOf(stacked, "c").y).toBeCloseTo(rectOf(stacked, "b").y, 5);
    expect(rectOf(stacked, "c").x).toBeGreaterThan(
      rectOf(stacked, "b").x + rectOf(stacked, "b").width - 1,
    );
    expect(overlappingSiblings(stacked)).toEqual([]);
  });

  it("grows a container around an unhinted child instead of overlapping it", () => {
    const d = architecture()
      .app("api", "API")
      .database("db", "Postgres", { hint: { below: "api" } })
      .app("helper", "Helper") // no hint, inside the container's scope
      .container("svc", "Service", { kind: "service", children: ["api", "db", "helper"] })
      .build();
    layoutArchitecture(d);
    const svc = rectOf(d, "svc");
    for (const id of ["api", "db", "helper"]) expect(contains(svc, rectOf(d, id))).toBe(true);
    expect(overlappingSiblings(d)).toEqual([]);
  });

  it("keeps sibling rects disjoint on the reported broken diagram", () => {
    // Regression: unhinted apps used to render on top of the `pay` service.
    const d = parse(
      [
        "architecture",
        '  app gw "API Gateway"',
        '  service orders "Orders" @below(gw) {',
        '    app oapi "Orders API"',
        '    database odb "Postgres" @below(oapi)',
        "  }",
        '  app f "f"',
        '  app b "b"',
        '  service x "x" {',
        '    app z "z"',
        "  }",
        '  service pay "Payments" @rightOf(orders) {',
        '    app papi "Payments API"',
        '    queue pq "Charges" @below(papi)',
        "  }",
        '  queue bus "Event Bus" @below(orders)',
        "  gw -> orders : http",
        "  gw -> pay : http",
        "  orders -> bus",
        "  pay -> bus",
        "  orders -- pay",
      ].join("\n"),
    );
    layoutArchitecture(d);
    expect(overlappingSiblings(d)).toEqual([]);
    // the unhinted nodes sit to the right of the hinted structure
    const payRight = rectOf(d, "pay").x + rectOf(d, "pay").width;
    for (const id of ["f", "b", "x"]) expect(rectOf(d, id).x).toBeGreaterThanOrEqual(payRight);
    // ...and the hinted structure itself is untouched
    expect(rectOf(d, "orders").x).toBeCloseTo(24, 5);
    expect(rectOf(d, "pay").x).toBeCloseTo(232, 5);
  });

  it("parks a node whose anchor is not a sibling instead of stacking it at the origin", () => {
    const d = architecture()
      .app("outside", "Outside")
      .app("in1", "In 1")
      .app("in2", "In 2", { hint: { rightOf: "outside" } }) // not a sibling of in1
      .container("svc", "Svc", { kind: "service", children: ["in1", "in2"] })
      .build();
    layoutArchitecture(d);
    expect(overlappingSiblings(d)).toEqual([]);
    const svc = rectOf(d, "svc");
    expect(contains(svc, rectOf(d, "in1"))).toBe(true);
    expect(contains(svc, rectOf(d, "in2"))).toBe(true);
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

/** Distance between two rects along the axis that separates them. */
function gapX(d: ArchDiagram, left: string, right: string): number {
  const a = rectOf(d, left);
  return rectOf(d, right).x - (a.x + a.width);
}
function gapY(d: ArchDiagram, top: string, bottom: string): number {
  const a = rectOf(d, top);
  return rectOf(d, bottom).y - (a.y + a.height);
}

describe("spacing control", () => {
  const pair = () =>
    architecture()
      .app("a", "A")
      .app("b", "B", { hint: { rightOf: "a" } })
      .app("c", "C", { hint: { below: "a" } });

  it("separates the axes", () => {
    const d = pair().spacing({ x: 100, y: 12 }).build();
    layoutArchitecture(d);
    expect(gapX(d, "a", "b")).toBeCloseTo(100, 5);
    expect(gapY(d, "a", "c")).toBeCloseTo(12, 5);
  });

  it("lets the document win over caller options", () => {
    const d = pair().spacing({ x: 100 }).build();
    layoutArchitecture(d, { gapX: 7, gapY: 12 });
    expect(gapX(d, "a", "b")).toBeCloseTo(100, 5); // document
    expect(gapY(d, "a", "c")).toBeCloseTo(12, 5); // option, nothing in the document
  });

  it("falls back gap -> gapX/gapY -> built-in default", () => {
    const viaGap = pair().build();
    layoutArchitecture(viaGap, { gap: 60 });
    expect(gapX(viaGap, "a", "b")).toBeCloseTo(60, 5);
    expect(gapY(viaGap, "a", "c")).toBeCloseTo(60, 5);

    const bare = pair().build();
    layoutArchitecture(bare);
    expect(gapX(bare, "a", "b")).toBeCloseTo(40, 5);
    expect(gapY(bare, "a", "c")).toBeCloseTo(40, 5);
  });

  it("keeps a per-node @gap overriding the scope on its own axis", () => {
    const d = architecture()
      .app("a", "A")
      .app("b", "B", { hint: { rightOf: "a", gap: 5 } })
      .app("c", "C", { hint: { below: "a" } })
      .spacing({ x: 100, y: 100 })
      .build();
    layoutArchitecture(d);
    expect(gapX(d, "a", "b")).toBeCloseTo(5, 5);
    expect(gapY(d, "a", "c")).toBeCloseTo(100, 5);
  });

  it("inherits diagram spacing into a container, and lets the container override it", () => {
    const build = (spacing?: { x?: number; y?: number }) =>
      architecture()
        .app("in1", "In 1")
        .app("in2", "In 2", { hint: { below: "in1" } })
        .container("svc", "Svc", { kind: "service", children: ["in1", "in2"], spacing })
        .spacing({ y: 90 })
        .build();

    const inherited = build();
    layoutArchitecture(inherited);
    expect(gapY(inherited, "in1", "in2")).toBeCloseTo(90, 5);

    const overridden = build({ y: 10 });
    layoutArchitecture(overridden);
    expect(gapY(overridden, "in1", "in2")).toBeCloseTo(10, 5);
  });

  it("reaches a nested container through its parent", () => {
    const d = architecture()
      .app("in1", "In 1")
      .app("in2", "In 2", { hint: { below: "in1" } })
      .container("inner", "Inner", { kind: "service", children: ["in1", "in2"] })
      .container("outer", "Outer", { kind: "group", children: ["inner"], spacing: { y: 70 } })
      .build();
    layoutArchitecture(d);
    expect(gapY(d, "in1", "in2")).toBeCloseTo(70, 5);
  });

  it("applies a per-container padding to its size and its children's offset", () => {
    const wide = architecture()
      .app("in", "In")
      .container("svc", "Svc", { kind: "service", children: ["in"], padding: 60 })
      .build();
    layoutArchitecture(wide);
    const svc = rectOf(wide, "svc");
    const child = rectOf(wide, "in");
    expect(child.x - svc.x).toBeCloseTo(60, 5);
    // Left and right padding both count, plus the header on top.
    expect(svc.x + svc.width - (child.x + child.width)).toBeCloseTo(60, 5);
    expect(svc.y + svc.height - (child.y + child.height)).toBeCloseTo(60, 5);
  });

  it("reserves a band for a corner text instead of letting it fall on the children", () => {
    const plain = parse(`architecture\ngroup g "G" {\napp a "A"\n}`);
    const top = parse(`architecture\ngroup g "G" {\ntext "note"\napp a "A"\n}`);
    const bottom = parse(`architecture\ngroup g "G" {\ntext "note" @corner(bottomLeft)\napp a "A"\n}`);
    const both = parse(
      `architecture\ngroup g "G" {\ntext "top"\ntext "bottom" @corner(bottomRight)\napp a "A"\n}`,
    );
    for (const d of [plain, top, bottom, both]) layoutArchitecture(d);

    const band = 20;
    // A top text pushes the content down; a bottom one only grows the box.
    expect(rectOf(top, "a").y - rectOf(top, "g").y).toBeCloseTo(
      rectOf(plain, "a").y - rectOf(plain, "g").y + band,
      5,
    );
    expect(rectOf(bottom, "a").y - rectOf(bottom, "g").y).toBeCloseTo(
      rectOf(plain, "a").y - rectOf(plain, "g").y,
      5,
    );
    for (const [d, bands] of [
      [top, 1],
      [bottom, 1],
      [both, 2],
    ] as const) {
      expect(rectOf(d, "g").height).toBeCloseTo(rectOf(plain, "g").height + band * bands, 5);
      expect(contains(rectOf(d, "g"), rectOf(d, "a"))).toBe(true);
    }
  });

  it("grows a band by one line per text stacked in the same corner", () => {
    const one = parse(`architecture\ngroup g "G" {\ntext "one"\napp a "A"\n}`);
    const three = parse(`architecture\ngroup g "G" {\ntext "one"\ntext "two"\ntext "three"\napp a "A"\n}`);
    // A shorter stack in the facing corner rides along in the same band.
    const facing = parse(
      `architecture\ngroup g "G" {\ntext "one"\ntext "two"\ntext "three"\ntext "solo" @corner(topRight)\napp a "A"\n}`,
    );
    for (const d of [one, three, facing]) layoutArchitecture(d);

    const band = 20;
    expect(rectOf(three, "g").height).toBeCloseTo(rectOf(one, "g").height + band * 2, 5);
    expect(rectOf(three, "a").y - rectOf(three, "g").y).toBeCloseTo(
      rectOf(one, "a").y - rectOf(one, "g").y + band * 2,
      5,
    );
    expect(rectOf(facing, "g").height).toBeCloseTo(rectOf(three, "g").height, 5);
    for (const d of [three, facing]) expect(contains(rectOf(d, "g"), rectOf(d, "a"))).toBe(true);
  });

  it("widens a group so a long corner text fits inside it", () => {
    const note = "a note far longer than the group would otherwise be";
    const narrow = parse(`architecture\ngroup g "G" {\napp a "A"\n}`);
    const d = parse(`architecture\ngroup g "G" {\ntext "${note}"\napp a "A"\n}`);
    layoutArchitecture(narrow);
    layoutArchitecture(d);
    const g = rectOf(d, "g");
    expect(g.width).toBeGreaterThan(rectOf(narrow, "g").width);
    // 12px inset either side, ~7.2px per glyph at the note size.
    expect(g.width).toBeGreaterThanOrEqual(note.length * 12 * 0.6 + 24);
    expect(contains(g, rectOf(d, "a"))).toBe(true);
  });

  it("uses the margin for the whole drawing, on every side of the SVG", () => {
    const d = architecture().app("a", "A").margin(50).build();
    layoutArchitecture(d);
    const r = rectOf(d, "a");
    expect(r.x).toBeCloseTo(50, 5);
    expect(r.y).toBeCloseTo(50, 5);
    // The renderer trails the same margin, so the whitespace stays symmetric.
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(renderArchitecture(d))!;
    expect(Number(m[1])).toBeCloseTo(r.width + 100, 5);
    expect(Number(m[2])).toBeCloseTo(r.height + 100, 5);
  });
});
