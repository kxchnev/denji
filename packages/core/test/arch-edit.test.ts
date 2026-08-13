import { describe, expect, it } from "vitest";
import { setNodePosition, setNodePositions, setNodeRelation } from "../src/dsl/arch-edit.js";
import { parseArchitecture as parse } from "../src/dsl/arch-parse.js";

/** The line `id` is declared on, for asserting on one line at a time. */
const lineOf = (src: string, id: string): string => {
  const line = src.split("\n").find((l) => new RegExp(`\\b${id}\\b`).test(l));
  if (line === undefined) throw new Error(`no line mentions ${id}`);
  return line;
};

describe("setNodePosition", () => {
  it("adds coordinates to a bare declaration, keeping the indent and label", () => {
    const src = 'architecture\n  app api "Orders API"\n';
    const out = setNodePosition(src, "api", { x: 40, y: 120 })!;
    expect(lineOf(out, "api")).toBe('  app api "Orders API" @at(40, 120)');
    expect(out.startsWith("architecture\n")).toBe(true);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("replaces coordinates it already has instead of stacking them", () => {
    const src = 'architecture\n  app api "API" @at(8, 8)\n';
    const out = setNodePosition(src, "api", { x: 24, y: 0 })!;
    expect(lineOf(out, "api")).toBe('  app api "API" @at(24, 0)');
    // Idempotent: writing the same position back changes nothing at all.
    expect(setNodePosition(out, "api", { x: 24, y: 0 })).toBe(out);
  });

  it("drops the node's own relations but keeps everything else on the line", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a) @gap(10) @align(start) @style(hot) @icon(redis) @fill(#fff)\n';
    const out = setNodePosition(src, "b", { x: 100, y: 0 })!;
    expect(lineOf(out, "b")).toBe(
      '  app b "B" @at(100, 0) @style(hot) @icon(redis) @fill(#fff)',
    );
  });

  it("strips a nudge along with the other refinements — exact coordinates answer it", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a) @nudge(-40, 0)\n';
    const out = setNodePosition(src, "b", { x: 100, y: 0 })!;
    expect(lineOf(out, "b")).toBe('  app b "B" @at(100, 0)');
  });

  it("leaves other nodes' relations pointing at the moved node", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a)\n';
    const out = setNodePosition(src, "a", { x: 16, y: 16 })!;
    expect(lineOf(out, "b")).toContain("@rightOf(a)");
  });

  it("writes a container's coordinates before its opening brace", () => {
    const src = 'architecture\n  service s "Orders" @below(x) @padding(8) {\n    app a "A"\n  }\n';
    const out = setNodePosition(src, "s", { x: 0, y: 200 })!;
    expect(lineOf(out, "s")).toBe('  service s "Orders" @at(0, 200) @padding(8) {');
    // The children's own lines are none of this edit's business.
    expect(lineOf(out, "app a")).toBe('    app a "A"');
  });

  it("handles a declaration with no label and rounds to whole pixels", () => {
    const out = setNodePosition("architecture\napp api\n", "api", { x: 12.4, y: -7.6 })!;
    expect(lineOf(out, "api")).toBe("app api @at(12, -8)");
    expect(parse(out).nodes[0]!.hint?.at).toEqual({ x: 12, y: -8 });
  });

  it("never confuses a connection or a comment for a declaration", () => {
    const src = 'architecture\n  app app "A"\n  app db "D"\n  # app db is a lie\n  app -> db\n';
    const out = setNodePosition(src, "db", { x: 8, y: 8 })!;
    expect(out).toContain('app db "D" @at(8, 8)');
    expect(out).toContain("  # app db is a lie");
    expect(out).toContain("  app -> db\n");
  });

  it("keeps CRLF line endings as it found them", () => {
    const out = setNodePosition('architecture\r\n  app a "A"\r\n', "a", { x: 1, y: 2 })!;
    expect(out).toBe('architecture\r\n  app a "A" @at(1, 2)\r\n');
  });

  it("returns null for a node the document does not declare", () => {
    expect(setNodePosition('architecture\n  app a "A"\n', "nope", { x: 0, y: 0 })).toBeNull();
  });
});

describe("setNodeRelation", () => {
  it("keeps a nudge when re-aiming a relation — a drag does not undo a fine-tune", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a) @nudge(-40, 0)\n';
    const out = setNodeRelation(src, "b", "below", "a")!;
    expect(lineOf(out, "b")).toBe('  app b "B" @below(a) @nudge(-40, 0)');
  });
});

describe("setNodePositions", () => {
  it("pins several nodes in one pass", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  app c "C" @rightOf(b)\n';
    const out = setNodePositions(src, [
      { id: "a", at: { x: 0, y: 0 } },
      { id: "b", at: { x: 140, y: 0 } },
      { id: "c", at: { x: 280, y: 0 } },
    ])!;
    expect(out).toBe(
      'architecture\n  app a "A" @at(0, 0)\n  app b "B" @at(140, 0)\n  app c "C" @at(280, 0)\n',
    );
  });

  it("skips ids it cannot find, and reports null only when none landed", () => {
    const src = 'architecture\n  app a "A"\n';
    expect(setNodePositions(src, [{ id: "gone", at: { x: 0, y: 0 } }])).toBeNull();
    expect(
      setNodePositions(src, [
        { id: "gone", at: { x: 0, y: 0 } },
        { id: "a", at: { x: 8, y: 8 } },
      ]),
    ).toBe('architecture\n  app a "A" @at(8, 8)\n');
  });
});
