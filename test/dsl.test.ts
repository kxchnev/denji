import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFlowchart, DiagramParseError, toSvg } from "../src/index.js";
import type { Flowchart, FlowNode } from "../src/index.js";

function node(chart: Flowchart, id: string): FlowNode {
  const n = chart.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

describe("DSL parser", () => {
  it("parses every shape wrapper", () => {
    const chart = parseFlowchart(`
      flowchart TB
      a[Rect]
      b(Round)
      c([Stadium])
      d{Diamond}
      e((Circle))
      f{{Hexagon}}
      g
    `);
    expect(node(chart, "a").shape).toBe("rect");
    expect(node(chart, "b").shape).toBe("round");
    expect(node(chart, "c").shape).toBe("stadium");
    expect(node(chart, "d").shape).toBe("diamond");
    expect(node(chart, "e").shape).toBe("circle");
    expect(node(chart, "f").shape).toBe("hexagon");
    expect(node(chart, "g").shape).toBe("rect"); // bare id → rect
    expect(node(chart, "c").label).toBe("Stadium");
  });

  it("maps edge operators to styles and heads", () => {
    const chart = parseFlowchart(`
      flowchart TB
      A -> B
      B --> C
      C -.-> D
      D ==> E
      E --- F
    `);
    const e = chart.edges;
    expect(e[0]).toMatchObject({ from: "A", to: "B", style: "solid", head: "arrow" });
    expect(e[1]).toMatchObject({ style: "solid", head: "arrow" });
    expect(e[2]).toMatchObject({ style: "dashed", head: "arrow" });
    expect(e[3]).toMatchObject({ style: "thick", head: "arrow" });
    expect(e[4]).toMatchObject({ style: "solid", head: "none" });
  });

  it("reads edge labels via `: label` and both pipe positions", () => {
    const chart = parseFlowchart(`
      flowchart TB
      A -> B : trailing
      A -->|before| C
      A --> D |after|
    `);
    expect(chart.edges[0]!.label).toBe("trailing");
    expect(chart.edges[1]!.label).toBe("before");
    expect(chart.edges[2]!.label).toBe("after");
  });

  it("applies @-directives to the layout hint", () => {
    const chart = parseFlowchart(`
      flowchart TB
      A[Start]
      B{Ready?} @below(A)
      C(Ship) @rightOf(B) @gap(30)
      D(Fix) @pin(320,240)
      E @sameRank(C) @leftOf(D) @above(A)
    `);
    expect(node(chart, "B").hint).toMatchObject({ below: "A" });
    expect(node(chart, "C").hint).toMatchObject({ rightOf: "B", gap: 30 });
    expect(node(chart, "D").hint!.pin).toEqual({ x: 320, y: 240 });
    expect(node(chart, "E").hint).toMatchObject({ sameRank: "C", leftOf: "D", above: "A" });
  });

  it("registers inline node definitions from edge endpoints", () => {
    const chart = parseFlowchart(`
      flowchart LR
      A[Start] -> B{Check}
    `);
    expect(node(chart, "A").shape).toBe("rect");
    expect(node(chart, "A").label).toBe("Start");
    expect(node(chart, "B").shape).toBe("diamond");
  });

  it("auto-creates nodes referenced only in edges", () => {
    const chart = parseFlowchart(`
      flowchart TB
      X -> Y
    `);
    expect(node(chart, "X").shape).toBe("rect");
    expect(node(chart, "Y").label).toBe("Y");
  });

  it("parses direction, defaulting to TB", () => {
    expect(parseFlowchart("flowchart LR\nA -> B").direction).toBe("LR");
    expect(parseFlowchart("flowchart\nA -> B").direction).toBe("TB");
    expect(parseFlowchart("A -> B").direction).toBe("TB"); // no header
  });

  it("throws DiagramParseError with the right line for bad input", () => {
    let err: unknown;
    try {
      parseFlowchart("flowchart TB\nA[Start]\nB{Ready?} @wat(A)\n");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DiagramParseError);
    expect((err as DiagramParseError).line).toBe(3);

    expect(() => parseFlowchart("flowchart TB\nA[oops")).toThrow(DiagramParseError);
  });

  it("round-trips the basic.pwr example end-to-end", () => {
    const src = readFileSync(new URL("../examples/basic.pwr", import.meta.url), "utf8");
    const chart = parseFlowchart(src);
    expect(chart.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "C", "D"]);
    expect(chart.edges).toHaveLength(4);
    expect(node(chart, "D").hint!.pin).toEqual({ x: 320, y: 240 });
    expect(() => toSvg(chart)).not.toThrow();
  });
});
