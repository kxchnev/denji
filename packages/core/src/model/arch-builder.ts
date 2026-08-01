import type {
  ArchDiagram,
  ArchNode,
  Connection,
  Container,
  ContainerKind,
  PlaceHint,
  Shape,
  ShapeKind,
  Spacing,
  StyleProps,
  StyleSheet,
  Styled,
  ThemeName,
} from "./arch.js";
import { isStyleSlot } from "./style.js";

export interface ShapeOptions extends Styled {
  hint?: PlaceHint;
}

export interface ContainerOptions extends Styled {
  kind?: ContainerKind;
  children?: string[];
  hint?: PlaceHint;
  /** Spacing between this container's children; inherited by nested scopes. */
  spacing?: Spacing;
  /** Inner padding between this container's border and its children. */
  padding?: number;
}

/** Connection direction: which ends get an arrowhead. */
export type Dir = "to" | "from" | "none" | "both";

export interface ConnectOptions extends Styled {
  label?: string;
  dir?: Dir;
  style?: "solid" | "dashed";
}

/**
 * Fluent builder for an architecture diagram. Both the programmatic API and the
 * DSL parser converge on this builder, which owns all validation.
 *
 *   const d = architecture()
 *     .app("api", "API")
 *     .database("db", "Postgres", { hint: { below: "api" } })
 *     .container("svc", "Orders", { kind: "service", children: ["api", "db"] })
 *     .connect("api", "db");
 */
export class ArchitectureBuilder {
  private readonly nodes = new Map<string, ArchNode>();
  private readonly connections: Connection[] = [];
  private diagramSpacing?: Spacing;
  private diagramMargin?: number;
  private diagramTheme?: ThemeName;
  /** Insertion order is the cascade order, so a plain object is the right shape. */
  private readonly stylesheet: StyleSheet = {};

  private addShape(id: string, kind: ShapeKind, label: string | undefined, opts: ShapeOptions): this {
    if (this.nodes.has(id)) throw new Error(`Duplicate node id: "${id}"`);
    const shape: Shape = {
      type: "shape",
      id,
      label: label ?? id,
      kind,
      hint: opts.hint,
      styleRefs: opts.styleRefs,
      styleProps: opts.styleProps,
    };
    this.nodes.set(id, shape);
    return this;
  }

  app(id: string, label?: string, opts: ShapeOptions = {}): this {
    return this.addShape(id, "app", label, opts);
  }
  database(id: string, label?: string, opts: ShapeOptions = {}): this {
    return this.addShape(id, "database", label, opts);
  }
  queue(id: string, label?: string, opts: ShapeOptions = {}): this {
    return this.addShape(id, "queue", label, opts);
  }
  rect(id: string, label?: string, opts: ShapeOptions = {}): this {
    return this.addShape(id, "rect", label, opts);
  }

  container(id: string, label?: string, opts: ContainerOptions = {}): this {
    if (this.nodes.has(id)) throw new Error(`Duplicate node id: "${id}"`);
    const container: Container = {
      type: "container",
      id,
      label: label ?? id,
      kind: opts.kind ?? "group",
      children: opts.children ? [...opts.children] : [],
      hint: opts.hint,
      spacing: opts.spacing,
      padding: opts.padding,
      styleRefs: opts.styleRefs,
      styleProps: opts.styleProps,
    };
    this.nodes.set(id, container);
    return this;
  }

  /** Pick one of the built-in themes; the document beats the render option. */
  theme(name: ThemeName): this {
    this.diagramTheme = name;
    return this;
  }

  /**
   * Declare a reusable style. A name that is a {@link StyleSlot} (`app`,
   * `edge`, …) acts as a selector over every element of that kind instead.
   */
  defineStyle(name: string, props: StyleProps): this {
    if (Object.prototype.hasOwnProperty.call(this.stylesheet, name)) {
      throw new Error(`Duplicate style: "${name}"`);
    }
    this.stylesheet[name] = props;
    return this;
  }

  /** Diagram-wide spacing between siblings; merges with any earlier call. */
  spacing(s: Spacing): this {
    this.diagramSpacing = { ...this.diagramSpacing, ...s };
    return this;
  }

  /** Outer margin around the whole drawing. */
  margin(n: number): this {
    this.diagramMargin = n;
    return this;
  }

  /** Attach or merge a placement hint onto an existing node. */
  place(id: string, hint: PlaceHint): this {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`Unknown node id: "${id}"`);
    n.hint = { ...n.hint, ...hint };
    return this;
  }

  connect(from: string, to: string, opts: ConnectOptions = {}): this {
    const dir = opts.dir ?? "to";
    this.connections.push({
      from,
      to,
      label: opts.label,
      fromArrow: dir === "from" || dir === "both",
      toArrow: dir === "to" || dir === "both",
      style: opts.style ?? "solid",
      styleRefs: opts.styleRefs,
      styleProps: opts.styleProps,
    });
    return this;
  }

  build(): ArchDiagram {
    // Endpoints exist.
    for (const c of this.connections) {
      if (!this.nodes.has(c.from)) throw new Error(`Connection references unknown node: "${c.from}"`);
      if (!this.nodes.has(c.to)) throw new Error(`Connection references unknown node: "${c.to}"`);
    }

    // Each child exists and belongs to exactly one container.
    const parentOf = new Map<string, string>();
    for (const n of this.nodes.values()) {
      if (n.type !== "container") continue;
      for (const childId of n.children) {
        if (!this.nodes.has(childId)) {
          throw new Error(`Container "${n.id}" references unknown child: "${childId}"`);
        }
        const existing = parentOf.get(childId);
        if (existing) {
          throw new Error(`Node "${childId}" is in two containers ("${existing}" and "${n.id}")`);
        }
        parentOf.set(childId, n.id);
      }
    }

    assertNoNestingCycle(this.nodes, parentOf);

    // Every @style(name) resolves. A slot name always does — it is a selector
    // and applies whether or not anyone declared a block for it.
    const styled: Array<{ what: string; refs?: string[] }> = [
      ...[...this.nodes.values()].map((n) => ({ what: `Node "${n.id}"`, refs: n.styleRefs })),
      ...this.connections.map((c) => ({ what: `Connection ${c.from}->${c.to}`, refs: c.styleRefs })),
    ];
    for (const { what, refs } of styled) {
      for (const ref of refs ?? []) {
        if (!Object.prototype.hasOwnProperty.call(this.stylesheet, ref) && !isStyleSlot(ref)) {
          throw new Error(`${what} references unknown style: "${ref}"`);
        }
      }
    }

    const styles = Object.keys(this.stylesheet).length > 0 ? this.stylesheet : undefined;

    return {
      kind: "architecture",
      nodes: [...this.nodes.values()],
      connections: this.connections,
      spacing: this.diagramSpacing,
      margin: this.diagramMargin,
      theme: this.diagramTheme,
      styles,
    };
  }
}

/** Walk parent links from each container; a repeat means a nesting cycle. */
function assertNoNestingCycle(nodes: Map<string, ArchNode>, parentOf: Map<string, string>): void {
  for (const n of nodes.values()) {
    if (n.type !== "container") continue;
    const seen = new Set<string>([n.id]);
    let cur = parentOf.get(n.id);
    while (cur) {
      if (seen.has(cur)) throw new Error(`Container nesting cycle involving "${cur}"`);
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }
}

export function architecture(): ArchitectureBuilder {
  return new ArchitectureBuilder();
}
