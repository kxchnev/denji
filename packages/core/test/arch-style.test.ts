import { describe, expect, it } from "vitest";
import { parseArchitecture } from "../src/dsl/arch-parse.js";
import { DiagramParseError } from "../src/dsl/error.js";
import { architecture } from "../src/model/arch-builder.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import { renderArchitecture } from "../src/render/arch-svg.js";
import type { ArchDiagram, Connection, Container, Shape } from "../src/model/arch.js";

function shape(d: ArchDiagram, id: string): Shape {
  const n = d.nodes.find((x) => x.id === id);
  if (!n || n.type !== "shape") throw new Error(`no shape ${id}`);
  return n;
}
function container(d: ArchDiagram, id: string): Container {
  const n = d.nodes.find((x) => x.id === id);
  if (!n || n.type !== "container") throw new Error(`no container ${id}`);
  return n;
}
function edge(d: ArchDiagram, from: string, to: string): Connection {
  const c = d.connections.find((x) => x.from === from && x.to === to);
  if (!c) throw new Error(`no connection ${from}->${to}`);
  return c;
}
function reason(src: string): string {
  try {
    parseArchitecture(src);
  } catch (e) {
    return (e as DiagramParseError).reason;
  }
  throw new Error("expected throw");
}

describe("style blocks", () => {
  it("declares a named style and attaches it by @style", () => {
    const d = parseArchitecture(`
      architecture

      style hot {
        fill: #3b1d1d
        stroke: #ef4444
        text: #fecaca
      }

      app gw "Gateway" @style(hot)
    `);
    expect(d.styles).toEqual({ hot: { fill: "#3b1d1d", stroke: "#ef4444", text: "#fecaca" } });
    expect(shape(d, "gw").styleRefs).toEqual(["hot"]);
  });

  it("treats a slot name as a selector over every element of that kind", () => {
    const d = parseArchitecture(`
      architecture
      style database { fill: #0b2b22 }
      style edge { stroke: teal }
      database db "PG"
    `);
    expect(d.styles?.database).toEqual({ fill: "#0b2b22" });
    expect(d.styles?.edge).toEqual({ stroke: "teal" });
    // A selector is not a reference — nothing points at it.
    expect(shape(d, "db").styleRefs).toBeUndefined();
  });

  it("keeps @style order and stacks several of them", () => {
    const d = parseArchitecture(`
      architecture
      style a { fill: #111111 }
      style b { fill: #222222 }
      app x "X" @style(a) @style(b)
    `);
    expect(shape(d, "x").styleRefs).toEqual(["a", "b"]);
  });

  it("accepts inline properties on shapes, containers and connections", () => {
    const d = parseArchitecture(`
      architecture
      app a "A" @fill(#082018) @stroke-width(3)
      service s "S" @headerFill(#123456) {
        app b "B"
      }
      a -> b @stroke(#ef4444) @dash(2 2)
    `);
    expect(shape(d, "a").styleProps).toEqual({ fill: "#082018", strokeWidth: 3 });
    expect(container(d, "s").styleProps).toEqual({ headerFill: "#123456" });
    expect(edge(d, "a", "b").styleProps).toEqual({ stroke: "#ef4444", dash: "2 2" });
  });

  it("spells a property the same in kebab-case, camelCase and lowercase", () => {
    const d = parseArchitecture(`
      architecture
      style s1 { stroke-width: 2 }
      style s2 { strokeWidth: 2 }
      style s3 { strokewidth: 2 }
    `);
    expect(d.styles).toEqual({
      s1: { strokeWidth: 2 },
      s2: { strokeWidth: 2 },
      s3: { strokeWidth: 2 },
    });
  });

  it("reads @theme off the architecture line", () => {
    expect(parseArchitecture(`architecture @theme(dark)\napp a "A"`).theme).toBe("dark");
    expect(parseArchitecture(`architecture\napp a "A"`).theme).toBeUndefined();
    expect(reason(`architecture @theme(neon)\napp a "A"`)).toContain("light|dark");
  });

  it("resolves a style declared after its use", () => {
    const d = parseArchitecture(`
      architecture
      app a "A" @style(late)
      style late { fill: #fefefe }
    `);
    expect(d.styles?.late).toEqual({ fill: "#fefefe" });
  });
});

describe("style block parsing hazards", () => {
  it("does not read a hex value as a comment", () => {
    const d = parseArchitecture(`
      architecture
      style s {
        # a real comment
        stroke: #334155
      }
    `);
    expect(d.styles?.s).toEqual({ stroke: "#334155" });
  });

  it("does not hand a dashed property or value to the connection scanner", () => {
    // `--` is a connection operator anywhere in a line, and `stroke-width`
    // plus `dash: 6 4` both live inside a block that must own its lines.
    const d = parseArchitecture(`
      architecture
      style s {
        dash: 6 4
        stroke-width: 2
      }
      app a "A"
    `);
    expect(d.styles?.s).toEqual({ dash: "6 4", strokeWidth: 2 });
    expect(d.connections).toHaveLength(0);
  });

  it("does not let a style block's brace close an enclosing container", () => {
    const d = parseArchitecture(`
      architecture
      style s { fill: #ffffff }
      service svc "S" {
        app a "A"
        app b "B"
      }
    `);
    expect(container(d, "svc").children).toEqual(["a", "b"]);
  });

  it("still reads `style` as a node id in a connection", () => {
    const d = parseArchitecture(`
      architecture
      app style "Styler"
      app db "DB"
      style -> db
    `);
    expect(d.connections).toHaveLength(1);
    expect(edge(d, "style", "db").toArrow).toBe(true);
  });

  it("keeps a connection label free of the directives before the colon", () => {
    const d = parseArchitecture(`
      architecture
      style hot { stroke: #ef4444 }
      app a "A"
      app b "B"
      a -> b @style(hot) : http
    `);
    const c = edge(d, "a", "b");
    expect(c.label).toBe("http");
    expect(c.styleRefs).toEqual(["hot"]);
  });
});

describe("style errors", () => {
  it("rejects an unknown property and a bad value", () => {
    expect(reason(`architecture\nstyle s {\n  glow: 3\n}`)).toContain("unknown style property");
    expect(reason(`architecture\nstyle s {\n  fill: not a colour\n}`)).toContain("colour");
    expect(reason(`architecture\nstyle s {\n  opacity: 4\n}`)).toContain("between 0 and 1");
    expect(reason(`architecture\nstyle s {\n  stroke-width: -1\n}`)).toContain(">= 0");
  });

  it("rejects a property that does not apply to a type selector's kind", () => {
    expect(reason(`architecture\nstyle app {\n  headerFill: #fff\n}`)).toContain(
      "does not apply to app",
    );
    expect(reason(`architecture\napp a "A" @headerFill(#ffffff)`)).toContain("does not apply");
  });

  it("rejects a malformed block line and an unclosed block", () => {
    expect(reason(`architecture\nstyle s {\n  fill #fff\n}`)).toContain("property: value");
    expect(reason(`architecture\nstyle s {\n  fill: #fff`)).toContain("unclosed style");
  });

  it("rejects a style block inside a container and a duplicate name", () => {
    expect(reason(`architecture\nservice s "S" {\nstyle x { fill: #fff }\n}`)).toContain(
      "top-level only",
    );
    expect(reason(`architecture\nstyle x { fill: #fff }\nstyle x { fill: #000 }`)).toContain(
      "Duplicate style",
    );
  });

  it("rejects style directives where they make no sense", () => {
    expect(reason(`architecture @fill(#fff)\napp a "A"`)).toContain("not allowed");
    expect(reason(`architecture\napp a "A" @theme(dark)`)).toContain("not allowed on a shape");
  });

  it("refuses a value that would break out of the <style> element", () => {
    expect(reason(`architecture\nstyle s {\n  fill: red}</style><script>x\n}`)).toContain("colour");
  });

  it("rejects @style pointing at a style nobody declared", () => {
    expect(() => parseArchitecture(`architecture\napp a "A" @style(ghost)`)).toThrow(
      /unknown style: "ghost"/,
    );
  });
});

describe("sizing through the cascade", () => {
  const laid = (src: string) => {
    const d = parseArchitecture(src);
    layoutArchitecture(d);
    return d;
  };

  it("resizes every element of a kind from one selector", () => {
    const d = laid(`
      architecture
      style app { width: 150; height: 64 }
      app a "A"
      app b "B" @rightOf(a)
      database c "C" @below(a)
    `);
    expect(shape(d, "a").rect).toMatchObject({ width: 150, height: 64 });
    expect(shape(d, "b").rect).toMatchObject({ width: 150, height: 64 });
    // Untouched kinds keep measuring themselves.
    expect(shape(d, "c").rect!.width).not.toBe(150);
  });

  it("takes an exact size inline, caps and all", () => {
    const d = laid(`architecture\ndatabase db "PG" @width(220) @height(40)`);
    expect(shape(d, "db").rect).toMatchObject({ width: 220, height: 40 });
  });

  it("follows the same cascade as any other property", () => {
    const d = laid(`
      architecture
      style app { width: 150 }
      style wide { width: 200 }
      app a "A"
      app b "B" @rightOf(a) @style(wide)
      app c "C" @rightOf(b) @style(wide) @width(260)
    `);
    expect(shape(d, "a").rect!.width).toBe(150);
    expect(shape(d, "b").rect!.width).toBe(200);
    expect(shape(d, "c").rect!.width).toBe(260);
  });

  it("treats a container's size as a floor, never cropping its children", () => {
    const roomy = laid(`architecture\nservice s "S" @width(320) @height(200) {\n  app a "A"\n}`);
    expect(container(roomy, "s").rect).toMatchObject({ width: 320, height: 200 });

    // Too small to hold the child: the content wins.
    const cramped = laid(`architecture\nservice s "S" @width(10) @height(10) {\n  app a "A"\n}`);
    const rect = container(cramped, "s").rect!;
    expect(rect.width).toBeGreaterThan(shape(cramped, "a").rect!.width);
    expect(rect.height).toBeGreaterThan(shape(cramped, "a").rect!.height);
  });

  it("is layout, not paint, so it never reaches the stylesheet", () => {
    const d = parseArchitecture(`architecture\nstyle app { width: 150; height: 64 }\napp a "A"`);
    layoutArchitecture(d);
    const css = /<style>([\s\S]*?)<\/style>/.exec(renderArchitecture(d))![1]!;
    // `stroke-width` is a real declaration, so match the property at the start
    // of one rather than anywhere in the text.
    expect(css).not.toMatch(/[{;]width:/);
    expect(css).not.toMatch(/[{;]height:/);
    expect(css).not.toContain("--pwr-app-width");
  });

  it("is meaningless on a connection", () => {
    expect(reason(`architecture\napp a "A"\napp b "B"\na -> b @width(10)`)).toContain(
      "does not apply to edge",
    );
  });
});

describe("style API", () => {
  it("mirrors the DSL through the builder", () => {
    const built = architecture()
      .theme("dark")
      .defineStyle("hot", { fill: "#3b1d1d", stroke: "#ef4444" })
      .app("gw", "Gateway", { styleRefs: ["hot"], styleProps: { strokeWidth: 3 } })
      .build();

    const parsed = parseArchitecture(`
      architecture @theme(dark)
      style hot {
        fill: #3b1d1d
        stroke: #ef4444
      }
      app gw "Gateway" @style(hot) @strokeWidth(3)
    `);

    expect(built.theme).toEqual(parsed.theme);
    expect(built.styles).toEqual(parsed.styles);
    expect(shape(built, "gw").styleRefs).toEqual(shape(parsed, "gw").styleRefs);
    expect(shape(built, "gw").styleProps).toEqual(shape(parsed, "gw").styleProps);
  });

  it("refuses a duplicate style name", () => {
    expect(() => architecture().defineStyle("a", {}).defineStyle("a", {})).toThrow(/Duplicate/);
  });
});
