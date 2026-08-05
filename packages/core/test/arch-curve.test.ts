import { describe, expect, it } from "vitest";
import { parseArchitecture as parse } from "../src/dsl/arch-parse.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import {
  cubicAt,
  DOCK_INSET,
  DOCK_PITCH,
  sideNormal,
  type Side,
} from "../src/layout/arch/curve.js";
import type { ArchDiagram, Connection } from "../src/model/arch.js";
import type { Point, Rect } from "../src/model/geometry.js";

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

/** The reach of a control point along its side's normal, and its sideways drift. */
function reach(end: Point, control: Point, side: Side): { along: number; sideways: number } {
  const n = sideNormal(side);
  const dx = control.x - end.x;
  const dy = control.y - end.y;
  return { along: dx * n.x + dy * n.y, sideways: Math.abs(dx * n.y - dy * n.x) };
}

const ends = (c: Connection): [Point, Point] => [c.path![0]!, c.path![c.path!.length - 1]!];

describe("curved connectors", () => {
  it("docks on the borders, away from the corners", () => {
    const d = parse(
      [
        "architecture",
        '  app a "A"',
        '  database b "Store" @rightOf(a)',
        '  app c "C" @below(a)',
        "  a -> b",
        "  a -> c",
        "  b -> c",
      ].join("\n"),
    );
    layoutArchitecture(d);
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

  it("puts both control points on their dock's outward normal", () => {
    // This is the arrowhead guarantee: the marker is oriented by the tangent at
    // the endpoint, and the tangent of a cubic there points at its control point.
    const d = parse(
      [
        "architecture",
        '  app a "A"',
        '  app b "B" @rightOf(a) @below(a)',
        '  queue q "Q" @below(b)',
        "  a -> b",
        "  b -> q",
        "  a -> q",
      ].join("\n"),
    );
    layoutArchitecture(d);
    for (const c of d.connections) {
      const [start, end] = ends(c);
      const from = reach(start, c.curve!.c1, dockOf(start, rectOf(d, c.from)).side);
      const to = reach(end, c.curve!.c2, dockOf(end, rectOf(d, c.to)).side);
      expect(from.sideways).toBeLessThan(0.01);
      expect(to.sideways).toBeLessThan(0.01);
      expect(from.along).toBeGreaterThan(0);
      expect(to.along).toBeGreaterThan(0);
    }
  });

  it("docks across the axis the boxes face each other on", () => {
    const stacked = parse('architecture\n  app a "A"\n  app b "B" @below(a)\n  a -> b\n');
    layoutArchitecture(stacked);
    const sc = stacked.connections[0]!;
    expect(dockOf(ends(sc)[0], rectOf(stacked, "a")).side).toBe("bottom");
    expect(dockOf(ends(sc)[1], rectOf(stacked, "b")).side).toBe("top");

    const side = parse('architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  a -> b\n');
    layoutArchitecture(side);
    const hc = side.connections[0]!;
    expect(dockOf(ends(hc)[0], rectOf(side, "a")).side).toBe("right");
    expect(dockOf(ends(hc)[1], rectOf(side, "b")).side).toBe("left");
  });

  it("spreads a crowded side and spills what does not fit", () => {
    // Five connectors into one 46px-tall shape: its left side holds one dock at
    // the pitch, so the rest must find other sides instead of stacking.
    const d = parse(
      [
        "architecture",
        '  app t "Target"',
        '  app a "A" @leftOf(t)',
        '  app b "B" @above(a)',
        '  app c "C" @below(a)',
        "  a -> t",
        "  b -> t",
        "  c -> t",
      ].join("\n"),
    );
    layoutArchitecture(d);
    const t = rectOf(d, "t");
    const docks = d.connections.map((c) => dockOf(ends(c)[1], t));
    const sides = new Set(docks.map((x) => x.side));
    expect(sides.size).toBeGreaterThan(1);
    // Whatever shares a side keeps at least the pitch between docks.
    for (const side of sides) {
      const along = docks
        .filter((x) => x.side === side)
        .map((x) => x.along)
        .sort((p, q) => p - q);
      for (let i = 1; i < along.length; i++) {
        expect(along[i]! - along[i - 1]!).toBeGreaterThanOrEqual(DOCK_PITCH - 0.01);
      }
    }
  });

  it("puts the label on the curve", () => {
    const d = parse(
      [
        "architecture",
        '  app a "A"',
        '  app b "B" @rightOf(a) @below(a)',
        "  a -> b : reads",
      ].join("\n"),
    );
    layoutArchitecture(d);
    const c = d.connections[0]!;
    const [start, end] = ends(c);
    const mid = cubicAt(start, c.curve!.c1, c.curve!.c2, end, 0.5);
    expect(c.labelPos!.x).toBeCloseTo(mid.x, 6);
    expect(c.labelPos!.y).toBeCloseTo(mid.y, 6);
    // Between the two ends, not off in a corner. (On a symmetric S the curve
    // midpoint and the chord midpoint coincide — that is the shape, not a bug.)
    expect(c.labelPos!.x).toBeGreaterThan(Math.min(start.x, end.x));
    expect(c.labelPos!.x).toBeLessThan(Math.max(start.x, end.x));
  });
});
