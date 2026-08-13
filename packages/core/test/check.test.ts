import { describe, it, expect, vi } from "vitest";
import { checkDiagram, type DiagnosticCode } from "../src/check.js";

const codes = (src: string): DiagnosticCode[] =>
  checkDiagram(src).diagnostics.map((d) => d.code);

describe("checkDiagram — errors", () => {
  it("reports a parse error with its position", () => {
    const { diagnostics, failed } = checkDiagram('architecture\n  app a "A" @nope(1)\n');
    expect(failed).toBe(true);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: "error",
      code: "parse-error",
      message: "unknown directive @nope",
      line: 2,
    });
    expect(diagnostics[0]!.srcLine).toContain("@nope");
  });

  it("recovers a line for build errors, which throw without one", () => {
    const { diagnostics, failed } = checkDiagram(
      'architecture\n  app a "A"\n  app a "Again"\n',
    );
    expect(failed).toBe(true);
    expect(diagnostics[0]).toMatchObject({ code: "build-error", line: 3 });
    expect(diagnostics[0]!.message).toContain("Duplicate node id");
  });

  it("does not invent a line when the message names nothing", () => {
    // An unclosed container is reported at the last line with no source text.
    const { diagnostics } = checkDiagram('architecture\n  service s "S" {\n');
    expect(diagnostics[0]!.code).toBe("parse-error");
    expect(diagnostics[0]!.message).toContain("unclosed container");
  });

  it("stops at the error rather than also reporting layout warnings", () => {
    expect(codes('architecture\n  app a "A" @nope(1)\n')).toEqual(["parse-error"]);
  });
});

describe("checkDiagram — a well-formed diagram is silent", () => {
  it("says nothing about a connected, hinted diagram", () => {
    const src = [
      "architecture",
      '  app gw "API Gateway"',
      '  service orders "Orders" @below(gw) {',
      '    app api "API"',
      '    database db "Postgres" @below(api)',
      "    api -> db",
      "  }",
      "  gw -> orders : http",
    ].join("\n");
    expect(codes(src)).toEqual([]);
  });

  it("leaves a lone shape alone — something has to be the origin", () => {
    expect(codes('architecture\n  app a "A"\n')).toEqual([]);
  });
});

describe("checkDiagram — layout warnings", () => {
  // No DSL is known to produce overlapping siblings: slide-clear resolves every
  // contested slot, including a zero gap and a hint cycle. So this check is a
  // regression guard, and what is testable today is that it does not fire on the
  // shapes most likely to trip it. `npm run -w docs validate` runs the same
  // check over all 39 documented examples.
  it.each([
    ["two nodes contesting one slot", 'app a "A"\n  app b "B" @rightOf(a)\n  app c "C" @rightOf(a)'],
    ["a zero gap", 'app a "A"\n  app b "B" @below(a) @gap(0)\n  app c "C" @below(a) @gap(0)'],
    ["a hint cycle", 'app a "A" @rightOf(b)\n  app b "B" @rightOf(a)'],
  ])("does not report an overlap for %s", (_name, body) => {
    const found = checkDiagram(`architecture\n  ${body}\n`).diagnostics.filter(
      (d) => d.code === "overlapping-siblings",
    );
    expect(found).toEqual([]);
  });

  it("flags a hint cycle and names the nodes", () => {
    const src = 'architecture\n  app a "A" @rightOf(b)\n  app b "B" @rightOf(a)\n';
    const cycle = checkDiagram(src).diagnostics.find((d) => d.code === "hint-cycle");
    expect(cycle).toBeDefined();
    expect(cycle!.nodes).toEqual(expect.arrayContaining(["a"]));
  });

  it("routes the cycle to onWarn instead of the console", () => {
    // The layout used to console.warn this; check has to collect it instead.
    const src = 'architecture\n  app a "A" @rightOf(b)\n  app b "B" @rightOf(a)\n';
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkDiagram(src);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("says nothing about a node that wrote no hint — the connections place it", () => {
    // This used to be the single most common complaint the checker had: a node
    // nothing pointed at got parked past the whole drawing. Now the graph puts
    // it where it belongs, so there is no surprise left to report.
    const src = [
      "architecture",
      '  app a "A"',
      '  app b "B"',
      '  app c "C"',
      "  a -> b",
      "  b -> c",
    ].join("\n");
    expect(codes(src)).toEqual([]);
  });

  it("says nothing about a node that wrote a hint", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  a -> b\n';
    expect(codes(src)).toEqual([]);
  });

  it("flags a shape nobody connects to", () => {
    const src = [
      "architecture",
      '  app a "A"',
      '  app b "B" @rightOf(a)',
      '  app c "C" @below(a)',
      "  a -> b",
    ].join("\n");
    const un = checkDiagram(src).diagnostics.filter((d) => d.code === "unconnected-node");
    expect(un.map((d) => d.nodes?.[0])).toEqual(["c"]);
  });

  it("stays quiet about connectivity when nothing is connected at all", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a)\n';
    expect(codes(src)).not.toContain("unconnected-node");
  });

  it("counts a child as connected when its container carries the edge", () => {
    const src = [
      "architecture",
      '  app gw "GW"',
      '  service s "S" @below(gw) {',
      '    app api "API"',
      "  }",
      "  gw -> s",
    ].join("\n");
    expect(codes(src)).not.toContain("unconnected-node");
  });

  it("flags a diagram that has become a strip", () => {
    const chain = ["architecture", '  app a0 "S0"'];
    for (let i = 1; i < 6; i++) chain.push(`  app a${i} "S${i}" @rightOf(a${i - 1})`);
    for (let i = 1; i < 6; i++) chain.push(`  a${i - 1} -> a${i}`);
    expect(codes(chain.join("\n"))).toContain("extreme-aspect-ratio");
  });

  it("does not judge the shape of a small diagram", () => {
    expect(codes('architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  a -> b\n')).toEqual([]);
  });
});

describe("checkDiagram — exact coordinates", () => {
  it("leaves a diagram placed by coordinates alone", () => {
    expect(codes('architecture\n  app a "A" @at(0, 0)\n  app b "B" @at(0, 200)\n  a -> b\n')).toEqual(
      [],
    );
  });

  it("flags a relation that coordinates have made dead", () => {
    const { diagnostics } = checkDiagram(
      'architecture\n  app a "A"\n  app b "B" @rightOf(a) @at(0, 200)\n',
    );
    const dead = diagnostics.find((d) => d.code === "at-overrides-hint")!;
    expect(dead).toMatchObject({ severity: "warning", nodes: ["b"] });
    expect(dead.message).toContain("@rightOf");
    // Pointing *at* a pinned node is fine, and stays unflagged.
    expect(codes('architecture\n  app a "A" @at(0, 0)\n  app b "B" @rightOf(a)\n')).not.toContain(
      "at-overrides-hint",
    );
  });

  it("flags a nudge that coordinates have made dead", () => {
    const { diagnostics } = checkDiagram(
      'architecture\n  app a "A" @nudge(-40, 0) @at(0, 0)\n  app b "B" @at(0, 200)\n',
    );
    const dead = diagnostics.find((d) => d.code === "at-overrides-hint")!;
    expect(dead).toMatchObject({ severity: "warning", nodes: ["a"] });
    expect(dead.message).toContain("@nudge");
  });
});

/**
 * A finding with nowhere to go is barely a finding: a reader cannot jump to it,
 * an editor cannot underline it, and `power check` can only name the file. Every
 * warning already knew which nodes it was about, so the position was always
 * derivable — these pin that it is actually derived, and derived correctly.
 */
describe("checkDiagram — every finding says where", () => {
  /** The text a diagnostic's own span covers, as the reader would see it. */
  const spanOf = (d: { srcLine?: string; col: number | null; endCol?: number | null }): string =>
    (d.srcLine ?? "").slice((d.col ?? 1) - 1, (d.endCol ?? 1) - 1);

  const find = (src: string, code: DiagnosticCode) => {
    const d = checkDiagram(src).diagnostics.find((x) => x.code === code);
    if (!d) throw new Error(`no ${code} in:\n${src}`);
    return d;
  };

  it("points a dead relation at its own declaration, under the id", () => {
    const src = [
      "architecture",
      '  app a "A"',
      '  app b "B" @rightOf(a)',
      '  app stray "Stray" @rightOf(a) @at(0, 300)',
    ].join("\n");
    const d = find(src, "at-overrides-hint");
    expect(d.line).toBe(4);
    expect(spanOf(d)).toBe("stray");
    expect(d.srcLine).toContain("Stray");
  });

  it("points an unconnected shape at its declaration", () => {
    const src = [
      "architecture",
      '  app a "A"',
      '  app b "B" @rightOf(a)',
      '  app lonely "L" @below(a)',
      "  a -> b",
    ].join("\n");
    const d = find(src, "unconnected-node");
    expect(d.line).toBe(4);
    expect(spanOf(d)).toBe("lonely");
  });

  it("points a dead relation at the node carrying it", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a) @at(0, 200)\n';
    const d = find(src, "at-overrides-hint");
    expect(d.line).toBe(3);
    expect(spanOf(d)).toBe("b");
  });

  it("points a hint cycle at the first node it names", () => {
    const src = 'architecture\n  app a "A" @rightOf(b)\n  app b "B" @rightOf(a)\n';
    const d = find(src, "hint-cycle");
    expect(d.line).not.toBeNull();
    expect(spanOf(d)).toBe(d.nodes![0]);
  });

  it("points a strip at the architecture line, where the fix goes", () => {
    const chain = ["# a note first, so line 1 is not the header", "architecture", '  app a0 "S0"'];
    for (let i = 1; i < 6; i++) chain.push(`  app a${i} "S${i}" @rightOf(a${i - 1})`);
    for (let i = 1; i < 6; i++) chain.push(`  a${i - 1} -> a${i}`);
    const d = find(chain.join("\n"), "extreme-aspect-ratio");
    expect(d.line).toBe(2);
    expect(spanOf(d)).toBe("architecture");
    // It is about the drawing, not about any one node.
    expect(d.nodes).toBeUndefined();
  });

  it("finds a declaration indented inside a container", () => {
    const src = [
      "architecture",
      '  app gw "GW"',
      '  service s "S" @below(gw) {',
      '    app api "API"',
      '    app orphan "Orphan" @rightOf(api)',
      "  }",
      // The container itself is not connected, so it cannot vouch for its child.
      "  gw -> api",
    ].join("\n");
    const d = find(src, "unconnected-node");
    expect(d.line).toBe(5);
    expect(spanOf(d)).toBe("orphan");
    expect(d.col).toBe(9); // past the four spaces and "app "
  });

  it("recovers a build error's position, under the offending id", () => {
    const d = find('architecture\n  app a "A"\n  app a "Again"\n', "build-error");
    expect(d.line).toBe(3);
    expect(spanOf(d)).toBe("a");
  });

  it("does not point a parse error at a span it cannot measure", () => {
    const d = find('architecture\n  app a "A" @nope(1)\n', "parse-error");
    expect(d.line).toBe(2);
    expect(d.endCol ?? null).toBeNull();
  });

  it("never picks an id out of a comment or a connection", () => {
    const src = [
      "architecture",
      "  # app stray is only mentioned here",
      '  app a "A"',
      '  app b "B" @rightOf(a)',
      '  app stray "Stray" @below(a) @at(0, 300)',
      "  a -> stray",
    ].join("\n");
    const d = find(src, "at-overrides-hint");
    expect(d.line).toBe(5);
    expect(d.srcLine).toContain('"Stray"');
  });
});
