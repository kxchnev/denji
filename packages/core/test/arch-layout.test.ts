import { describe, expect, it } from "vitest";
import { architecture } from "../src/model/arch-builder.js";
import { DEFAULT_HEADER_H, layoutArchitecture } from "../src/layout/arch/index.js";
import {
  CAP_RY,
  labelFitWidth,
  measureLabelWidth,
  wrapLabel,
} from "../src/layout/arch/measure.js";
import { renderArchitecture } from "../src/render/arch-svg.js";
import { parseArchitecture as parse } from "../src/dsl/arch-parse.js";
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

  it("arranges nodes nobody hinted, from the connections alone", () => {
    // Nothing in this diagram says where anything goes. The order still has to
    // come out as the flow of the graph, because that is all there is to go on.
    const d = parse(
      [
        "architecture",
        '  database store "Store"',
        '  app api "API"',
        '  app web "Web"',
        "  web -> api",
        "  api -> store",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    expect(rectOf(d, "api").y).toBeGreaterThan(rectOf(d, "web").y);
    expect(rectOf(d, "store").y).toBeGreaterThan(rectOf(d, "api").y);
    expect(overlappingSiblings(d)).toEqual([]);
  });

  it("puts everything that shares a source on one rank", () => {
    const d = parse(
      [
        "architecture",
        '  app gw "Gateway"',
        '  app one "One"',
        '  app two "Two"',
        '  app three "Three"',
        "  gw -> one",
        "  gw -> two",
        "  gw -> three",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    const ys = ["one", "two", "three"].map((id) => rectOf(d, id).y);
    for (const y of ys) expect(y).toBeCloseTo(ys[0]!, 5);
    expect(ys[0]!).toBeGreaterThan(rectOf(d, "gw").y);
    expect(overlappingSiblings(d)).toEqual([]);
  });

  it("reads `rightOf` as an order across the rank, not as a coordinate", () => {
    const d = parse(
      [
        "architecture",
        '  app gw "Gateway"',
        '  app b "B"',
        '  app a "A" @leftOf(b)',
        "  gw -> a",
        "  gw -> b",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    const a = rectOf(d, "a");
    const b = rectOf(d, "b");
    expect(a.y).toBeCloseTo(b.y, 5);
    expect(a.x).toBeLessThan(b.x);
  });

  it("reads `below` as a rank the flow has to reach later", () => {
    const d = parse(
      ["architecture", '  app a "A"', '  app b "B" @below(a)', '  app c "C"'].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    expect(rectOf(d, "b").y).toBeGreaterThan(rectOf(d, "a").y + rectOf(d, "a").height - 1);
    expect(overlappingSiblings(d)).toEqual([]);
  });

  it("keeps a node nothing points at out of everyone else's way", () => {
    // What used to be parked past the whole drawing now simply takes a place of
    // its own. Either way it may not land on anything.
    const d = architecture()
      .app("a", "A")
      .app("loose", "Loose")
      .app("b", "B", { hint: { rightOf: "a" } })
      .build();
    layoutArchitecture(d, { onWarn: () => {} });
    expect(overlappingSiblings(d)).toEqual([]);
    expect(rectOf(d, "a").x).toBeLessThan(rectOf(d, "b").x);
  });

  it("grows a container around a child nothing points at", () => {
    const d = architecture()
      .app("api", "API")
      .database("db", "Postgres")
      .app("helper", "Helper")
      .connect("api", "db")
      .container("svc", "Service", { kind: "service", children: ["api", "db", "helper"] })
      .build();
    layoutArchitecture(d, { onWarn: () => {} });
    const svc = rectOf(d, "svc");
    for (const id of ["api", "db", "helper"]) expect(contains(svc, rectOf(d, id))).toBe(true);
    expect(overlappingSiblings(d)).toEqual([]);
  });

  it("keeps sibling rects disjoint on the reported broken diagram", () => {
    const d = parse(
      [
        "architecture",
        '  app gw "API Gateway"',
        '  service orders "Orders" {',
        '    app oapi "Orders API"',
        '    database odb "Postgres"',
        "    oapi -> odb",
        "  }",
        '  app f "f"',
        '  app b "b"',
        '  service x "x" {',
        '    app z "z"',
        "  }",
        '  service pay "Payments" {',
        '    app papi "Payments API"',
        '    queue pq "Charges"',
        "    papi -> pq",
        "  }",
        '  queue bus "Event Bus"',
        "  gw -> orders : http",
        "  gw -> pay : http",
        "  orders -> bus",
        "  pay -> bus",
        "  orders -- pay",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    expect(overlappingSiblings(d)).toEqual([]);
    // The gateway feeds both services, so it reads above them; the bus collects
    // from both, so it reads below.
    const gw = rectOf(d, "gw");
    for (const id of ["orders", "pay"]) expect(rectOf(d, id).y).toBeGreaterThan(gw.y);
    expect(rectOf(d, "bus").y).toBeGreaterThan(rectOf(d, "orders").y);
  });

  it("places a node whose anchor is not a sibling without stacking it at the origin", () => {
    const d = architecture()
      .app("outside", "Outside")
      .app("in1", "In 1")
      .app("in2", "In 2", { hint: { rightOf: "outside" } }) // not a sibling of in1
      .container("svc", "Svc", { kind: "service", children: ["in1", "in2"] })
      .build();
    layoutArchitecture(d, { onWarn: () => {} });
    expect(overlappingSiblings(d)).toEqual([]);
    const svc = rectOf(d, "svc");
    expect(contains(svc, rectOf(d, "in1"))).toBe(true);
    expect(contains(svc, rectOf(d, "in2"))).toBe(true);
  });

  it("reports a hint cycle instead of hanging on it", () => {
    const warnings: string[] = [];
    const d = architecture()
      .app("a", "A", { hint: { rightOf: "b" } })
      .app("b", "B", { hint: { rightOf: "a" } })
      .build();
    layoutArchitecture(d, { onWarn: (w) => warnings.push(w.code) });
    for (const n of d.nodes) expect(n.rect).toBeDefined();
    expect(warnings).toContain("hint-cycle");
  });

  it("does not call a cycle among the author's connections a problem", () => {
    // A service graph with a loop in it is ordinary. Only hints can contradict.
    const warnings: string[] = [];
    const d = parse(
      [
        "architecture",
        '  app a "A"',
        '  app b "B"',
        '  app c "C"',
        "  a -> b",
        "  b -> c",
        "  c -> a",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: (w) => warnings.push(w.code) });
    expect(warnings).toEqual([]);
    expect(overlappingSiblings(d)).toEqual([]);
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

/** Where the layout put `id` in its own scope's space — what a drag reads. */
function localOf(d: ArchDiagram, id: string): Point {
  const p = node(d, id).local;
  if (!p) throw new Error(`node ${id} not laid out`);
  return p;
}
const laid = (src: string): ArchDiagram => layoutArchitecture(parse(src));

describe("the grid", () => {
  /** Every diagram shape a document can hold, laid out several ways. */
  const corpus = [
    `architecture\napp a "A"\ndatabase b "Postgres" @below(a)\nqueue c "Events" @rightOf(a)\nrect d "D" @below(b)`,
    // Odd-length labels are what used to produce the half pixels: the widths came
    // out of glyph advances, and centring halved the difference between them.
    `architecture\napp a "Gateway"\napp b "X" @below(a)\napp c "Orders API" @below(b)\napp d "Iiii" @below(c)`,
    `architecture\napp hub "Hub"\napp x "X" @rightOf(hub)\napp y "Yyyyyy" @rightOf(hub)\napp z "Z" @rightOf(hub)`,
    `architecture\nservice s "A service with a long title" {\napp a "A"\ndatabase b "B" @below(a)\n}`,
    `architecture\ngroup g "G" {\ntext "a note of odd length"\napp a "Aaa"\napp b "B" @rightOf(a)\n}`,
    `architecture\napp a "A" @icon(postgres)\napp b "" @icon(redis) @below(a)\nqueue q "Q" @icon(kafka) @rightOf(a)`,
    `architecture\nservice o "Orders" {\napp api "API"\ndatabase db "Db" @below(api)\n}\ngroup i "Infra" @rightOf(o) {\napp k "K8s"\n}`,
  ];

  it("puts every unsized shape's width and height on the 8 lattice", () => {
    for (const src of corpus) {
      for (const n of laid(src).nodes) {
        if (n.type !== "shape") continue;
        const r = rectOf(laid(src), n.id);
        expect(r.width % 8, `${n.id} width ${r.width} in ${src}`).toBe(0);
        expect(r.height % 8, `${n.id} height ${r.height} in ${src}`).toBe(0);
      }
    }
  });

  it("puts every coordinate on the 4 lattice", () => {
    for (const src of corpus) {
      const d = laid(src);
      for (const n of d.nodes) {
        const r = rectOf(d, n.id);
        expect(r.x % 4, `${n.id} x ${r.x} in ${src}`).toBe(0);
        expect(r.y % 4, `${n.id} y ${r.y} in ${src}`).toBe(0);
      }
    }
  });

  it("leaves an explicit size exactly as written, lattice or not", () => {
    const d = laid(`architecture\napp a "A" @width(150) @height(45)\napp b "B" @rightOf(a)`);
    const a = rectOf(d, "a");
    expect(a.width).toBe(150);
    expect(a.height).toBe(45);
    // And it is allowed to carry its neighbour off the lattice with it — the
    // author asked for 150, so the gap after it starts at 150.
    expect(rectOf(d, "b").x - a.x).toBe(150 + 40);
  });

});

describe("a scope's own space", () => {
  it("reports a local position for every node, and the origin for a top-level one", () => {
    // `local` is what a drag compares siblings in: `rect` cannot answer, because
    // each scope was packed against its own origin and the drawing was then
    // framed. Nothing writes it into the document — there is nowhere to write it.
    const d = laid(
      'architecture\napp a "A"\nservice s "S" @below(a) {\napp b "B"\napp c "C" @rightOf(b)\n}\na -> b\n',
    );
    for (const n of d.nodes) expect(n.local).toBeDefined();
    // Top level: local is the rect with the framing undone, which is exactly
    // what `originShift` says.
    const shift = d.originShift!;
    for (const id of ["a", "s"]) {
      expect(localOf(d, id)).toEqual({
        x: rectOf(d, id).x - shift.x,
        y: rectOf(d, id).y - shift.y,
      });
    }
  });

  it("measures a container's children from the container, not from the drawing", () => {
    const d = laid(
      'architecture\napp far "Far"\nservice s "S" @below(far) {\napp b "B"\napp c "C" @rightOf(b)\n}\nfar -> b\n',
    );
    // Siblings inside one scope keep their distances in `local`, whatever the
    // container's own position on the drawing is.
    const gap = localOf(d, "c").x - localOf(d, "b").x;
    expect(gap).toBe(rectOf(d, "c").x - rectOf(d, "b").x);
    // And a child's local is smaller than its rect: the container sits somewhere
    // out on the drawing, its children start again from its inner corner.
    expect(localOf(d, "b").x).toBeLessThan(rectOf(d, "b").x);
  });

  it("leaves relative-only diagrams packed against the origin", () => {
    const d = laid('architecture\napp a "A"\napp b "B" @rightOf(a)');
    // Margin 24 on every side.
    expect(rectOf(d, "a").x).toBe(24);
    expect(rectOf(d, "a").y).toBe(24);
  });
});

describe("wrapping a label", () => {
  it("breaks at a space, most evenly", () => {
    // Balanced, not greedy: greedy would give "Wide Data Store" / "Cluster".
    expect(wrapLabel("Wide Data Store Cluster", 80)).toEqual(["Wide Data", "Store Cluster"]);
  });

  it("breaks at a hyphen, and keeps it on the first line", () => {
    // Half the names in a real diagram have no space at all, so without this
    // they could never wrap and the whole scheme would buy nothing.
    expect(wrapLabel("data-mesh-auth-server", 92)).toEqual(["data-mesh-", "auth-server"]);
    expect(wrapLabel("vscode-server", 60)).toEqual(["vscode-", "server"]);
  });

  it("breaks a word that fits no line, rather than widening every box", () => {
    // The trade: one long word must not set the width of the whole diagram.
    expect(wrapLabel("SparkApplication CRD", 98)).toEqual(["SparkAppli-", "cation CRD"]);
  });

  it("leaves a word whole when there is no room to break it readably", () => {
    // `Ми-` / `кро-` / `сер-` helps nobody; let it bleed instead.
    expect(wrapLabel("Микросервис", 10)).toEqual(["Микросервис"]);
  });

  it("puts the surplus back on the last line, as it was written", () => {
    // Never with an invented space where a hyphen broke.
    expect(wrapLabel("data-mesh-auth-server", 92, 2)).toEqual(["data-mesh-", "auth-server"]);
    expect(wrapLabel("one-two-three-four-five", 60, 2)).toEqual(["one-", "two-three-four-five"]);
  });

  it("never breaks inside brackets", () => {
    // `cdp (SQL` / `Server)` is the most balanced cut and it is nonsense.
    expect(wrapLabel("cdp (SQL Server)", 40)).toEqual(["cdp", "(SQL Server)"]);
  });

  it("leaves a word it cannot break alone, on one line", () => {
    expect(wrapLabel("Микросервис", 10)).toEqual(["Микросервис"]);
    expect(wrapLabel("", 100)).toEqual([]);
  });

  it("keeps an author's own newline as a hard break", () => {
    expect(wrapLabel("one\ntwo", 999)).toEqual(["one", "two"]);
  });

  it("fits at the width it says it needs, and never in more than two lines", () => {
    // The contract between the two sides: the layout reserves labelFitWidth,
    // the renderer wraps at whatever it got, and the second must fit the first.
    for (const label of [
      "",
      "A",
      "Debezium",
      "SparkApplication CRD",
      "data-mesh-auth-server",
      "cdp (SQL Server)",
      "БД микросервиса",
      "Wide Data Store Cluster",
    ]) {
      const fit = labelFitWidth(label);
      for (const extra of [0, 1, 40]) {
        const lines = wrapLabel(label, fit + extra);
        expect(lines.length, label).toBeLessThanOrEqual(2);
        for (const line of lines) {
          expect(measureLabelWidth(line), `${label} @ ${fit + extra}`).toBeLessThanOrEqual(fit + extra);
        }
      }
    }
  });
});

describe("one size for every leaf", () => {
  const widths = (d: ReturnType<typeof parse>, ids: string[]) =>
    ids.map((id) => rectOf(d, id).width);

  it("gives every shape the same width, whatever its label", () => {
    const d = parse(
      'architecture\n  app a "A"\n  app b "Storefront service" @rightOf(a)\n  rect c "C" @rightOf(b)\n  queue q "Events" @rightOf(c)\n',
    );
    layoutArchitecture(d);
    const [wa, wb, wc] = widths(d, ["a", "b", "c"]);
    expect(wa).toBe(wb);
    expect(wc).toBe(wb);
  });

  it("makes a queue a pipe: plainly wider than it is tall", () => {
    // Transposing the barrel is not enough — it is only just taller than it is
    // wide, so laid on its side it still read as upright.
    const d = parse('architecture\n  database b "Ledger"\n  queue q "Events" @rightOf(b)\n');
    layoutArchitecture(d);
    const db = rectOf(d, "b");
    const q = rectOf(d, "q");
    expect(db.height).toBeGreaterThan(db.width);
    expect(q.width).toBeGreaterThan(q.height);
    // And derived from the barrel, not from its own label: shorter than one.
    expect(q.height).toBeLessThan(db.height);
  });

  it("makes a database narrower and taller — a barrel, not a pancake", () => {
    const d = parse(
      'architecture\n  app a "Orders API"\n  database b "Ledger" @rightOf(a)\n',
    );
    layoutArchitecture(d);
    const app = rectOf(d, "a");
    const db = rectOf(d, "b");
    expect(db.width).toBeLessThan(app.width);
    // Taller than it is wide: a barrel, not a pancake. Its height comes from its
    // width, never from the lines of text inside it.
    expect(db.height).toBeGreaterThan(db.width);
    expect(db.height).toBeGreaterThan(app.height);
  });

  it("widens the shared width rather than fattening the barrel", () => {
    // The longest name in the document belongs to a database: the rule that has
    // to give is "everyone is as narrow as possible", never "a database is narrow".
    const d = parse('architecture\n  app a "A"\n  database b "Very long database name" @rightOf(a)\n');
    layoutArchitecture(d);
    expect(rectOf(d, "b").width).toBeLessThan(rectOf(d, "a").width);
    expect(rectOf(d, "a").width).toBeGreaterThan(96);
  });

  it("does not let one hand-sized shape drag the rest along with it", () => {
    // @width is an escape hatch, not a lever: the author said "this one is wide",
    // not "make everything wide".
    const d = parse('architecture\n  app a "A" @width(400)\n  app b "B" @rightOf(a)\n');
    layoutArchitecture(d);
    expect(rectOf(d, "a").width).toBe(400);
    expect(rectOf(d, "b").width).toBe(96);
  });

  it("leaves a bare mark as a mark", () => {
    // Otherwise four badges in a row become four empty plates.
    const d = parse(
      'architecture\n  app long "A very long label indeed"\n  app icon "" @icon(react) @rightOf(long)\n',
    );
    layoutArchitecture(d);
    expect(rectOf(d, "icon").width).toBeLessThan(rectOf(d, "long").width);
    expect(rectOf(d, "icon").width).toBe(rectOf(d, "icon").height);
  });

  it("keeps a one-line and a two-line label in the same box", () => {
    const d = parse('architecture\n  app a "A"\n  app b "Storefront web service" @rightOf(a)\n');
    layoutArchitecture(d);
    expect(rectOf(d, "a").height).toBe(rectOf(d, "b").height);
    expect(rectOf(d, "a").width).toBe(rectOf(d, "b").width);
  });
});

describe("headerless containers", () => {
  const laid = (src: string): ArchDiagram => {
    const d = parse(src);
    layoutArchitecture(d, { onWarn: () => {} });
    return d;
  };
  const wrap = (decl: string): string =>
    `architecture\n  ${decl} {\n    app a "A"\n    app b "B"\n    a -> b\n  }\n`;

  it("reserves no title band when there is nothing to draw in one", () => {
    // No label, no padding: the wrapper's silhouette is exactly its children.
    const d = laid(wrap('group g "" @padding(0)'));
    const g = rectOf(d, "g");
    const a = rectOf(d, "a");
    const b = rectOf(d, "b");
    expect(g.y).toBe(a.y);
    expect(g.x).toBe(Math.min(a.x, b.x));
    expect(g.height).toBe(Math.max(a.y + a.height, b.y + b.height) - g.y);
    expect(g.width).toBe(Math.max(a.x + a.width, b.x + b.width) - g.x);
  });

  it("keeps the band as soon as the header has anything to say", () => {
    for (const decl of [
      'group g "G" @padding(0)',
      'group g "" @padding(0) @icon(react)',
      'group g "" @padding(0) @link(https://x.com)',
    ]) {
      const d = laid(wrap(decl));
      expect(rectOf(d, "a").y - rectOf(d, "g").y).toBe(DEFAULT_HEADER_H);
    }
  });
});

