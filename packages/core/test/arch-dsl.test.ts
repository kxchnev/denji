import { describe, expect, it } from "vitest";
import { parseArchitecture } from "../src/dsl/arch-parse.js";
import { DiagramParseError } from "../src/dsl/error.js";
import type { ArchDiagram, Container, Shape } from "../src/model/arch.js";

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

describe("architecture DSL", () => {
  it("parses shape kinds and labels", () => {
    const d = parseArchitecture(`
      architecture
      app a "Service"
      database b "Store"
      queue c "Bus"
      rect e "Box"
    `);
    expect(shape(d, "a").kind).toBe("app");
    expect(shape(d, "b").kind).toBe("database");
    expect(shape(d, "c").kind).toBe("queue");
    expect(shape(d, "e").kind).toBe("rect");
    expect(shape(d, "a").label).toBe("Service");
  });

  it("nests children inside a container block", () => {
    const d = parseArchitecture(`
      architecture
      service svc "Orders" {
        app api "API"
        database db "DB"
      }
    `);
    expect(container(d, "svc").kind).toBe("service");
    expect(container(d, "svc").children).toEqual(["api", "db"]);
  });

  it("handles nested containers", () => {
    const d = parseArchitecture(`
      architecture
      group outer "Outer" {
        service inner "Inner" {
          app leaf "Leaf"
        }
      }
    `);
    expect(container(d, "outer").children).toEqual(["inner"]);
    expect(container(d, "inner").children).toEqual(["leaf"]);
  });

  it("maps connection operators to direction and style", () => {
    const d = parseArchitecture(`
      architecture
      app a
      app b
      a -> b : call
      a <- b
      a -- b
      a <-> b
      a -.-> b
    `);
    expect(d.connections[0]).toMatchObject({ fromArrow: false, toArrow: true, style: "solid", label: "call" });
    expect(d.connections[1]).toMatchObject({ fromArrow: true, toArrow: false });
    expect(d.connections[2]).toMatchObject({ fromArrow: false, toArrow: false });
    expect(d.connections[3]).toMatchObject({ fromArrow: true, toArrow: true });
    expect(d.connections[4]).toMatchObject({ toArrow: true, style: "dashed" });
  });

  it("applies @-directives to hints (shapes and containers)", () => {
    const d = parseArchitecture(`
      architecture
      app a "A"
      database b "B" @below(a) @gap(20)
      service s "S" @rightOf(a) @align(center) {
        app c "C"
      }
    `);
    expect(shape(d, "b").hint).toMatchObject({ below: "a", gap: 20 });
    expect(container(d, "s").hint).toMatchObject({ rightOf: "a", align: "center" });
  });

  it("parses @nudge as a signed pair, and rejects anything else", () => {
    const d = parseArchitecture('architecture\napp a "A"\napp b "B" @nudge(-40, 8.5)');
    expect(shape(d, "b").hint).toMatchObject({ nudge: { x: -40, y: 8.5 } });
    for (const bad of ["@nudge(40)", "@nudge(a, 0)", "@nudge(1, )"]) {
      expect(() => parseArchitecture(`architecture\napp a "A" ${bad}`)).toThrow(/two numbers/);
    }
  });

  it("reads spacing settings off the architecture header", () => {
    const d = parseArchitecture(`
      architecture @spacing(60) @margin(40)
      app a "A"
    `);
    expect(d.spacing).toEqual({ x: 60, y: 60 });
    expect(d.margin).toBe(40);
  });

  it("lets @spacingX/@spacingY refine @spacing, last one winning", () => {
    const d = parseArchitecture(`architecture @spacing(60) @spacingX(20)\napp a "A"`);
    expect(d.spacing).toEqual({ x: 20, y: 60 });
  });

  it("takes scope settings on a container alongside its own placement hint", () => {
    const d = parseArchitecture(`
      architecture
      app a "A"
      service s "S" @rightOf(a) @spacingY(24) @padding(32) {
        app c "C"
      }
    `);
    const s = container(d, "s");
    expect(s.hint).toMatchObject({ rightOf: "a" });
    expect(s.spacing).toEqual({ y: 24 });
    expect(s.padding).toBe(32);
  });

  it("keeps the bare header and an absent header working", () => {
    expect(parseArchitecture(`architecture\napp a "A"`).spacing).toBeUndefined();
    expect(parseArchitecture(`app a "A"`).nodes).toHaveLength(1);
  });

  it("rejects a directive used in the wrong position", () => {
    const reason = (src: string) => {
      try {
        parseArchitecture(src);
      } catch (e) {
        return (e as DiagramParseError).reason;
      }
      throw new Error("expected throw");
    };
    expect(reason(`architecture\napp a "A" @padding(10)`)).toContain("not allowed on a shape");
    expect(reason(`architecture @rightOf(a)\napp a "A"`)).toContain(
      "not allowed on the architecture line",
    );
    expect(reason(`architecture @padding(10)\napp a "A"`)).toContain("not allowed");
    expect(reason(`architecture\napp a "A" @wat(1)`)).toContain("unknown directive");
  });

  it("rejects negative distances", () => {
    for (const src of [
      `architecture\napp a "A"\napp b "B" @rightOf(a) @gap(-5)`,
      `architecture @spacing(-1)\napp a "A"`,
      `architecture @margin(-1)\napp a "A"`,
    ]) {
      expect(() => parseArchitecture(src)).toThrow(/>= 0/);
    }
  });

  it("reports parse errors with the line number", () => {
    const bad = (src: string) => {
      try {
        parseArchitecture(src);
      } catch (e) {
        return e as DiagramParseError;
      }
      throw new Error("expected throw");
    };
    expect(bad("architecture\napp a\nfoo bar baz")).toBeInstanceOf(DiagramParseError);
    expect(bad("architecture\napp a @wat(x)").line).toBe(2);
    expect(bad("architecture\nservice s \"S\" {\napp a").reason).toContain("unclosed");
  });

  it("round-trips a full diagram with services, hints, and connections", () => {
    const src = `
      architecture
      app gw "API Gateway"
      service orders "Orders" @below(gw) {
        app oapi "Orders API"
        database odb "Postgres" @below(oapi)
      }
      service pay "Payments" @rightOf(orders) {
        app papi "Payments API"
        queue pq "Charges" @below(papi)
      }
      queue bus "Event Bus" @below(orders)
      gw -> orders : http
      gw -> pay : http
      orders -> bus
      pay -> bus
      orders -- pay
    `;
    const d = parseArchitecture(src);
    expect(d.nodes).toHaveLength(8);
    expect(d.connections).toHaveLength(5);
    expect(container(d, "orders").children).toEqual(["oapi", "odb"]);
  });
});

describe("free text inside a group", () => {
  const reason = (src: string): string => {
    try {
      parseArchitecture(src);
    } catch (e) {
      return (e as DiagramParseError).reason;
    }
    throw new Error("expected throw");
  };

  it("pins a text to the top-left corner by default", () => {
    const d = parseArchitecture(`
      architecture
      group edge "Edge" {
        text "only in prod"
        app cdn "CDN"
      }
    `);
    expect(container(d, "edge").texts).toEqual([{ text: "only in prod", corner: "topLeft" }]);
    // A text is not a node, so it stays out of the scope's children.
    expect(container(d, "edge").children).toEqual(["cdn"]);
  });

  it("takes a corner, spelled camelCase, kebab-case or run together", () => {
    for (const arg of ["bottomRight", "bottom-right", "bottomright", "BOTTOM_RIGHT"]) {
      const d = parseArchitecture(`
        architecture
        group g "G" {
          text "note" @corner(${arg})
          app a "A"
        }
      `);
      expect(container(d, "g").texts?.[0]?.corner).toBe("bottomRight");
    }
  });

  it("keeps every text in source order, several to a corner", () => {
    const d = parseArchitecture(`
      architecture
      group g "G" {
        text "tl one"
        text "tl two"
        text "tr" @corner(topRight)
        text "bl" @corner(bottomLeft)
        text "br" @corner(bottomRight)
        app a "A"
      }
    `);
    expect(container(d, "g").texts).toEqual([
      { text: "tl one", corner: "topLeft" },
      { text: "tl two", corner: "topLeft" },
      { text: "tr", corner: "topRight" },
      { text: "bl", corner: "bottomLeft" },
      { text: "br", corner: "bottomRight" },
    ]);
  });

  it("leaves a container without texts alone", () => {
    const d = parseArchitecture(`architecture\ngroup g "G" {\napp a "A"\n}`);
    expect(container(d, "g").texts).toBeUndefined();
  });

  it("rejects text where it cannot be drawn", () => {
    expect(reason(`architecture\ntext "loose"`)).toContain("only allowed inside a container");
    expect(reason(`architecture\nservice s "S" {\ntext "x"\napp a "A"\n}`)).toContain(
      "only allowed inside a `group`",
    );
    expect(reason(`architecture\ngroup g "G" {\ntext bare\napp a "A"\n}`)).toContain(
      "malformed text",
    );
    expect(reason(`architecture\ngroup g "G" {\ntext "x" @corner(middle)\napp a "A"\n}`)).toContain(
      "@corner expects",
    );
  });

  it("keeps @corner to texts and other directives off them", () => {
    expect(reason(`architecture\napp a "A" @corner(topLeft)`)).toContain("not allowed on a shape");
    expect(reason(`architecture\ngroup g "G" @corner(topLeft) {\napp a "A"\n}`)).toContain(
      "not allowed on a container",
    );
    expect(reason(`architecture\ngroup g "G" {\ntext "x" @padding(4)\napp a "A"\n}`)).toContain(
      "not allowed on a text",
    );
  });
});

describe("exact coordinates", () => {
  const reason = (src: string): string => {
    try {
      parseArchitecture(src);
    } catch (e) {
      return (e as DiagramParseError).reason;
    }
    throw new Error("expected throw");
  };

  it("reads @at on shapes and containers, negatives included", () => {
    const d = parseArchitecture(
      'architecture\napp a "A" @at(12, -8)\nservice s "S" @at(0, 40.5) {\napp b "B"\n}',
    );
    expect(shape(d, "a").hint?.at).toEqual({ x: 12, y: -8 });
    expect(container(d, "s").hint?.at).toEqual({ x: 0, y: 40.5 });
  });

  it("keeps a relation written alongside it — the layout is what picks a winner", () => {
    expect(shape(parseArchitecture('architecture\napp a "A"\napp b "B" @rightOf(a) @at(1, 2)'), "b").hint)
      .toEqual({ rightOf: "a", at: { x: 1, y: 2 } });
  });

  it("insists on exactly two numbers", () => {
    for (const arg of ["1", "1, 2, 3", "", "a, b", "1, "]) {
      expect(reason(`architecture\napp a "A" @at(${arg})`)).toContain("@at expects two numbers");
    }
  });

  it("is a placement directive, so it is not allowed off a node", () => {
    expect(reason('architecture @at(0, 0)')).toContain("not allowed on the architecture line");
    expect(reason('architecture\napp a "A"\napp b "B"\na -> b @at(0, 0)')).toContain(
      "not allowed on a connection",
    );
    expect(reason('architecture\ngroup g "G" {\ntext "x" @at(0, 0)\napp a "A"\n}')).toContain(
      "not allowed on a text",
    );
  });
});

describe("links", () => {
  const fail = (src: string): DiagramParseError => {
    try {
      parseArchitecture(src);
    } catch (e) {
      return e as DiagramParseError;
    }
    throw new Error("expected throw");
  };

  it("reads @link on every shape kind and both container kinds", () => {
    const d = parseArchitecture(
      'architecture\n' +
        'app a "A" @link(https://example.com/a)\n' +
        'database b "B" @link(http://10.0.0.5:8080)\n' +
        'queue c "C" @link(mailto:team@example.com)\n' +
        'rect e "E" @link(https://example.com/e)\n' +
        'service s "S" @link(https://example.com/s) {\n' +
        'app in1 "In"\n' +
        '}\n' +
        'group g "G" @link(https://example.com/g) {\n' +
        'app in2 "In2"\n' +
        '}',
    );
    expect(shape(d, "a").link).toBe("https://example.com/a");
    expect(shape(d, "b").link).toBe("http://10.0.0.5:8080");
    expect(shape(d, "c").link).toBe("mailto:team@example.com");
    expect(shape(d, "e").link).toBe("https://example.com/e");
    // The container's directives are read at its `{` and only reach the builder
    // at its `}`, so this is the hand-off through Frame, not a repeat of above.
    expect(container(d, "s").link).toBe("https://example.com/s");
    expect(container(d, "g").link).toBe("https://example.com/g");
  });

  it("keeps the URL exactly as written — query, fragment, case and all", () => {
    // `#` starts a comment only at the beginning of a line, so a fragment is safe.
    const url = "https://Example.com/a/b?x=1&y=2#frag";
    expect(shape(parseArchitecture(`architecture\napp a "A" @link(${url})`), "a").link).toBe(url);
    expect(shape(parseArchitecture('architecture\napp a "A" @link(HTTPS://X.COM)'), "a").link).toBe(
      "HTTPS://X.COM",
    );
  });

  it("takes only http, https and mailto", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "vscode://x"]) {
      expect(fail(`architecture\napp a "A" @link(${url})`).reason).toContain(
        "must start with http://, https:// or mailto:",
      );
    }
  });

  it("refuses a relative path, which means nothing to whoever opens the picture", () => {
    for (const url of ["./runbook.md", "/runbook", "example.com", "#anchor"]) {
      expect(fail(`architecture\napp a "A" @link(${url})`).reason).toContain("must start with");
    }
  });

  it("refuses what the unquoted argument cannot carry", () => {
    // A `)` would end the argument early and leave the rest of the URL as junk.
    expect(fail('architecture\napp a "A" @link(https://x.com/a(b)c)').reason).toContain("%29");
    expect(fail('architecture\napp a "A" @link(https://)').reason).toContain(
      "needs something after the scheme",
    );
  });

  it("reports where the bad link is, not just that there is one", () => {
    const e = fail('architecture\napp a "A"\napp b "B" @below(a) @link(ftp://x)');
    expect(e.line).toBe(3);
    expect(e.col).toBe(1);
  });

  it("belongs to an element, so it is not allowed anywhere else", () => {
    expect(fail("architecture @link(https://x.com)").reason).toContain(
      "not allowed on the architecture line",
    );
    expect(fail('architecture\ngroup g "G" {\ntext "x" @link(https://x.com)\napp a "A"\n}').reason)
      .toContain("not allowed on a text");
  });

  it("cannot go on a connection, whose label eats everything after the first colon", () => {
    // Pinned deliberately: the message is ugly, and the fix is not to add `link`
    // to the connection set — it is to leave connections alone.
    expect(fail('architecture\napp a "A"\napp b "B"\na -> b @link(https://x.com)').reason).toContain(
      'unexpected token "@link(https"',
    );
  });
});
