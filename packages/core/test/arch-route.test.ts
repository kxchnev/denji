import { describe, expect, it } from "vitest";
import { parseArchitecture as parse } from "../src/dsl/arch-parse.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import { hierarchy } from "../src/layout/arch/graph.js";
import {
  BUS_PITCH,
  CORNER_RADIUS,
  DOCK_INSET,
  DOCK_PITCH,
  DOCK_RUN,
} from "../src/layout/arch/route.js";
import type { ArchDiagram, Connection } from "../src/model/arch.js";
import type { Point, Rect } from "../src/model/geometry.js";

type Side = "top" | "bottom" | "left" | "right";

function rectOf(d: ArchDiagram, id: string): Rect {
  const r = d.nodes.find((n) => n.id === id)?.rect;
  if (!r) throw new Error(`node ${id} not laid out`);
  return r;
}

/** Which border a dock sits on, and how far along it. */
function dockOf(p: Point, r: Rect): { side: Side; along: number } {
  if (Math.abs(p.x - r.x) < 0.6) return { side: "left", along: p.y };
  if (Math.abs(p.x - (r.x + r.width)) < 0.6) return { side: "right", along: p.y };
  if (Math.abs(p.y - r.y) < 0.6) return { side: "top", along: p.x };
  if (Math.abs(p.y - (r.y + r.height)) < 0.6) return { side: "bottom", along: p.x };
  throw new Error(`dock ${p.x},${p.y} is not on the border of ${JSON.stringify(r)}`);
}

const ends = (c: Connection): [Point, Point] => [c.path![0]!, c.path![c.path!.length - 1]!];

/** Does a segment reach into the box, ignoring a hair of line width? */
function hits(a: Point, b: Point, r: Rect): boolean {
  const pad = 1;
  const x0 = r.x + pad;
  const y0 = r.y + pad;
  const x1 = r.x + r.width - pad;
  const y1 = r.y + r.height - pad;
  if (x1 <= x0 || y1 <= y0) return false;
  // Every routed segment is axis-aligned, so this is an interval overlap.
  const lox = Math.min(a.x, b.x);
  const hix = Math.max(a.x, b.x);
  const loy = Math.min(a.y, b.y);
  const hiy = Math.max(a.y, b.y);
  return hix > x0 && lox < x1 && hiy > y0 && loy < y1;
}

/** How many times any two connections cross each other. */
function crossings(d: ArchDiagram): number {
  const side = (a: Point, b: Point, c: Point): number =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  let n = 0;
  for (let i = 0; i < d.connections.length; i++) {
    for (let j = i + 1; j < d.connections.length; j++) {
      const A = d.connections[i]!.path!;
      const B = d.connections[j]!.path!;
      for (let x = 0; x + 1 < A.length; x++) {
        for (let y = 0; y + 1 < B.length; y++) {
          const d1 = side(A[x]!, A[x + 1]!, B[y]!);
          const d2 = side(A[x]!, A[x + 1]!, B[y + 1]!);
          const d3 = side(B[y]!, B[y + 1]!, A[x]!);
          const d4 = side(B[y]!, B[y + 1]!, A[x + 1]!);
          if ((d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)) n++;
        }
      }
    }
  }
  return n;
}

/**
 * Pairs of connections with a stretch drawn as one line: parallel, all but on
 * top of each other, and overlapping far enough along that stretch to read as a
 * single stroke rather than as a crossing.
 */
function overlaid(d: ArchDiagram): Array<[string, string]> {
  interface Run {
    of: string;
    vertical: boolean;
    coord: number;
    lo: number;
    hi: number;
  }
  const runs: Run[] = [];
  for (const c of d.connections) {
    const p = c.path!;
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i]!;
      const b = p[i + 1]!;
      const vertical = Math.abs(a.x - b.x) < 0.01;
      runs.push({
        of: `${c.from}->${c.to}`,
        vertical,
        coord: vertical ? a.x : a.y,
        lo: vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x),
        hi: vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x),
      });
    }
  }
  const out: Array<[string, string]> = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i]!;
      const b = runs[j]!;
      if (a.of === b.of || a.vertical !== b.vertical) continue;
      if (Math.abs(a.coord - b.coord) >= 3) continue;
      if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 8) out.push([a.of, b.of]);
    }
  }
  return out;
}

/** Boxes a connection is allowed to touch: its ends, their containers, their contents. */
function permitted(d: ArchDiagram, c: Connection): Set<string> {
  const { ancestorsOf } = hierarchy(d);
  const out = new Set<string>([c.from, c.to, ...ancestorsOf(c.from), ...ancestorsOf(c.to)]);
  for (const n of d.nodes) {
    if (ancestorsOf(n.id).has(c.from) || ancestorsOf(n.id).has(c.to)) out.add(n.id);
  }
  return out;
}

/** Every box a connection runs over that it had no business touching. */
function trespasses(d: ArchDiagram, c: Connection): string[] {
  const allowed = permitted(d, c);
  const out: string[] = [];
  for (const n of d.nodes) {
    if (!n.rect || allowed.has(n.id)) continue;
    const path = c.path!;
    for (let i = 0; i + 1 < path.length; i++) {
      if (hits(path[i]!, path[i + 1]!, n.rect)) {
        out.push(n.id);
        break;
      }
    }
  }
  return out;
}

describe("routing connectors", () => {
  it("never runs a connection over a box it has nothing to do with", () => {
    // A row of shapes with the two ends far apart: the straight line between
    // them goes through everything in between, so the route must not be straight.
    const d = parse(
      [
        "architecture",
        '  app a "A"',
        '  app b "B" @rightOf(a)',
        '  app c "C" @rightOf(b)',
        '  app e "E" @rightOf(c)',
        '  app f "F" @rightOf(e)',
        "  a -> b",
        "  b -> c",
        "  c -> e",
        "  e -> f",
        "  a -> f",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    for (const c of d.connections) {
      expect(trespasses(d, c), `${c.from} -> ${c.to}`).toEqual([]);
    }
  });

  it("crosses a container's border to reach what is inside it, but nothing else", () => {
    const d = parse(
      [
        "architecture",
        "  service one \"One\" {",
        '    app api "API"',
        "  }",
        "  service two \"Two\" {",
        '    app worker "Worker"',
        "  }",
        '  database far "Far"',
        "  api -> worker",
        "  worker -> far",
        "  api -> far",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    for (const c of d.connections) {
      expect(trespasses(d, c), `${c.from} -> ${c.to}`).toEqual([]);
    }
  });

  it("leaves and enters perpendicular to the border it touches", () => {
    // This is the arrowhead guarantee: the marker is oriented by the direction of
    // the first and last segment, so those have to run straight out of the box.
    const d = parse(
      [
        "architecture",
        '  app a "A"',
        '  app b "B"',
        '  queue q "Q"',
        "  a -> b",
        "  b -> q",
        "  a -> q",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    for (const c of d.connections) {
      const path = c.path!;
      const [start, end] = ends(c);
      const first = { x: path[1]!.x - start.x, y: path[1]!.y - start.y };
      const last = { x: end.x - path[path.length - 2]!.x, y: end.y - path[path.length - 2]!.y };
      for (const [step, side] of [
        [first, dockOf(start, rectOf(d, c.from)).side],
        [last, dockOf(end, rectOf(d, c.to)).side],
      ] as const) {
        const across = side === "left" || side === "right" ? step.y : step.x;
        const along = side === "left" || side === "right" ? step.x : step.y;
        expect(Math.abs(across)).toBeLessThan(0.01);
        expect(Math.abs(along)).toBeGreaterThanOrEqual(DOCK_RUN - 0.01);
      }
    }
  });

  it("docks on the borders, away from the corners", () => {
    const d = parse(
      [
        "architecture",
        '  app a "A"',
        '  database b "Store"',
        '  app c "C"',
        "  a -> b",
        "  a -> c",
        "  b -> c",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    for (const c of d.connections) {
      const [start, end] = ends(c);
      for (const [p, id] of [
        [start, c.from],
        [end, c.to],
      ] as const) {
        const r = rectOf(d, id);
        const dock = dockOf(p, r);
        const span =
          dock.side === "left" || dock.side === "right"
            ? { min: r.y, max: r.y + r.height }
            : { min: r.x, max: r.x + r.width };
        const inset = Math.min(DOCK_INSET, (span.max - span.min) / 2);
        expect(dock.along).toBeGreaterThanOrEqual(span.min + inset - 0.01);
        expect(dock.along).toBeLessThanOrEqual(span.max - inset + 0.01);
      }
    }
  });

  it("keeps the pitch between docks that share one side", () => {
    const d = parse(
      [
        "architecture",
        '  app t "Target"',
        '  app a "A"',
        '  app b "B"',
        '  app c "C"',
        "  a -> t",
        "  b -> t",
        "  c -> t",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    const t = rectOf(d, "t");
    const docks = d.connections.map((c) => dockOf(ends(c)[1], t));
    for (const side of new Set(docks.map((x) => x.side))) {
      const along = docks
        .filter((x) => x.side === side)
        .map((x) => x.along)
        .sort((p, q) => p - q);
      for (let i = 1; i < along.length; i++) {
        expect(along[i]! - along[i - 1]!).toBeGreaterThanOrEqual(DOCK_PITCH - 0.01);
      }
    }
  });

  it("spreads connections that travel together instead of stacking them", () => {
    // Two groups wired across each other: everything has to cross the same gap,
    // which is exactly where lines used to land on top of one another.
    const d = parse(
      [
        "architecture",
        '  group left "Left" {',
        '    app p1 "P1"',
        '    app p2 "P2"',
        '    app p3 "P3"',
        "  }",
        '  group right "Right" {',
        '    app c1 "C1"',
        '    app c2 "C2"',
        '    app c3 "C3"',
        "  }",
        "  p1 -> c2",
        "  p2 -> c3",
        "  p3 -> c1",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });

    // Collect every interior segment, then check that no two that overlap along
    // one line sit closer together than the bus pitch allows.
    interface Seg {
      vertical: boolean;
      coord: number;
      lo: number;
      hi: number;
    }
    const segs: Seg[] = [];
    for (const c of d.connections) {
      const p = c.path!;
      for (let i = 1; i + 2 < p.length; i++) {
        const a = p[i]!;
        const b = p[i + 1]!;
        const vertical = Math.abs(a.x - b.x) < 0.01;
        segs.push({
          vertical,
          coord: vertical ? a.x : a.y,
          lo: vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x),
          hi: vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x),
        });
      }
    }
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const a = segs[i]!;
        const b = segs[j]!;
        if (a.vertical !== b.vertical) continue;
        if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) <= 1) continue;
        const apart = Math.abs(a.coord - b.coord);
        if (apart < 0.01) continue; // the same segment of one bundle's own turn
        expect(apart).toBeGreaterThanOrEqual(1);
      }
    }
    expect(BUS_PITCH).toBeGreaterThan(0);
  });

  it("nests two connections leaving one side the same way, instead of crossing them", () => {
    // Both leave the API's bottom and both turn left. The one going further has
    // to turn first, or the two cross twice on the way out for nothing.
    const d = parse(
      [
        "architecture",
        '  app api "API"',
        '  database near "Near"',
        '  app far "Far"',
        '  queue bus "Bus"',
        "  api -> near",
        "  api -> far",
        "  api -> bus",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    expect(crossings(d)).toBe(0);
  });

  it("never moves a segment that holds a dock", () => {
    // Bundling used to see only the segments it was free to move, so one could
    // settle a few pixels from a dock's own approach — crossing it, and running
    // the length of another connector's arrowhead.
    const d = parse(
      [
        "architecture",
        '  app a "A"',
        '  app b "B"',
        '  queue q "Q"',
        '  database store "Store"',
        '  app w "W"',
        "  a -> b",
        "  b -> q",
        "  q -> w",
        "  b -> w",
        "  w -> store",
        "  w -> b",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    for (const c of d.connections) {
      const path = c.path!;
      const [start, end] = ends(c);
      // A dock still sits on its box's border after everything has been nudged.
      expect(() => dockOf(start, rectOf(d, c.from))).not.toThrow();
      expect(() => dockOf(end, rectOf(d, c.to))).not.toThrow();
      // And both approaches are square to their border, and long enough for the
      // arrowhead to sit on a straight run rather than on the bend before it.
      for (const [step, side] of [
        [{ x: path[1]!.x - start.x, y: path[1]!.y - start.y }, dockOf(start, rectOf(d, c.from)).side],
        [
          { x: end.x - path[path.length - 2]!.x, y: end.y - path[path.length - 2]!.y },
          dockOf(end, rectOf(d, c.to)).side,
        ],
      ] as const) {
        const sideways = side === "left" || side === "right" ? step.y : step.x;
        const outward = side === "left" || side === "right" ? step.x : step.y;
        expect(Math.abs(sideways)).toBeLessThan(0.01);
        expect(Math.abs(outward)).toBeGreaterThanOrEqual(DOCK_RUN - 0.01);
      }
    }
  });

  it("never draws two connectors on the same line", () => {
    // Two lines running along each other are not two lines. Where the space is
    // too tight for the pitch, the pitch wins and one of them sits nearer a box
    // than it would like — that is still readable, and a single line is not.
    const d = parse(
      [
        "architecture",
        '  app auth "Auth"',
        '  app one "One"',
        '  app two "Two"',
        '  app three "Three"',
        '  app four "Four"',
        '  database store "Store"',
        "  one -> auth",
        "  two -> auth",
        "  three -> auth",
        "  four -> auth",
        "  one -> store",
        "  two -> store",
        "  three -> store",
        "  four -> store",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    expect(overlaid(d).map(([a, b]) => `${a} ~ ${b}`)).toEqual([]);
    // The two pulls against each other: a line moved aside to stop it merging
    // must not end up drawn across a box instead. The box wins that argument.
    for (const c of d.connections) {
      expect(trespasses(d, c), `${c.from} -> ${c.to}`).toEqual([]);
    }
  });

  it("widens the gap between layers when several connections must cross it", () => {
    const room = (edges: number): number => {
      const src = [
        "architecture",
        '  app top "Top"',
        '  app bottom "Bottom"',
        ...Array.from({ length: edges }, (_, i) => `  app mid${i} "Mid ${i}"`),
        ...Array.from({ length: edges }, (_, i) => `  top -> mid${i}`),
        ...Array.from({ length: edges }, (_, i) => `  mid${i} -> bottom`),
      ].join("\n");
      const d = parse(src);
      layoutArchitecture(d, { onWarn: () => {} });
      const t = rectOf(d, "top");
      return rectOf(d, "mid0").y - (t.y + t.height);
    };
    // One connection needs one lane; six need six, and the gap has to hold them
    // or the router puts them on top of each other or hard against a box.
    expect(room(6)).toBeGreaterThan(room(1));
  });

  it("docks across the axis the boxes face each other on", () => {
    const stacked = parse('architecture\n  app a "A"\n  app b "B" @below(a)\n  a -> b\n');
    layoutArchitecture(stacked, { onWarn: () => {} });
    const sc = stacked.connections[0]!;
    expect(dockOf(ends(sc)[0], rectOf(stacked, "a")).side).toBe("bottom");
    expect(dockOf(ends(sc)[1], rectOf(stacked, "b")).side).toBe("top");

    const side = parse('architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  a -> b\n');
    layoutArchitecture(side, { onWarn: () => {} });
    const hc = side.connections[0]!;
    expect(dockOf(ends(hc)[0], rectOf(side, "a")).side).toBe("right");
    expect(dockOf(ends(hc)[1], rectOf(side, "b")).side).toBe("left");
  });

  it("puts the label on the path, at half its length", () => {
    const d = parse(['architecture', '  app a "A"', '  app b "B"', "  a -> b : reads"].join("\n"));
    layoutArchitecture(d, { onWarn: () => {} });
    const c = d.connections[0]!;
    const path = c.path!;
    let total = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      total += Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.y - path[i]!.y);
    }
    let upto = 0;
    let found = false;
    for (let i = 0; i + 1 < path.length && !found; i++) {
      const seg = Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.y - path[i]!.y);
      const onSeg =
        Math.min(path[i]!.x, path[i + 1]!.x) - 0.01 <= c.labelPos!.x &&
        c.labelPos!.x <= Math.max(path[i]!.x, path[i + 1]!.x) + 0.01 &&
        Math.min(path[i]!.y, path[i + 1]!.y) - 0.01 <= c.labelPos!.y &&
        c.labelPos!.y <= Math.max(path[i]!.y, path[i + 1]!.y) + 0.01;
      if (onSeg) {
        const to = Math.hypot(c.labelPos!.x - path[i]!.x, c.labelPos!.y - path[i]!.y);
        expect(upto + to).toBeCloseTo(total / 2, 4);
        found = true;
      }
      upto += seg;
    }
    expect(found).toBe(true);
  });

  it("gives every connection a path with a corner radius the renderer can use", () => {
    const d = parse(['architecture', '  app a "A"', '  app b "B"', "  a -> b"].join("\n"));
    layoutArchitecture(d, { onWarn: () => {} });
    for (const c of d.connections) {
      expect(c.path!.length).toBeGreaterThanOrEqual(2);
      expect(c.curve).toBeUndefined();
      expect(c.radius).toBeGreaterThan(0);
    }
  });

  it("asks for no more radius than every corner can be given", () => {
    // A corner is cut back by the radius on both sides, so it needs half of each
    // segment touching it — and the shortest segment this router emits is the run
    // out of a dock, which the test above pins at DOCK_RUN. Ask for more and the
    // renderer hands back a different radius at every corner, which is what made
    // one bend wide and the next one square.
    expect(CORNER_RADIUS).toBe(DOCK_RUN / 2);
    const d = parse(
      [
        "architecture",
        '  app edge "Edge"',
        '  app one "One"',
        '  app two "Two"',
        '  database store "Store"',
        "  edge -> one",
        "  edge -> two",
        "  one -> store",
        "  two -> store",
        "  edge -> store",
      ].join("\n"),
    );
    layoutArchitecture(d, { onWarn: () => {} });
    for (const c of d.connections) {
      const path = c.path!;
      for (const i of [0, path.length - 2]) {
        const a = path[i]!;
        const b = path[i + 1]!;
        expect(Math.hypot(b.x - a.x, b.y - a.y) / 2).toBeGreaterThanOrEqual(c.radius! - 0.01);
      }
    }
  });
});
