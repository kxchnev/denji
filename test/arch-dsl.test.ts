import { readFileSync } from "node:fs";
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

  it("round-trips the arch-basic.pwr example", () => {
    const src = readFileSync(new URL("../examples/arch-basic.pwr", import.meta.url), "utf8");
    const d = parseArchitecture(src);
    expect(d.nodes).toHaveLength(8);
    expect(d.connections).toHaveLength(5);
    expect(container(d, "orders").children).toEqual(["oapi", "odb"]);
  });
});
