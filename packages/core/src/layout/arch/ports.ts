import type { ArchDiagram } from "../../model/arch.js";
import type { Point, Rect, Size } from "../../model/geometry.js";
import { center } from "../../model/geometry.js";

/**
 * Doors: where a connection crosses a container's border.
 *
 * A scope lays out its members knowing only the connections it can see, and that
 * is what leaves a node buried on the wrong side of its group. `biba` sits deep
 * inside `bi` and talks to `s3` on the far side of the drawing; nothing in `bi`'s
 * own graph says which way `s3` is, so `biba` lands wherever its neighbours put
 * it and the connector crosses the whole picture to get out.
 *
 * A door says it: this member has traffic leaving through *that* side of the
 * scope. It becomes a node of the scope's own graph — pinned to the border, no
 * size of its own — so the machinery already there (ranking, crossing
 * minimisation, the isotonic solve) puts the member next to its door instead of
 * needing a second placement mechanism bolted on beside the first.
 *
 * Which side a door is on comes from a probe pass: the layout runs once as it
 * always did, and that says whether the partner ended up left, right, above or
 * below. Sides are coarse facts — "`infra` is right of `company`" survives every
 * box in the drawing changing size — which is why one probe is enough and the
 * two passes cannot oscillate.
 */

export type PortSide = "left" | "right" | "top" | "bottom";

/** One door of one scope. */
export interface ScopePort {
  /** The direct member of the scope whose traffic uses this door. */
  member: string;
  /** Which border of the scope it sits on. */
  side: PortSide;
  /**
   * Where it sits along that border, in the scope's own coordinates. For a door
   * on the top or bottom that is the partner's own position, so the member lines
   * up under it; for one on the left or right it is the border itself, because
   * what the member needs there is to be the outermost thing in the scope.
   */
  target: number;
  /** How many connections use it. */
  weight: number;
}

export interface ProbeGeometry {
  /** The laid-out rectangle of a node, from the probe pass. */
  rectOf: (id: string) => Rect | undefined;
  /** Where a scope's own (0, 0) landed on the probe drawing. */
  originOf: (scope: string) => Point | undefined;
  /** How big a scope's content came out, so a border has a coordinate. */
  contentOf: (scope: string) => Size | undefined;
}

/**
 * Every scope's doors, keyed by container id. The top level has none by
 * definition: nothing is outside it.
 */
export function derivePorts(
  diagram: ArchDiagram,
  parentOf: ReadonlyMap<string, string>,
  probe: ProbeGeometry,
  gap: number,
): Map<string, ScopePort[]> {
  const chainOf = (id: string): string[] => {
    const out: string[] = [];
    for (let p = parentOf.get(id); p !== undefined && !out.includes(p); p = parentOf.get(p)) {
      out.push(p);
    }
    return out;
  };
  /** The ancestor of `id` that is a direct member of `scope`. */
  const liftTo = (id: string, scope: string): string | null => {
    for (let cur = id; ; ) {
      const p = parentOf.get(cur) ?? "";
      if (p === scope) return cur;
      if (p === "") return null;
      cur = p;
    }
  };

  interface Draft {
    member: string;
    side: PortSide;
    sum: number;
    weight: number;
  }
  const byScope = new Map<string, Map<string, Draft>>();

  for (const c of diagram.connections) {
    const up = { from: chainOf(c.from), to: chainOf(c.to) };
    // A scope that holds one end and not the other is a border this connection
    // crosses, and every one of them gets a door.
    const crossings: Array<{ scope: string; inside: string; outside: string }> = [];
    for (const s of up.from) {
      if (!up.to.includes(s)) crossings.push({ scope: s, inside: c.from, outside: c.to });
    }
    for (const s of up.to) {
      if (!up.from.includes(s)) crossings.push({ scope: s, inside: c.to, outside: c.from });
    }

    for (const { scope, inside, outside } of crossings) {
      const box = probe.rectOf(scope);
      const away = probe.rectOf(outside);
      const origin = probe.originOf(scope);
      const content = probe.contentOf(scope);
      const member = liftTo(inside, scope);
      if (!box || !away || !origin || !content || !member) continue;

      // Which border, by which way the partner overshoots this one. The largest
      // overshoot wins: a partner beyond the right edge and barely below it is
      // to the right, and a door on the wrong side is worse than no door.
      const p = center(away);
      const out = {
        left: box.x - p.x,
        right: p.x - (box.x + box.width),
        top: box.y - p.y,
        bottom: p.y - (box.y + box.height),
      } satisfies Record<PortSide, number>;
      let side: PortSide = "right";
      let best = -Infinity;
      for (const s of ["left", "right", "top", "bottom"] as const) {
        if (out[s] > best) {
          best = out[s];
          side = s;
        }
      }
      // A partner that overlaps the scope on both axes is neither in nor out —
      // nothing truthful to say about a side, so nothing is said.
      if (best <= 0) continue;

      const target =
        side === "top" || side === "bottom"
          ? p.x - origin.x
          : side === "left"
            ? -gap
            : content.width + gap;

      let bucket = byScope.get(scope);
      if (!bucket) {
        bucket = new Map();
        byScope.set(scope, bucket);
      }
      const key = `${member}|${side}`;
      const hit = bucket.get(key);
      if (hit) {
        hit.sum += target;
        hit.weight += 1;
      } else {
        bucket.set(key, { member, side, sum: target, weight: 1 });
      }
    }
  }

  const out = new Map<string, ScopePort[]>();
  for (const [scope, bucket] of byScope) {
    out.set(
      scope,
      [...bucket.values()].map((d) => ({
        member: d.member,
        side: d.side,
        // Several connections through one door pull it to their middle.
        target: d.sum / d.weight,
        weight: d.weight,
      })),
    );
  }
  return out;
}
