/**
 * Static checks over a `.pwr` document.
 *
 * This exists for the case where nobody is looking at the picture. A person
 * editing a diagram sees immediately that it came out wrong; a model writing one
 * does not, so it needs the same judgement delivered as text. Hence two classes
 * of finding: **errors**, which mean no diagram at all, and **warnings**, which
 * mean a diagram that renders but probably does not look like what was meant.
 *
 * The layout heuristics deliberately stay few and blunt. A warning nobody acts
 * on is worse than no warning, because it teaches the reader to ignore the list.
 */
import { parseArchitecture } from "./dsl/arch-parse.js";
import { DiagramParseError } from "./dsl/error.js";
import { layoutArchitecture } from "./layout/arch/index.js";
import { resolvedAnchors, type LayoutWarning } from "./layout/arch/relative.js";
import type { ArchDiagram, ArchNode } from "./model/arch.js";
import { intersects } from "./model/geometry.js";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCode =
  | "parse-error"
  | "build-error"
  | "overlapping-siblings"
  | "hint-cycle"
  | "loose-node"
  | "unconnected-node"
  | "extreme-aspect-ratio";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** Stable identifier — match on this, not on the prose. */
  code: DiagnosticCode;
  message: string;
  /** 1-based. Null when the finding is about the whole document rather than a line. */
  line: number | null;
  col: number | null;
  /** The offending source line, when there is one. */
  srcLine?: string;
  /** Nodes the finding is about. */
  nodes?: string[];
}

export interface CheckResult {
  diagnostics: Diagnostic[];
  /** True when nothing rendered — parse or build failed. */
  failed: boolean;
}

/** A diagram this wide (or this tall) relative to the other axis reads as a strip. */
const MAX_ASPECT = 4;
/** Below this, an odd shape is just a small diagram rather than a layout mistake. */
const ASPECT_MIN_NODES = 4;

export function checkDiagram(source: string): CheckResult {
  let diagram: ArchDiagram;
  try {
    diagram = parseArchitecture(source);
  } catch (err) {
    return { diagnostics: [fromThrown(err, source)], failed: true };
  }

  const diagnostics: Diagnostic[] = [];
  const warnings: LayoutWarning[] = [];
  try {
    layoutArchitecture(diagram, { onWarn: (w) => warnings.push(w) });
  } catch (err) {
    return { diagnostics: [fromThrown(err, source)], failed: true };
  }

  for (const w of warnings) {
    diagnostics.push({
      severity: "warning",
      code: w.code,
      message: w.message,
      line: null,
      col: null,
      nodes: w.nodes,
    });
  }
  diagnostics.push(...overlapDiagnostics(diagram));
  diagnostics.push(...looseNodeDiagnostics(diagram));
  diagnostics.push(...unconnectedDiagnostics(diagram));
  diagnostics.push(...aspectDiagnostics(diagram));

  return { diagnostics, failed: false };
}

/**
 * `parseArchitecture` ends in `builder.build()`, so it throws two different
 * things: a `DiagramParseError` that knows where it happened, and a plain
 * `Error` from the build-time checks (duplicate ids, unknown icon or style, a
 * node in two containers) that does not.
 */
function fromThrown(err: unknown, source: string): Diagnostic {
  if (err instanceof DiagramParseError) {
    return {
      severity: "error",
      code: "parse-error",
      message: err.reason,
      line: err.line,
      col: err.col,
      srcLine: err.srcLine,
    };
  }
  const message = (err as Error).message;
  // Build errors name the node but carry no position. Recovering the line by
  // looking for the id turns "duplicate id" from a whole-file hunt into a jump.
  const quoted = /"([A-Za-z0-9_]+)"/.exec(message);
  const line = quoted ? findDeclarationLine(source, quoted[1]!) : null;
  return {
    severity: "error",
    code: "build-error",
    message,
    line,
    col: line === null ? null : 1,
    srcLine: line === null ? undefined : (source.split(/\r?\n/)[line - 1] ?? ""),
  };
}

/** The last line declaring `id` — for a duplicate, that is the offending one. */
function findDeclarationLine(source: string, id: string): number | null {
  const decl = new RegExp(`^\\s*(?:app|database|queue|rect|service|group|style|icon)\\s+${id}\\b`);
  const lines = source.split(/\r?\n/);
  let found: number | null = null;
  for (let i = 0; i < lines.length; i++) if (decl.test(lines[i]!)) found = i + 1;
  return found;
}

/** Every scope: the top level, plus each container's children. */
function scopes(diagram: ArchDiagram): ArchNode[][] {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const childIds = new Set<string>();
  for (const n of diagram.nodes) {
    if (n.type === "container") for (const c of n.children) childIds.add(c);
  }
  const out: ArchNode[][] = [diagram.nodes.filter((n) => !childIds.has(n.id))];
  for (const n of diagram.nodes) {
    if (n.type === "container") {
      out.push(n.children.map((c) => byId.get(c)).filter((c): c is ArchNode => c !== undefined));
    }
  }
  return out.filter((s) => s.length > 0);
}

/**
 * Siblings drawn on top of each other. The layout slides a node clear when its
 * slot is taken, so an overlap that survives means the hints could not be
 * honoured — always a mistake, never a style choice.
 */
function overlapDiagnostics(diagram: ArchDiagram): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const scope of scopes(diagram)) {
    for (let i = 0; i < scope.length; i++) {
      for (let j = i + 1; j < scope.length; j++) {
        const a = scope[i]!;
        const b = scope[j]!;
        if (a.rect && b.rect && intersects(a.rect, b.rect)) {
          out.push({
            severity: "warning",
            code: "overlapping-siblings",
            message: `"${a.id}" and "${b.id}" overlap`,
            line: null,
            col: null,
            nodes: [a.id, b.id],
          });
        }
      }
    }
  }
  return out;
}

/**
 * Nodes with no resolvable hint that nothing else anchors to. Each starts its
 * own block, and blocks are packed left to right — so such a node silently lands
 * to the right of everything, which is the single most common surprise in this
 * language.
 *
 * Exempt only when it is the scope's first declared node: that one opens the
 * first block, so it is the origin everything else hangs off rather than a
 * stray. A loose node further down is a stray even if an earlier node happened
 * to be the origin — which is why this tests declaration position, not merely
 * "is it the first loose one".
 */
function looseNodeDiagnostics(diagram: ArchDiagram): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const scope of scopes(diagram)) {
    const ids = new Set(scope.map((n) => n.id));
    const anchored = new Set<string>();
    for (const n of scope) for (const a of resolvedAnchors(n.id, n.hint, ids)) anchored.add(a);
    const isLoose = (n: ArchNode): boolean =>
      resolvedAnchors(n.id, n.hint, ids).length === 0 && !anchored.has(n.id);
    const loose = scope.filter(isLoose);
    const origin = scope[0] !== undefined && isLoose(scope[0]) ? 1 : 0;
    for (const n of loose.slice(origin)) {
      out.push({
        severity: "warning",
        code: "loose-node",
        message: `"${n.id}" has no placement hint and nothing points at it, so it is parked to the right of everything else`,
        line: null,
        col: null,
        nodes: [n.id],
      });
    }
  }
  return out;
}

/** A shape nobody connects to, in a diagram that is otherwise wired up. */
function unconnectedDiagnostics(diagram: ArchDiagram): Diagnostic[] {
  if (diagram.connections.length === 0) return [];
  const touched = new Set<string>();
  for (const c of diagram.connections) {
    touched.add(c.from);
    touched.add(c.to);
  }
  // A container may legitimately be pure grouping: its children carry the edges.
  const containerOf = new Map<string, string>();
  for (const n of diagram.nodes) {
    if (n.type === "container") for (const c of n.children) containerOf.set(c, n.id);
  }
  const out: Diagnostic[] = [];
  for (const n of diagram.nodes) {
    if (n.type !== "shape" || touched.has(n.id)) continue;
    const parent = containerOf.get(n.id);
    if (parent && touched.has(parent)) continue;
    out.push({
      severity: "warning",
      code: "unconnected-node",
      message: `"${n.id}" is not connected to anything`,
      line: null,
      col: null,
      nodes: [n.id],
    });
  }
  return out;
}

/** A drawing far longer than it is tall usually means a missing container. */
function aspectDiagnostics(diagram: ArchDiagram): Diagnostic[] {
  if (diagram.nodes.length < ASPECT_MIN_NODES) return [];
  let w = 0;
  let h = 0;
  for (const n of diagram.nodes) {
    if (!n.rect) continue;
    w = Math.max(w, n.rect.x + n.rect.width);
    h = Math.max(h, n.rect.y + n.rect.height);
  }
  if (w === 0 || h === 0) return [];
  const ratio = w / h;
  if (ratio <= MAX_ASPECT && ratio >= 1 / MAX_ASPECT) return [];
  const shape = ratio > MAX_ASPECT ? "wide" : "tall";
  return [
    {
      severity: "warning",
      code: "extreme-aspect-ratio",
      message: `the diagram is ${Math.round(w)}×${Math.round(h)}, a ${ratio > 1 ? Math.round(ratio) : Math.round(1 / ratio)}:1 strip — too ${shape} to read; group related nodes into a container or turn part of the flow with @below/@rightOf`,
      line: null,
      col: null,
    },
  ];
}
