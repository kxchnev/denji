import { describe, expect, it } from "vitest";
import { flowchart, layoutFlowchart, center } from "../src/index.js";
import type { Flowchart, Rect } from "../src/index.js";

function centersById(chart: Flowchart): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  for (const n of chart.nodes) if (n.rect) m.set(n.id, center(n.rect));
  return m;
}

function overlaps(a: Rect, b: Rect, eps = 0.5): boolean {
  return (
    a.x < b.x + b.width - eps &&
    b.x < a.x + a.width - eps &&
    a.y < b.y + b.height - eps &&
    b.y < a.y + a.height - eps
  );
}

describe("layered layout", () => {
  it("ranks a chain top-to-bottom in order", () => {
    const chart = flowchart("TB")
      .node("A")
      .node("B")
      .node("C")
      .node("D")
      .edge("A", "B")
      .edge("B", "C")
      .edge("C", "D")
      .build();
    layoutFlowchart(chart);
    const c = centersById(chart);
    expect(c.get("A")!.y).toBeLessThan(c.get("B")!.y);
    expect(c.get("B")!.y).toBeLessThan(c.get("C")!.y);
    expect(c.get("C")!.y).toBeLessThan(c.get("D")!.y);
  });

  it("sameRank puts two nodes on the same rank", () => {
    const chart = flowchart("TB")
      .node("A")
      .node("B")
      .node("C")
      .node("D", "D", { hint: { sameRank: "C" } })
      .edge("A", "B")
      .edge("B", "C")
      .edge("A", "D")
      .build();
    layoutFlowchart(chart);
    const c = centersById(chart);
    // C is rank 2 (A->B->C); sameRank drags D from rank 1 onto rank 2.
    expect(c.get("C")!.y).toBeCloseTo(c.get("D")!.y, 5);
  });

  it("rightOf orders siblings within a rank", () => {
    const chart = flowchart("TB")
      .node("P")
      .node("X")
      .node("Y", "Y", { hint: { rightOf: "X" } })
      .edge("P", "X")
      .edge("P", "Y")
      .build();
    layoutFlowchart(chart);
    const c = centersById(chart);
    expect(c.get("Y")!.y).toBeCloseTo(c.get("X")!.y, 5); // same rank
    expect(c.get("Y")!.x).toBeGreaterThan(c.get("X")!.x); // Y to the right
  });

  it("produces no overlapping node boxes on a branching graph", () => {
    const chart = flowchart("TB")
      .node("Start", "Start", { shape: "stadium" })
      .node("Split", "Split?", { shape: "diamond" })
      .node("L1", "Left one")
      .node("R1", "Right one")
      .node("L2", "Left two")
      .node("R2", "Right two")
      .node("Join", "Join")
      .edge("Start", "Split")
      .edge("Split", "L1")
      .edge("Split", "R1")
      .edge("L1", "L2")
      .edge("R1", "R2")
      .edge("L2", "Join")
      .edge("R2", "Join")
      .build();
    layoutFlowchart(chart);
    const rects = chart.nodes.map((n) => n.rect!).filter(Boolean);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
      }
    }
  });

  it("is deterministic across runs", () => {
    const make = () =>
      flowchart("LR")
        .node("A")
        .node("B")
        .node("C")
        .node("D")
        .edge("A", "B")
        .edge("A", "C")
        .edge("B", "D")
        .edge("C", "D")
        .build();
    const a = layoutFlowchart(make());
    const b = layoutFlowchart(make());
    const rectsA = a.nodes.map((n) => n.rect);
    const rectsB = b.nodes.map((n) => n.rect);
    expect(rectsA).toEqual(rectsB);
  });

  it("handles a cycle without hanging and lays out every node", () => {
    const chart = flowchart("TB")
      .node("A")
      .node("B")
      .node("C")
      .edge("A", "B")
      .edge("B", "C")
      .edge("C", "A") // back-edge → cycle
      .build();
    layoutFlowchart(chart);
    for (const n of chart.nodes) {
      expect(n.rect).toBeDefined();
      expect(Number.isFinite(n.rect!.x)).toBe(true);
      expect(Number.isFinite(n.rect!.y)).toBe(true);
    }
  });

  it("keeps pinned nodes at their absolute center", () => {
    const chart = flowchart("TB")
      .node("A")
      .node("B")
      .node("P", "Pinned", { hint: { pin: { x: 400, y: 120 } } })
      .edge("A", "B")
      .build();
    layoutFlowchart(chart);
    const c = centersById(chart);
    // No normalization shift expected here (auto nodes stay near origin margin).
    expect(c.get("P")!.x).toBeCloseTo(400, 5);
    expect(c.get("P")!.y).toBeCloseTo(120, 5);
  });
});
