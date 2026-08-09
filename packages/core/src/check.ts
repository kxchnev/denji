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
import { findDeclaration, findHeaderLine } from "./dsl/arch-edit.js";
import { parseArchitecture } from "./dsl/arch-parse.js";
import { DiagramParseError } from "./dsl/error.js";
import { layoutArchitecture } from "./layout/arch/index.js";
import type { LayoutWarning } from "./layout/arch/scope.js";
import type { ArchDiagram, ArchNode } from "./model/arch.js";
import { intersects } from "./model/geometry.js";

export type DiagnosticSeverity = "error" | "warning";

export type DiagnosticCode =
  | "parse-error"
  | "build-error"
  | "overlapping-siblings"
  | "hint-cycle"
  | "unconnected-node"
  | "extreme-aspect-ratio"
  | "at-overrides-hint";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** Stable identifier — match on this, not on the prose. */
  code: DiagnosticCode;
  message: string;
  /** 1-based. Null when nothing in the source could be pointed at. */
  line: number | null;
  col: number | null;
  /**
   * Exclusive end column, when the finding covers a span rather than a point.
   * Lets a caret become an underline and a position become a squiggle, instead
   * of every reader guessing how far the finding reaches.
   */
  endCol?: number | null;
  /** The offending source line, when there is one. */
  srcLine?: string;
  /**
   * Nodes the finding is about, in the order it names them. The first is the
   * one `line`/`col` point at; the rest are for a reader that can offer more
   * than one destination — `findDeclaration` locates them the same way.
   */
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
    diagnostics.push(
      warn(source, w.code, w.message, w.nodes),
    );
  }
  diagnostics.push(...overlapDiagnostics(diagram, source));
  diagnostics.push(...pinnedHintDiagnostics(diagram, source));
  diagnostics.push(...unconnectedDiagnostics(diagram, source));
  diagnostics.push(...aspectDiagnostics(diagram, source));

  return { diagnostics, failed: false };
}

/**
 * A warning, positioned at the declaration of the first node it names.
 *
 * Every warning here knows which nodes it is about — that is what `nodes` has
 * always been for — and the id is enough to find the line, so there is no
 * reason for a finding to arrive with nowhere to go. When the id cannot be
 * found the nulls stay: a position that is a guess is worse than none, because
 * it sends the reader to the wrong line with full confidence.
 */
function warn(
  source: string,
  code: DiagnosticCode,
  message: string,
  nodes?: string[],
): Diagnostic {
  const at = nodes?.[0] === undefined ? null : findDeclaration(source, nodes[0]);
  return {
    severity: "warning",
    code,
    message,
    line: at?.line ?? null,
    col: at?.col ?? null,
    endCol: at?.endCol ?? null,
    srcLine: at?.text,
    nodes,
  };
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
      // A parse error points at one spot; it has no span to report.
      endCol: null,
      srcLine: err.srcLine,
    };
  }
  const message = (err as Error).message;
  // Build errors name the node but carry no position. Recovering it by looking
  // for the id turns "duplicate id" from a whole-file hunt into a jump.
  const quoted = /"([A-Za-z0-9_]+)"/.exec(message);
  const at = quoted ? findDeclaration(source, quoted[1]!) : null;
  return {
    severity: "error",
    code: "build-error",
    message,
    line: at?.line ?? null,
    col: at?.col ?? null,
    endCol: at?.endCol ?? null,
    srcLine: at?.text,
    nodes: quoted && at ? [quoted[1]!] : undefined,
  };
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
function overlapDiagnostics(diagram: ArchDiagram, source: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const scope of scopes(diagram)) {
    for (let i = 0; i < scope.length; i++) {
      for (let j = i + 1; j < scope.length; j++) {
        const a = scope[i]!;
        const b = scope[j]!;
        if (a.rect && b.rect && intersects(a.rect, b.rect)) {
          // Both ends are worth reaching, so both are named — the reader gets
          // sent to the first and can follow `nodes` to the other.
          out.push(warn(source, "overlapping-siblings", `"${a.id}" and "${b.id}" overlap`, [
            a.id,
            b.id,
          ]));
        }
      }
    }
  }
  return out;
}

/**
 * A node carrying both exact coordinates and a relation to a sibling. The
 * coordinates win and the relation does nothing — never what someone writing both
 * meant. The playground's drag strips the relations it replaces, so this only
 * catches source written by hand.
 */
function pinnedHintDiagnostics(diagram: ArchDiagram, source: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const n of diagram.nodes) {
    const h = n.hint;
    if (!h?.at) continue;
    const dead = (["rightOf", "leftOf", "above", "below"] as const).filter((k) => h[k]);
    if (dead.length === 0) continue;
    out.push(
      warn(source, "at-overrides-hint", `"${n.id}" has @at, so @${dead[0]} on it is ignored`, [
        n.id,
      ]),
    );
  }
  return out;
}

/** A shape nobody connects to, in a diagram that is otherwise wired up. */
function unconnectedDiagnostics(diagram: ArchDiagram, source: string): Diagnostic[] {
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
    out.push(warn(source, "unconnected-node", `"${n.id}" is not connected to anything`, [n.id]));
  }
  return out;
}

/** A drawing far longer than it is tall usually means a missing container. */
function aspectDiagnostics(diagram: ArchDiagram, source: string): Diagnostic[] {
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
  // The only finding here that names no node — it is about the drawing. The
  // `architecture` line is where the diagram-wide directives are written, so it
  // is where the fix goes and where the reader should land.
  const at = findHeaderLine(source);
  return [
    {
      severity: "warning",
      code: "extreme-aspect-ratio",
      message: `the diagram is ${Math.round(w)}×${Math.round(h)}, a ${ratio > 1 ? Math.round(ratio) : Math.round(1 / ratio)}:1 strip — too ${shape} to read; group related nodes into a container or turn part of the flow with @below/@rightOf`,
      line: at?.line ?? null,
      col: at?.col ?? null,
      endCol: at?.endCol ?? null,
      srcLine: at?.text,
    },
  ];
}
