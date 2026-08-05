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

  it("flags loose nodes but exempts the scope's first declared node", () => {
    const src = [
      "architecture",
      '  app a "A"',
      '  app b "B" @rightOf(a)',
      '  app c "C"',
      '  app d "D"',
    ].join("\n");
    const loose = checkDiagram(src)
      .diagnostics.filter((d) => d.code === "loose-node")
      .flatMap((d) => d.nodes ?? []);
    // `a` is anchored-to so it opens the block; c and d each start their own and
    // get parked to the right, which is the surprise worth reporting.
    expect(loose).toEqual(["c", "d"]);
  });

  it("does not call a node loose when something anchors to it", () => {
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
  it("does not call a pinned node loose", () => {
    // Without coordinates this is the textbook loose node.
    expect(codes('architecture\n  app a "A"\n  app b "B"\n')).toContain("loose-node");
    expect(codes('architecture\n  app a "A"\n  app b "B" @at(0, 200)\n')).not.toContain(
      "loose-node",
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
});
