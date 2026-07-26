import type {
  ArrowHead,
  Direction,
  EdgeStyle,
  Flowchart,
  FlowEdge,
  FlowNode,
  LayoutHint,
  NodeShape,
} from "./types.js";

export interface NodeOptions {
  shape?: NodeShape;
  hint?: LayoutHint;
}

export interface EdgeOptions {
  label?: string;
  style?: EdgeStyle;
  head?: ArrowHead;
}

/**
 * Fluent builder for a flowchart. This is the programmatic API; the DSL parser
 * (later milestone) targets the exact same model, so both inputs converge here.
 *
 *   const d = flowchart("TB")
 *     .node("A", "Start")
 *     .node("B", "Decision", { shape: "diamond", hint: { below: "A" } })
 *     .edge("A", "B");
 */
export class FlowchartBuilder {
  private readonly nodes = new Map<string, FlowNode>();
  private readonly edges: FlowEdge[] = [];

  constructor(private direction: Direction = "TB") {}

  dir(direction: Direction): this {
    this.direction = direction;
    return this;
  }

  node(id: string, label?: string, opts: NodeOptions = {}): this {
    if (this.nodes.has(id)) {
      throw new Error(`Duplicate node id: "${id}"`);
    }
    this.nodes.set(id, {
      id,
      label: label ?? id,
      shape: opts.shape ?? "rect",
      hint: opts.hint,
    });
    return this;
  }

  /** Attach or merge a layout hint onto an existing node. */
  place(id: string, hint: LayoutHint): this {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`Unknown node id: "${id}"`);
    n.hint = { ...n.hint, ...hint };
    return this;
  }

  edge(from: string, to: string, opts: EdgeOptions = {}): this {
    this.edges.push({
      from,
      to,
      label: opts.label,
      style: opts.style ?? "solid",
      head: opts.head ?? "arrow",
    });
    return this;
  }

  build(): Flowchart {
    for (const e of this.edges) {
      if (!this.nodes.has(e.from)) throw new Error(`Edge references unknown node: "${e.from}"`);
      if (!this.nodes.has(e.to)) throw new Error(`Edge references unknown node: "${e.to}"`);
    }
    return {
      kind: "flowchart",
      direction: this.direction,
      nodes: [...this.nodes.values()],
      edges: this.edges,
    };
  }
}

export function flowchart(direction: Direction = "TB"): FlowchartBuilder {
  return new FlowchartBuilder(direction);
}
