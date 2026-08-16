import { describe, expect, it } from "vitest";
import { setNodeRelation } from "../src/dsl/arch-edit.js";
import { parseArchitecture as parse } from "../src/dsl/arch-parse.js";

/** The line `id` is declared on, for asserting on one line at a time. */
const lineOf = (src: string, id: string): string => {
  const line = src.split("\n").find((l) => new RegExp(`\\b${id}\\b`).test(l));
  if (line === undefined) throw new Error(`no line mentions ${id}`);
  return line;
};

/**
 * The one edit an interactive viewer makes. Everything here is about leaving the
 * author's file exactly as it was apart from the one thing the drop said — the
 * playground and the VS Code extension both write through this, and the
 * extension turns the result into a line diff, which only works because the line
 * count never moves.
 */
describe("setNodeRelation", () => {
  it("adds a relation to a bare declaration, keeping the indent and label", () => {
    const src = 'architecture\n  app orders "Orders"\n  app api "Orders API"\n';
    const out = setNodeRelation(src, "api", "rightOf", "orders")!;
    expect(lineOf(out, "api")).toBe('  app api "Orders API" @rightOf(orders)');
    expect(out.startsWith("architecture\n")).toBe(true);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("replaces the relation it already has instead of stacking them", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a)\n';
    const out = setNodeRelation(src, "b", "below", "a")!;
    expect(lineOf(out, "b")).toBe('  app b "B" @below(a)');
    // Idempotent: writing the same relation back changes nothing at all, which
    // is what lets a viewer commit on every drop without inventing undo steps.
    expect(setNodeRelation(out, "b", "below", "a")).toBe(out);
  });

  it("drops the node's own relations but keeps everything else on the line", () => {
    const src =
      'architecture\n  app a "A"\n  app b "B" @above(a) @gap(10) @style(hot) @icon(redis) @fill(#fff)\n';
    const out = setNodeRelation(src, "b", "rightOf", "a")!;
    // `@gap` survives on purpose: re-aiming a relation does not answer how far
    // away the node should sit, so the author's distance is still theirs.
    expect(lineOf(out, "b")).toBe(
      '  app b "B" @rightOf(a) @gap(10) @style(hot) @icon(redis) @fill(#fff)',
    );
  });

  it("leaves other nodes' relations pointing at the moved node", () => {
    const src = 'architecture\n  app a "A"\n  app b "B" @rightOf(a)\n  app c "C" @below(a)\n';
    const out = setNodeRelation(src, "a", "rightOf", "c")!;
    expect(lineOf(out, "b")).toContain("@rightOf(a)");
  });

  it("writes a container's relation before its opening brace", () => {
    const src = 'architecture\n  service s "Orders" @below(x) @padding(8) {\n    app a "A"\n  }\n';
    const out = setNodeRelation(src, "s", "rightOf", "x")!;
    expect(lineOf(out, "s")).toBe('  service s "Orders" @rightOf(x) @padding(8) {');
    // The children's own lines are none of this edit's business.
    expect(lineOf(out, "app a")).toBe('    app a "A"');
  });

  it("handles a declaration with no label", () => {
    const out = setNodeRelation("architecture\napp a\napp api\n", "api", "below", "a")!;
    expect(lineOf(out, "api")).toBe("app api @below(a)");
    expect(parse(out).nodes[1]!.hint).toEqual({ below: "a" });
  });

  it("never confuses a connection or a comment for a declaration", () => {
    const src = 'architecture\n  app app "A"\n  app db "D"\n  # app db is a lie\n  app -> db\n';
    const out = setNodeRelation(src, "db", "rightOf", "app")!;
    expect(out).toContain('app db "D" @rightOf(app)');
    expect(out).toContain("  # app db is a lie");
    expect(out).toContain("  app -> db\n");
  });

  it("keeps CRLF line endings as it found them", () => {
    const out = setNodeRelation('architecture\r\n  app a "A"\r\n  app b "B"\r\n', "b", "rightOf", "a")!;
    expect(out).toBe('architecture\r\n  app a "A"\r\n  app b "B" @rightOf(a)\r\n');
  });

  it("never changes the number of lines, whatever it rewrites", () => {
    const src = 'architecture\n  app a "A"\n  service s "S" @below(a) {\n    app b "B"\n  }\n';
    for (const [id, side] of [
      ["s", "rightOf"],
      ["a", "below"],
    ] as const) {
      const out = setNodeRelation(src, id, side, id === "s" ? "a" : "s")!;
      expect(out.split("\n").length).toBe(src.split("\n").length);
    }
  });

  it("returns null for a node the document does not declare", () => {
    expect(setNodeRelation('architecture\n  app a "A"\n', "nope", "rightOf", "a")).toBeNull();
  });
});
