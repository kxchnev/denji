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
