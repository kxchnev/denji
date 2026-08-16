/**
 * The tables the parser exports so that other tools can *spell* the language
 * instead of re-declaring it — today the VS Code extension's generated syntax
 * highlighting, tomorrow whatever else.
 *
 * A list that has quietly drifted from what the parser accepts is worse than no
 * list at all: it looks authoritative and highlights the wrong words. So every
 * entry here is checked by feeding it to the parser, and the parser's own
 * rejections are checked to make sure the lists are not merely supersets.
 */
import { describe, expect, it } from "vitest";
import {
  ARCH_OPERATORS,
  DIRECTIVES,
  CONTAINER_KIND_NAMES,
  DIRECTIVE_NAMES,
  ICON_PROP_NAMES,
  SHAPE_KIND_NAMES,
  parseArchitecture,
} from "../src/dsl/arch-parse.js";
import { STYLE_PROPS } from "../src/model/style.js";

/** Whether a document parses at all — the tables only claim that much. */
const parses = (src: string): boolean => {
  try {
    parseArchitecture(src);
    return true;
  } catch {
    return false;
  }
};

describe("exported grammar tables", () => {
  it("names every shape kind, and only shape kinds", () => {
    for (const kind of SHAPE_KIND_NAMES) {
      expect(parses(`architecture\n${kind} a "A"`), kind).toBe(true);
    }
    expect(parses('architecture\nblob a "A"')).toBe(false);
    // A container is not a shape: it needs a body.
    for (const kind of CONTAINER_KIND_NAMES) {
      expect(parses(`architecture\n${kind} a "A"`), kind).toBe(false);
    }
  });

  it("names every container kind", () => {
    for (const kind of CONTAINER_KIND_NAMES) {
      expect(parses(`architecture\n${kind} g "G" {\napp a "A"\n}`), kind).toBe(true);
    }
  });

  it("names every connection operator, longest first", () => {
    for (const op of ARCH_OPERATORS) {
      expect(parses(`architecture\napp a "A"\napp b "B"\na ${op} b`), op).toBe(true);
    }
    // The ordering is load-bearing for anything matching left to right, a regex
    // alternation as much as the scanner: `->` occurs inside `-.->`, so listing
    // it first would eat the arrow out of a dashed connection. The rule is that
    // no operator may be contained by one listed after it.
    for (let i = 0; i < ARCH_OPERATORS.length; i++) {
      for (let j = i + 1; j < ARCH_OPERATORS.length; j++) {
        const earlier = ARCH_OPERATORS[i]!;
        expect(
          ARCH_OPERATORS[j]!.includes(earlier),
          `${ARCH_OPERATORS[j]} contains ${earlier}, so it must be listed before it`,
        ).toBe(false);
      }
    }
  });

  it("names every directive, and nothing the parser would reject as unknown", () => {
    for (const name of DIRECTIVE_NAMES) {
      // Directives take different arguments, so an accepted name is one whose
      // complaint is about anything other than not knowing it.
      let message = "";
      try {
        parseArchitecture(`architecture\napp a "A" @${name}(0)`);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message, name).not.toContain("unknown directive");
      // A name added to the allow-list without a branch to read its argument
      // reaches the end of the dispatch chain instead — which the check above
      // does not see, because that complaint is worded differently.
      expect(message, name).not.toContain("unhandled directive");
    }
    expect(() => parseArchitecture('architecture\napp a "A" @nonsense(0)')).toThrow(
      /unknown directive/,
    );
  });

  it("describes every directive it names, and names every one it describes", () => {
    // `DIRECTIVES` is what the reference page prints and what the editor offers,
    // and the parser's allow-list is built from it — so a row missing a context
    // is a directive the parser rejects while the docs promise it.
    expect(DIRECTIVES.map((d) => d.name.toLowerCase()).sort()).toEqual([...DIRECTIVE_NAMES]);
    for (const d of DIRECTIVES) {
      expect(d.in.length, `${d.name} is allowed nowhere`).toBeGreaterThan(0);
      expect(d.arg.startsWith("("), `${d.name} arg`).toBe(true);
      expect(d.info.trim().endsWith("."), `${d.name} info reads as a sentence`).toBe(true);
    }
  });

  it("says where each directive goes, and the parser agrees", () => {
    const where = (name: string): string[] =>
      DIRECTIVES.find((d) => d.name.toLowerCase() === name)!.in.map(String);
    const line: Record<string, (d: string) => string> = {
      shape: (d) => `architecture\napp a "A" ${d}`,
      container: (d) => `architecture\nservice s "S" ${d} {\napp a "A"\n}`,
      diagram: (d) => `architecture ${d}\napp a "A"`,
      connection: (d) => `architecture\napp a "A"\napp b "B"\na -> b ${d}`,
      text: (d) => `architecture\ngroup g "G" {\ntext "n" ${d}\napp a "A"\n}`,
    };
    for (const name of DIRECTIVE_NAMES) {
      const allowed = new Set(where(name));
      for (const [ctx, build] of Object.entries(line)) {
        let message = "";
        try {
          parseArchitecture(build(`@${name}(0)`));
        } catch (e) {
          message = (e as Error).message;
        }
        const rejected = message.includes("not allowed");
        expect(rejected, `@${name} on a ${ctx}`).toBe(!allowed.has(ctx));
      }
    }
  });

  it("leaves the style properties to STYLE_PROPS, which are directives too", () => {
    // Overlap would mean two lists claiming the same word — and `@fill` really
    // is spelled like a directive, so a consumer has to read both.
    for (const prop of Object.keys(STYLE_PROPS)) {
      expect(DIRECTIVE_NAMES, prop).not.toContain(prop);
    }
    expect(parses('architecture\napp a "A" @fill(#fff)')).toBe(true);
    expect(parses('architecture\napp a "A" @stroke-width(2)')).toBe(true);
  });

  it("names every icon-block property", () => {
    for (const prop of ICON_PROP_NAMES) {
      const src = `architecture\nicon mine { path: M0 0; ${prop}: x; }\napp a "A" @icon(mine)`;
      let message = "";
      try {
        parseArchitecture(src);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message, prop).not.toContain("unknown");
    }
  });

  it("is sorted where a generated file would otherwise churn", () => {
    expect([...DIRECTIVE_NAMES]).toEqual([...DIRECTIVE_NAMES].sort());
  });
});
