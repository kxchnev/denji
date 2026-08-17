import type { PlaceHint } from "../../model/arch.js";
import type { Point } from "../../model/geometry.js";
import { snapHalf } from "./grid.js";
import type { ScopeEdge } from "./graph.js";
import type { ScopePort } from "./ports.js";
import { BUS_PITCH } from "./route.js";

/**
 * Automatic placement for one scope: a layered drawing of the scope's own graph,
 * built over communities found in that graph.
 *
 * Layering is what answers "connectors run over the boxes". An edge that skips a
 * layer gets a stand-in node in every layer it crosses, and that stand-in takes
 * up room like any other node — so the layer keeps a corridor with nothing in
 * it, and the router is handed that corridor instead of guessing a way through.
 *
 * Communities come first because a flat layering of a whole document spreads
 * things that belong together across the full width: nodes that talk mostly to
 * each other are drawn as one small picture, and those pictures are then laid
 * out by the same machinery one level up. On the diagram this work started from
 * that is the difference between a drawing 5.9 and one 3.7 megapixels large,
 * with fewer crossings in the smaller one.
 */

export type Flow = "down" | "right";

/** One node as the layout sees it: a size, and whatever the author asked for. */
export interface Placeable {
  id: string;
  width: number;
  height: number;
  hint?: PlaceHint;
}

/** Resolved spacing for one scope: horizontal and vertical gaps between siblings. */
export interface AxisGaps {
  x: number;
  y: number;
}

/** Something the layout could not honour literally, reported rather than thrown. */
export interface LayoutWarning {
  code: "hint-cycle";
  message: string;
  /** The nodes the cycle left unordered. */
  nodes: string[];
}

/** Width a stand-in node claims, i.e. how wide a reserved corridor is. */
const LANE_WIDTH = 24;
/** Sweeps of the median heuristic, each followed by adjacent-swap repair. */
const ORDER_PASSES = 8;
/** Sweeps of coordinate assignment; the last few look both ways. */
const COORD_PASSES = 10;
/** How many sweeps look both up and down, so the result is not left leaning. */
const BALANCED_PASSES = 3;
/** A stand-in outweighs a box this much: a straight corridor beats a centred box. */
const LANE_WEIGHT = 8;
/** Weight of a node with nothing to align to — enough to hold still, not to pull. */
const IDLE_WEIGHT = 0.25;
/**
 * How many lines a channel is widened for before it stops growing.
 *
 * Every connection crossing between two layers may need a lane of its own in the
 * gap between them, and a gap sized for one of them makes the rest run along
 * each other or squeeze against a box. Capped because a hub with thirty edges
 * would otherwise push its neighbours a quarter of a screen apart, and past a
 * handful of lanes nobody is counting them anyway.
 */
const MAX_LANES = 6;
/**
 * How loudly a door asks for its place, per connection through it.
 *
 * Louder than a node with neighbours on both sides, because a door is not an
 * opinion about where something looks nicer: it is where the connector has to
 * leave, and a member that has to leave through the right border and sits on the
 * left is the long wandering line this is here to stop.
 */
const PORT_WEIGHT = 6;

/**
 * Where a connection's real end sits inside a scope member, in that member's own
 * coordinates. `undefined` means the member *is* the end, and its middle is as
 * good an answer as there is.
 *
 * The other half of {@link ScopePort}: a door seen from outside. A scope places
 * members, but connections touch leaves, and a leaf can sit in the far corner of
 * a group the size of a district. Aligning the districts leaves the connector
 * with a dogleg to walk; aligning the doors is what makes it a straight line.
 */
export type PortOffset = (member: string, endpoint: string) => Point | undefined;

export interface AutoResult {
  pos: Map<string, Point>;
  width: number;
  height: number;
  /** Per edge key, the corridor kept clear for it. */
  lanes: Map<string, Point[]>;
}

export function autoPlace(
  items: Placeable[],
  edges: readonly ScopeEdge[],
  gaps: AxisGaps,
  onWarn?: (warning: LayoutWarning) => void,
  flow: Flow = "down",
  ports: readonly ScopePort[] = [],
  doorOf?: PortOffset,
): AutoResult {
  if (items.length === 0) {
    return { pos: new Map(), width: 0, height: 0, lanes: new Map() };
  }
  const constraints = hintConstraints(items, flow, onWarn);
  const groups = communities(items, edges);
  const buckets = new Map<string, Placeable[]>();
  for (const it of items) {
    const l = groups.get(it.id)!;
    const b = buckets.get(l);
    if (b) b.push(it);
    else buckets.set(l, [it]);
  }

  // Splitting into communities is only worth it when it actually gathers
  // something; one bucket, or nothing but singletons, is the flat case wearing
  // a hat, and going through the two-level path would only cost alignment.
  const gathers = [...buckets.values()].some((b) => b.length > 1);
  if (buckets.size <= 1 || !gathers) {
    return layered(items, edges, gaps, flow, constraints, ports, doorOf);
  }
  // A constraint that reaches across communities cannot be expressed once they
  // are laid out apart, so the author's hints decide the split too: anything
  // they tie together stays together.
  const tied = new Map<string, string>();
  for (const [a, b] of [...constraints.same, ...constraints.after]) {
    const ga = groups.get(a);
    const gb = groups.get(b);
    if (ga && gb && ga !== gb) tied.set(gb, ga);
  }
  if (tied.size > 0) {
    for (const it of items) {
      let g = groups.get(it.id)!;
      for (let guard = 0; guard < buckets.size && tied.has(g); guard++) g = tied.get(g)!;
      groups.set(it.id, g);
    }
    return autoPlaceGrouped(items, edges, gaps, flow, constraints, groups, ports, doorOf);
  }
  return autoPlaceGrouped(items, edges, gaps, flow, constraints, groups, ports, doorOf);
}

function autoPlaceGrouped(
  items: Placeable[],
  edges: readonly ScopeEdge[],
  gaps: AxisGaps,
  flow: Flow,
  constraints: Constraints,
  groups: Map<string, string>,
  ports: readonly ScopePort[],
  doorOf?: PortOffset,
): AutoResult {
  const buckets = new Map<string, Placeable[]>();
  for (const it of items) {
    const l = groups.get(it.id)!;
    const b = buckets.get(l);
    if (b) b.push(it);
    else buckets.set(l, [it]);
  }
  if (buckets.size <= 1) return layered(items, edges, gaps, flow, constraints, ports, doorOf);

  const inner = new Map<string, AutoResult>();
  for (const [l, members] of buckets) {
    const keep = new Set(members.map((m) => m.id));
    inner.set(
      l,
      layered(
        members,
        edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
        gaps,
        flow,
        pick(constraints, keep),
        ports.filter((p) => keep.has(p.member)),
        doorOf,
      ),
    );
  }

  // A community is one box to the outer pass, and it inherits the doors of
  // everything inside it: whichever member has to reach out to the right, the
  // community it belongs to is what has to end up on the right.
  const superPorts = new Map<string, ScopePort>();
  for (const p of ports) {
    const community = groups.get(p.member);
    if (community === undefined) continue;
    const key = `${community}|${p.side}`;
    const hit = superPorts.get(key);
    if (hit) {
      hit.target = (hit.target * hit.weight + p.target * p.weight) / (hit.weight + p.weight);
      hit.weight += p.weight;
    } else {
      superPorts.set(key, { ...p, member: community });
    }
  }

  const box = new Map(items.map((it) => [it.id, it]));
  const memberOf = new Map<string, string>();
  for (const e of edges) {
    for (const p of e.pairs ?? []) {
      if (!memberOf.has(p.from)) memberOf.set(p.from, e.from);
      if (!memberOf.has(p.to)) memberOf.set(p.to, e.to);
    }
  }
  /** A community's door: its member's door, moved by where the member landed. */
  const superDoor: PortOffset = (community, endpoint) => {
    const member = memberOf.get(endpoint);
    if (member === undefined || groups.get(member) !== community) return undefined;
    const at = inner.get(community)?.pos.get(member);
    if (!at) return undefined;
    const own = doorOf?.(member, endpoint);
    const m = box.get(member);
    const off = own ?? { x: (m?.width ?? 0) / 2, y: (m?.height ?? 0) / 2 };
    return { x: at.x + off.x, y: at.y + off.y };
  };

  // One community, one box. Its edges are whatever crossed its border, and it
  // carries the keys of the real edges so their corridors can be handed back.
  const superItems: Placeable[] = [...buckets.keys()].map((l) => ({
    id: l,
    width: inner.get(l)!.width,
    height: inner.get(l)!.height,
  }));
  const superEdges = new Map<string, ScopeEdge>();
  const carried = new Map<string, string[]>();
  for (const e of edges) {
    const a = groups.get(e.from)!;
    const b = groups.get(e.to)!;
    if (a === b) continue;
    const key = `${a} ${b}`;
    const hit = superEdges.get(key);
    if (hit) {
      hit.weight += e.weight;
      hit.indices.push(...e.indices);
      hit.pairs.push(...(e.pairs ?? []));
      carried.get(key)!.push(e.key);
    } else {
      superEdges.set(key, {
        key,
        from: a,
        to: b,
        weight: e.weight,
        indices: [...e.indices],
        pairs: [...(e.pairs ?? [])],
      });
      carried.set(key, [e.key]);
    }
  }
  const outer = layered(
    superItems,
    [...superEdges.values()],
    gaps,
    flow,
    { same: [], after: [] },
    [...superPorts.values()],
    superDoor,
  );

  const pos = new Map<string, Point>();
  const lanes = new Map<string, Point[]>();
  for (const [l, members] of buckets) {
    const at = outer.pos.get(l)!;
    const sub = inner.get(l)!;
    for (const m of members) {
      const p = sub.pos.get(m.id)!;
      pos.set(m.id, { x: p.x + at.x, y: p.y + at.y });
    }
    for (const [k, pts] of sub.lanes) {
      lanes.set(
        k,
        pts.map((p) => ({ x: p.x + at.x, y: p.y + at.y })),
      );
    }
  }
  for (const [key, pts] of outer.lanes) {
    for (const real of carried.get(key) ?? []) lanes.set(real, pts);
  }
  return { pos, width: outer.width, height: outer.height, lanes };
}

// ── the author's hints, as constraints ──────────────────────────────────────

interface Constraints {
  /** Pairs that must share a rank, in that order across it. */
  same: Array<[string, string]>;
  /** Pairs where the second must come after the first along the flow. */
  after: Array<[string, string]>;
}

const pick = (c: Constraints, keep: ReadonlySet<string>): Constraints => ({
  same: c.same.filter(([a, b]) => keep.has(a) && keep.has(b)),
  after: c.after.filter(([a, b]) => keep.has(a) && keep.has(b)),
});

/**
 * What `rightOf` and friends mean once nothing is placed by hand.
 *
 * A relation is a direction on the page, so which kind of constraint it becomes
 * depends on which way the drawing flows. Reading downwards, `rightOf` is an
 * order within one rank and `below` is an order between ranks; reading sideways
 * the two swap. The author writes where things sit relative to each other and
 * gets that, whichever direction the diagram ends up running.
 */
function hintConstraints(
  items: Placeable[],
  flow: Flow,
  onWarn?: (warning: LayoutWarning) => void,
): Constraints {
  const known = new Set(items.map((it) => it.id));
  const down = flow === "down";
  const same: Array<[string, string]> = [];
  const after: Array<[string, string]> = [];
  for (const it of items) {
    const h = it.hint;
    if (!h) continue;
    const across = down ? ([h.rightOf, h.leftOf] as const) : ([h.below, h.above] as const);
    const along = down ? ([h.below, h.above] as const) : ([h.rightOf, h.leftOf] as const);
    if (across[0] && across[0] !== it.id && known.has(across[0])) same.push([across[0], it.id]);
    else if (across[1] && across[1] !== it.id && known.has(across[1])) same.push([it.id, across[1]]);
    if (along[0] && along[0] !== it.id && known.has(along[0])) after.push([along[0], it.id]);
    else if (along[1] && along[1] !== it.id && known.has(along[1])) after.push([it.id, along[1]]);
  }
  return {
    same: acyclic(items, same, onWarn),
    after: acyclic(items, after, onWarn),
  };
}

/**
 * Drop the constraints that make a cycle, and say which nodes were in it.
 *
 * "Put a right of b, and b right of a" cannot be drawn, and silently choosing
 * one of the two would leave the author staring at a diagram that disobeyed a
 * line they wrote. Only hint-derived orders come through here — a cycle among
 * the author's *connections* is an ordinary service graph, and layering handles
 * it without comment.
 */
function acyclic(
  items: Placeable[],
  pairs: Array<[string, string]>,
  onWarn?: (warning: LayoutWarning) => void,
): Array<[string, string]> {
  if (pairs.length === 0) return pairs;
  const out = new Map<string, string[]>();
  for (const it of items) out.set(it.id, []);
  for (const [a, b] of pairs) out.get(a)?.push(b);

  const state = new Map<string, 0 | 1 | 2>();
  const dropped = new Set<string>();
  const stuck = new Set<string>();
  const visit = (id: string): void => {
    state.set(id, 1);
    for (const to of out.get(id) ?? []) {
      const s = state.get(to) ?? 0;
      if (s === 1) {
        dropped.add(`${id} ${to}`);
        stuck.add(id);
        stuck.add(to);
      } else if (s === 0) visit(to);
    }
    state.set(id, 2);
  };
  for (const it of items) if ((state.get(it.id) ?? 0) === 0) visit(it.id);

  if (stuck.size > 0) {
    const nodes = items.filter((it) => stuck.has(it.id)).map((it) => it.id);
    onWarn?.({
      code: "hint-cycle",
      message: `relative hints form a cycle (${nodes.join(" → ")}); the layout drops the relations that close it`,
      nodes,
    });
  }
  return pairs.filter(([a, b]) => !dropped.has(`${a} ${b}`));
}

/**
 * Communities of the scope's graph by label propagation: every node repeatedly
 * takes the label its neighbours carry most weight of.
 *
 * Deterministic on purpose — nodes are visited in declaration order and ties go
 * to the smaller id — because the usual formulation shuffles, and a layout that
 * moves when nothing changed is not a layout anyone can maintain.
 */
function communities(items: Placeable[], edges: readonly ScopeEdge[]): Map<string, string> {
  const label = new Map(items.map((it) => [it.id, it.id]));
  const nbr = new Map<string, Array<{ id: string; w: number }>>(items.map((it) => [it.id, []]));
  for (const e of edges) {
    if (!nbr.has(e.from) || !nbr.has(e.to)) continue;
    nbr.get(e.from)!.push({ id: e.to, w: e.weight });
    nbr.get(e.to)!.push({ id: e.from, w: e.weight });
  }
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const it of items) {
      const tally = new Map<string, number>();
      for (const n of nbr.get(it.id)!) {
        const l = label.get(n.id)!;
        tally.set(l, (tally.get(l) ?? 0) + n.w);
      }
      if (tally.size === 0) continue;
      let best = "";
      let bestW = -1;
      for (const [l, w] of tally) {
        if (w > bestW || (w === bestW && l < best)) {
          best = l;
          bestW = w;
        }
      }
      if (best !== label.get(it.id)) {
        label.set(it.id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return label;
}

// ── one layered drawing ─────────────────────────────────────────────────────

interface Vertex {
  id: string;
  /** Extent along the flow and across it. */
  along: number;
  across: number;
  stand: boolean;
  seq: number;
  rank: number;
  order: number;
  /** Coordinate across the flow — the near edge, not the centre. */
  pos: number;
  /** The author's own `@gap`, which replaces the scope's for this node's relation. */
  gap?: number;
  /** Who the node's hints point at, per axis, so `@gap` knows whose gap it is. */
  anchorAcross?: string;
  anchorAlong?: string;
  /**
   * A door rather than a box: no size, pinned across, never drawn. `side` is
   * which end of its layer it belongs at — negative for the near edge of the
   * scope, positive for the far one, zero for a door along the flow.
   */
  door?: { at: number; weight: number; side: number };
  /** Sum of the sides of this node's own doors, i.e. which way it has to face. */
  facing?: number;
}

interface Arc {
  from: string;
  to: string;
  weight: number;
  key: string;
  reversed: boolean;
  /**
   * One entry per connection this arc stands for: how far along its own box each
   * end really touches, across the flow. Empty means "use the middles".
   */
  ports?: Array<{ from: number; to: number }>;
}

function layered(
  items: Placeable[],
  edges: readonly ScopeEdge[],
  gaps: AxisGaps,
  flow: Flow,
  constraints: Constraints,
  ports: readonly ScopePort[] = [],
  doorOf?: PortOffset,
): AutoResult {
  const down = flow === "down";
  const gapAlong = down ? gaps.y : gaps.x;
  const gapAcross = down ? gaps.x : gaps.y;

  const known = new Set(items.map((it) => it.id));
  const sibling = (id: string | undefined, self: string): string | undefined =>
    id && id !== self && known.has(id) ? id : undefined;
  const V = new Map<string, Vertex>();
  items.forEach((it, seq) => {
    const h = it.hint;
    V.set(it.id, {
      id: it.id,
      along: down ? it.height : it.width,
      across: down ? it.width : it.height,
      stand: false,
      seq,
      rank: 0,
      order: 0,
      pos: 0,
      gap: h?.gap,
      anchorAcross: sibling(down ? (h?.rightOf ?? h?.leftOf) : (h?.below ?? h?.above), it.id),
      anchorAlong: sibling(down ? (h?.below ?? h?.above) : (h?.rightOf ?? h?.leftOf), it.id),
    });
  });

  // Doors join the scope's own graph. Across the flow a side door is pinned to
  // the border and ordered outside its member, so the member is pushed out to
  // meet it; along the flow a top or bottom door takes a rank of its own, so the
  // member ends up in the layer nearest that border. Either way it is the
  // ranking, ordering and settling already here that move the member — nothing
  // places anything twice.
  const doors: Array<{ id: string; port: ScopePort }> = [];
  const same = [...constraints.same];
  const doorArcs: Arc[] = [];
  ports.forEach((p, k) => {
    if (!V.has(p.member)) return;
    const acrossSide = down ? p.side === "left" || p.side === "right" : p.side === "top" || p.side === "bottom";
    const first = down ? p.side === "left" || p.side === "top" : p.side === "top" || p.side === "left";
    // A space keeps the id out of reach of anything an author could write.
    const id = ` door${k}`;
    V.set(id, {
      id,
      along: 0,
      across: 0,
      stand: false,
      seq: items.length + 1000 + k,
      rank: 0,
      order: 0,
      pos: 0,
      door: { at: p.target, weight: p.weight, side: acrossSide ? (first ? -1 : 1) : 0 },
    });
    doors.push({ id, port: p });
    if (acrossSide) same.push(first ? [id, p.member] : [p.member, id]);
    const arc: Arc = first
      ? { from: id, to: p.member, weight: p.weight, key: ` door${k}`, reversed: false }
      : { from: p.member, to: id, weight: p.weight, key: ` door${k}`, reversed: false };
    doorArcs.push(arc);
  });

  const acrossOf = (p: Point): number => (down ? p.x : p.y);
  const doorAt = (member: string, endpoint: string): number => {
    const off = doorOf?.(member, endpoint);
    if (off) return acrossOf(off);
    return (V.get(member)?.across ?? 0) / 2;
  };
  const portsOf = (e: ScopeEdge): Array<{ from: number; to: number }> =>
    (e.pairs ?? []).map((p) => ({ from: doorAt(e.from, p.from), to: doorAt(e.to, p.to) }));

  const arcs = orient(items, edges, portsOf);
  const rank = assignRanks(
    [...items.map((it) => it.id), ...doors.map((d) => d.id)],
    [...arcs, ...doorArcs],
    { same, after: constraints.after },
    (id) => V.get(id)?.door !== undefined,
  );
  for (const [id, r] of rank) V.get(id)!.rank = r;

  const corridors = new Map<string, string[]>();
  const layerArcs: Arc[] = [];
  let stand = 0;
  for (const a of arcs) {
    const r1 = rank.get(a.from)!;
    const r2 = rank.get(a.to)!;
    if (r2 - r1 <= 1) {
      layerArcs.push(a);
      continue;
    }
    const chain: string[] = [];
    let prev = a.from;
    // A corridor is entered at the door the connection really uses and left at
    // the middle of the stand-in, which is the corridor's whole width.
    const midLane = LANE_WIDTH / 2;
    const ap = a.ports ?? [];
    const head = ap.map((p) => ({ from: p.from, to: midLane }));
    const tail = ap.map((p) => ({ from: midLane, to: p.to }));
    const through = ap.map(() => ({ from: midLane, to: midLane }));
    for (let r = r1 + 1; r < r2; r++) {
      // A space keeps the id out of reach of anything the author could have
      // written, so a stand-in can never collide with a real node.
      const id = ` lane${stand++}`;
      V.set(id, {
        id,
        along: 0,
        across: LANE_WIDTH,
        stand: true,
        seq: items.length + stand,
        rank: r,
        order: 0,
        pos: 0,
      });
      chain.push(id);
      layerArcs.push({
        from: prev,
        to: id,
        weight: a.weight,
        key: a.key,
        reversed: a.reversed,
        ports: prev === a.from ? head : through,
      });
      prev = id;
    }
    layerArcs.push({
      from: prev,
      to: a.to,
      weight: a.weight,
      key: a.key,
      reversed: a.reversed,
      ports: prev === a.from ? a.ports : tail,
    });
    corridors.set(a.key, a.reversed ? [...chain].reverse() : chain);
  }

  // Which way each node has to face, from the doors hanging off it.
  for (const { id, port } of doors) {
    const d = V.get(id)!.door!;
    if (d.side === 0) continue;
    const m = V.get(port.member)!;
    m.facing = (m.facing ?? 0) + d.side * port.weight;
  }

  const layers = buildLayers(V);
  const sides = adjacency([...layerArcs, ...doorArcs], V);
  minimizeCrossings(layers, sides, V);
  applyDoorOrder(layers, V);
  applyOrderHints(layers, same, V);
  assignAcross(layers, sides, V, gapAcross);

  // How many connections have to get across each gap between layers. That is
  // how many lanes the router may need there, and the gap is what has to hold
  // them.
  const load = new Array<number>(layers.length).fill(0);
  for (const a of layerArcs) {
    const from = V.get(a.from);
    const to = V.get(a.to);
    if (from && to && to.rank === from.rank + 1) load[from.rank] = (load[from.rank] ?? 0) + 1;
  }

  const thickness = layers.map((l) => Math.max(0, ...l.map((id) => V.get(id)!.along)));
  /** A layer of nothing but doors is a border, not a shelf: it claims no room. */
  const allDoors = layers.map((l) => l.length > 0 && l.every((id) => V.get(id)!.door !== undefined));
  const start: number[] = [];
  let cursor = 0;
  for (let r = 0; r < layers.length; r++) {
    start.push(cursor);
    const lanes = Math.min(Math.max(0, (load[r] ?? 0) - 1), MAX_LANES);
    const gap = allDoors[r] || allDoors[r + 1] ? 0 : rankGap(layers, r, V, gapAlong);
    cursor += thickness[r]! + gap + lanes * BUS_PITCH;
  }

  const at = (v: Vertex, whole: boolean): Point => {
    // Nodes of one layer hang on its middle, so a layer holding a tall service
    // and a short box does not read as two separate shelves. Only the centring
    // is snapped, exactly as it always was: a container's height has no grid to
    // come from, so halving a difference of heights can land on a half pixel —
    // while the rest of this arithmetic is whole numbers all the way down and
    // rounding it would only make a gap the author asked for come out wrong.
    const slack = thickness[v.rank]! - v.along;
    const a = start[v.rank]! + (whole ? snapHalf(slack / 2) : slack / 2);
    return down ? { x: v.pos, y: a } : { x: a, y: v.pos };
  };

  const pos = new Map<string, Point>();
  for (const it of items) pos.set(it.id, at(V.get(it.id)!, true));

  const lanes = new Map<string, Point[]>();
  for (const [key, chain] of corridors) {
    lanes.set(
      key,
      chain.map((id) => {
        const v = V.get(id)!;
        const p = at(v, false);
        return down
          ? { x: p.x + v.across / 2, y: p.y + thickness[v.rank]! / 2 }
          : { x: p.x + thickness[v.rank]! / 2, y: p.y + v.across / 2 };
      }),
    );
  }

  return frame(items, pos, lanes);
}

/**
 * How far layer `r + 1` sits from layer `r`.
 *
 * A rank boundary is shared by everything that crosses it, so a node's own
 * `@gap` cannot apply to it alone — but a node that asked for one clearly meant
 * to be nearer to or further from what it hangs off, and ignoring the number
 * outright would be worse than applying it a little too widely. The narrowest
 * request wins, because that is the one a wider gap would visibly disobey.
 */
function rankGap(layers: string[][], r: number, V: Map<string, Vertex>, base: number): number {
  const next = layers[r + 1];
  if (!next) return base;
  let out: number | undefined;
  for (const id of next) {
    const v = V.get(id)!;
    if (v.gap === undefined || !v.anchorAlong) continue;
    if (V.get(v.anchorAlong)?.rank !== r) continue;
    out = out === undefined ? v.gap : Math.min(out, v.gap);
  }
  return out ?? base;
}

/** The room between two neighbours in one layer, honouring an author's `@gap`. */
function neighbourGap(a: Vertex, b: Vertex, base: number): number {
  if (b.gap !== undefined && b.anchorAcross === a.id) return b.gap;
  if (a.gap !== undefined && a.anchorAcross === b.id) return a.gap;
  return base;
}

/**
 * Where each member of a layer starts, measured from the layer's own beginning.
 *
 * A door **lives in the gap**: it has no width, so it claims none, and it must
 * not swallow the gap either. Letting one stand between two boxes as an ordinary
 * neighbour is what left `superset` and `biba` flush against each other — the
 * door took the space between them and gave nothing back. So doors are stepped
 * over, and the gap is always measured between the two real boxes.
 */
function layerOffsets(layer: string[], V: Map<string, Vertex>, gap: number): number[] {
  const out: number[] = [];
  let run = 0;
  let lastReal: Vertex | undefined;
  for (const id of layer) {
    const v = V.get(id)!;
    if (v.door) {
      out.push(run);
      continue;
    }
    if (lastReal) run += neighbourGap(lastReal, v, gap);
    out.push(run);
    run += v.across;
    lastReal = v;
  }
  return out;
}

/** Pack the result against its own origin and measure it from there. */
function frame(items: Placeable[], pos: Map<string, Point>, lanes: Map<string, Point[]>): AutoResult {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const p = pos.get(it.id)!;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + it.width);
    maxY = Math.max(maxY, p.y + it.height);
  }
  if (!isFinite(minX)) return { pos, width: 0, height: 0, lanes };
  for (const it of items) {
    const p = pos.get(it.id)!;
    pos.set(it.id, { x: p.x - minX, y: p.y - minY });
  }
  for (const [k, pts] of lanes) {
    lanes.set(
      k,
      pts.map((p) => ({ x: p.x - minX, y: p.y - minY })),
    );
  }
  return { pos, width: maxX - minX, height: maxY - minY, lanes };
}

/**
 * Turn the graph into a drawable one by reversing the edges that close a cycle.
 *
 * The search starts from nodes nothing points at, because those are what a
 * reader takes for the beginning; only then does it fall back to declaration
 * order, so the choice of which edge to flip never depends on hash iteration.
 */
function orient(
  items: Placeable[],
  edges: readonly ScopeEdge[],
  portsOf: (e: ScopeEdge) => Array<{ from: number; to: number }>,
): Arc[] {
  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const it of items) {
    out.set(it.id, []);
    indeg.set(it.id, 0);
  }
  for (const e of edges) {
    if (!out.has(e.from) || !out.has(e.to)) continue;
    out.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<string>();
  const stack: Array<{ id: string; next: number }> = [];
  const walk = (root: string): void => {
    stack.push({ id: root, next: 0 });
    state.set(root, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const kids = out.get(top.id) ?? [];
      if (top.next >= kids.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const to = kids[top.next++]!;
      const s = state.get(to) ?? 0;
      if (s === 1) back.add(`${top.id} ${to}`);
      else if (s === 0) {
        state.set(to, 1);
        stack.push({ id: to, next: 0 });
      }
    }
  };
  const roots = items.filter((it) => (indeg.get(it.id) ?? 0) === 0);
  for (const it of [...roots, ...items]) if ((state.get(it.id) ?? 0) === 0) walk(it.id);

  return edges
    .filter((e) => out.has(e.from) && out.has(e.to))
    .map((e) => {
      const rev = back.has(`${e.from} ${e.to}`);
      const ports = portsOf(e);
      return {
        from: rev ? e.to : e.from,
        to: rev ? e.from : e.to,
        weight: e.weight,
        key: e.key,
        reversed: rev,
        ports: rev ? ports.map((p) => ({ from: p.to, to: p.from })) : ports,
      };
    });
}

/**
 * Which layer each node belongs to: the longest path from a source, with the
 * author's hints folded in first.
 *
 * "Same rank" is enforced by contracting those nodes into one before ranking,
 * so it holds by construction rather than by a repair pass that might not
 * converge. Sources are then pulled down towards what they feed: a node whose
 * only successor is four layers away otherwise hangs alone at the top, which
 * reads as an oversight rather than as a beginning.
 */
function assignRanks(
  ids: string[],
  arcs: Arc[],
  constraints: Constraints,
  isDoor: (id: string) => boolean = () => false,
): Map<string, number> {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    for (let c = a; c !== r; ) {
      const nx = parent.get(c)!;
      parent.set(c, r);
      c = nx;
    }
    return r;
  };
  for (const [a, b] of constraints.same) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  const cOut = new Map<string, string[]>();
  const comps: string[] = [];
  for (const id of ids) {
    const c = find(id);
    if (!cOut.has(c)) {
      cOut.set(c, []);
      comps.push(c);
    }
  }
  const link = (from: string, to: string): void => {
    const a = find(from);
    const b = find(to);
    if (a !== b) cOut.get(a)!.push(b);
  };
  for (const a of arcs) link(a.from, a.to);
  for (const [a, b] of constraints.after) link(a, b);

  // Contraction can close a cycle that was not there before, and the relaxation
  // below would then never settle.
  const state = new Map<string, 0 | 1 | 2>();
  const dropped = new Set<string>();
  const visit = (c: string): void => {
    state.set(c, 1);
    for (const to of cOut.get(c) ?? []) {
      const s = state.get(to) ?? 0;
      if (s === 1) dropped.add(`${c} ${to}`);
      else if (s === 0) visit(to);
    }
    state.set(c, 2);
  };
  for (const c of comps) if ((state.get(c) ?? 0) === 0) visit(c);

  const rank = new Map(comps.map((c) => [c, 0]));
  for (let pass = 0; pass < comps.length; pass++) {
    let changed = false;
    for (const c of comps) {
      for (const to of cOut.get(c) ?? []) {
        if (dropped.has(`${c} ${to}`)) continue;
        if (rank.get(c)! + 1 > rank.get(to)!) {
          rank.set(to, rank.get(c)! + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const preds = new Map(comps.map((c) => [c, 0]));
  for (const c of comps) {
    for (const to of cOut.get(c) ?? []) {
      if (!dropped.has(`${c} ${to}`)) preds.set(to, (preds.get(to) ?? 0) + 1);
    }
  }
  for (const c of [...comps].sort((a, b) => rank.get(b)! - rank.get(a)!)) {
    if ((preds.get(c) ?? 0) > 0) continue;
    // A door is not a node that hangs alone at the top: it is a border, and
    // pulling it down to meet its member is exactly the pull it exists to
    // resist. It stays where it is and the member stays after it.
    if (isDoor(c)) continue;
    const outs = (cOut.get(c) ?? []).filter((to) => !dropped.has(`${c} ${to}`));
    if (outs.length === 0) continue;
    const latest = Math.min(...outs.map((to) => rank.get(to)! - 1));
    if (latest > rank.get(c)!) rank.set(c, latest);
  }

  const out = new Map<string, number>();
  let min = Infinity;
  for (const id of ids) {
    const r = rank.get(find(id))!;
    out.set(id, r);
    min = Math.min(min, r);
  }
  for (const [id, r] of out) out.set(id, r - min);
  return out;
}

function buildLayers(V: Map<string, Vertex>): string[][] {
  const max = Math.max(...[...V.values()].map((v) => v.rank));
  const layers: string[][] = Array.from({ length: max + 1 }, () => []);
  for (const v of [...V.values()].sort((a, b) => a.seq - b.seq)) layers[v.rank]!.push(v.id);
  for (const l of layers) reindex(l, V);
  return layers;
}

/**
 * One neighbour as seen from one node: which node, which door of it, and which
 * door of ours. Lining those two up is what makes a connector straight, and a
 * connection into the corner of a group is nowhere near that group's middle.
 */
interface Link {
  id: string;
  /** Where the connection leaves this node, across the flow, from its near edge. */
  myAt: number;
  /** Where it lands on the neighbour, likewise. */
  theirAt: number;
}

interface Sides {
  up: Map<string, Link[]>;
  dn: Map<string, Link[]>;
}

function adjacency(arcs: Arc[], V: Map<string, Vertex>): Sides {
  const up = new Map<string, Link[]>();
  const dn = new Map<string, Link[]>();
  for (const id of V.keys()) {
    up.set(id, []);
    dn.set(id, []);
  }
  const half = (id: string): number => V.get(id)!.across / 2;
  for (const a of arcs) {
    if (!V.has(a.from) || !V.has(a.to)) continue;
    // One entry per connection, not per pair of boxes: a member three
    // connections lean on should feel three times the pull.
    const ps = a.ports?.length ? a.ports : [{ from: half(a.from), to: half(a.to) }];
    for (const p of ps) {
      dn.get(a.from)!.push({ id: a.to, myAt: p.from, theirAt: p.to });
      up.get(a.to)!.push({ id: a.from, myAt: p.to, theirAt: p.from });
    }
  }
  return { up, dn };
}

const reindex = (layer: string[], V: Map<string, Vertex>): void => {
  layer.forEach((id, i) => (V.get(id)!.order = i));
};

/** Median heuristic followed by adjacent swaps, keeping the best seen. */
function minimizeCrossings(layers: string[][], sides: Sides, V: Map<string, Vertex>): void {
  const median = (id: string, side: Map<string, Link[]>): number => {
    const ns = side
      .get(id)!
      .map((n) => V.get(n.id)!.order)
      .sort((x, y) => x - y);
    if (ns.length === 0) return -1;
    const m = ns.length >> 1;
    return ns.length % 2 === 1 ? ns[m]! : (ns[m - 1]! + ns[m]!) / 2;
  };

  let best = layers.map((l) => [...l]);
  let bestCount = crossings(layers, sides, V);

  for (let pass = 0; pass < ORDER_PASSES && bestCount > 0; pass++) {
    const forward = pass % 2 === 0;
    const range = forward
      ? [...layers.keys()].slice(1)
      : [...layers.keys()].slice(0, -1).reverse();
    for (const r of range) {
      const side = forward ? sides.up : sides.dn;
      const keyed = layers[r]!.map((id) => ({ id, m: median(id, side), o: V.get(id)!.order }));
      // A node with nothing on the reference side has no opinion and stays put.
      keyed.sort((a, b) => (a.m < 0 ? a.o : a.m) - (b.m < 0 ? b.o : b.m) || a.o - b.o);
      layers[r] = keyed.map((k) => k.id);
      reindex(layers[r]!, V);
    }
    transpose(layers, sides, V);
    const count = crossings(layers, sides, V);
    if (count < bestCount) {
      bestCount = count;
      best = layers.map((l) => [...l]);
    }
  }
  layers.forEach((_, i) => {
    layers[i] = best[i]!;
    reindex(layers[i]!, V);
  });
}

function transpose(layers: string[][], sides: Sides, V: Map<string, Vertex>): void {
  for (let guard = 0; guard < 4; guard++) {
    let improved = false;
    for (let r = 0; r + 1 < layers.length; r++) {
      const layer = layers[r]!;
      for (let i = 0; i + 1 < layer.length; i++) {
        const before = crossingsBetween(layers, r, sides, V);
        swap(layer, i, V);
        if (crossingsBetween(layers, r, sides, V) < before) improved = true;
        else swap(layer, i, V);
      }
    }
    if (!improved) break;
  }
}

function swap(layer: string[], i: number, V: Map<string, Vertex>): void {
  const a = layer[i]!;
  layer[i] = layer[i + 1]!;
  layer[i + 1] = a;
  V.get(layer[i]!)!.order = i;
  V.get(layer[i + 1]!)!.order = i + 1;
}

/** Crossings between layer `r` and `r + 1`, by direct comparison of pairs. */
function crossingsBetween(
  layers: string[][],
  r: number,
  sides: Sides,
  V: Map<string, Vertex>,
): number {
  const pairs: Array<[number, number]> = [];
  for (const id of layers[r] ?? []) {
    for (const to of sides.dn.get(id) ?? []) {
      const t = V.get(to.id);
      if (t && t.rank === r + 1) pairs.push([V.get(id)!.order, t.order]);
    }
  }
  let n = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a1, b1] = pairs[i]!;
      const [a2, b2] = pairs[j]!;
      if ((a1 - a2) * (b1 - b2) < 0) n++;
    }
  }
  return n;
}

const crossings = (layers: string[][], sides: Sides, V: Map<string, Vertex>): number => {
  let n = 0;
  for (let r = 0; r + 1 < layers.length; r++) n += crossingsBetween(layers, r, sides, V);
  return n;
};

/**
 * Push whoever has to leave through a side border out to that side of its layer.
 *
 * Pinning a door to the border is not enough on its own: the isotonic solve may
 * not reorder a layer, so a member ordered left of its neighbours stays left
 * however loudly its door calls from the right, and the connector goes the long
 * way round. This is the ordering half of the same statement — a node that has to
 * reach out to the right belongs on the right of everything that does not.
 *
 * Stable, so nodes facing the same way keep whatever order minimised crossings.
 */
function applyDoorOrder(layers: string[][], V: Map<string, Vertex>): void {
  const key = (id: string): number => {
    const v = V.get(id)!;
    // A door sits outside its own member, which sits outside everyone else.
    if (v.door) return v.door.side * 2;
    return Math.sign(v.facing ?? 0);
  };
  layers.forEach((layer, r) => {
    if (layer.every((id) => key(id) === 0)) return;
    const sorted = layer
      .map((id, i) => ({ id, k: key(id), i }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .map((o) => o.id);
    layers[r] = sorted;
    reindex(sorted, V);
  });
}

/**
 * The order the author asked for, applied after the heuristic so it wins.
 *
 * `rightOf` means to the right, not somewhere nearby: whatever the crossing
 * count says, a pair the author ordered comes out in that order.
 */
function applyOrderHints(
  layers: string[][],
  same: Array<[string, string]>,
  V: Map<string, Vertex>,
): void {
  if (same.length === 0) return;
  for (const layer of layers) {
    const idx = new Map(layer.map((id, i) => [id, i]));
    for (let guard = 0; guard < layer.length; guard++) {
      let moved = false;
      for (const [a, b] of same) {
        const ia = idx.get(a);
        const ib = idx.get(b);
        if (ia === undefined || ib === undefined || ia < ib) continue;
        layer[ia] = b;
        layer[ib] = a;
        idx.set(a, ib);
        idx.set(b, ia);
        moved = true;
      }
      if (!moved) break;
    }
    reindex(layer, V);
  }
}

/**
 * Coordinates across the flow: as close to the neighbours' median as the order
 * and the minimum gap allow.
 *
 * That is exactly the nearest non-decreasing sequence, and it has an exact
 * answer, so it gets one — see {@link settleLayer}. Pushing nodes apart by
 * priority, which is the usual shortcut, can only ever add space, and the
 * drawing grows with every sweep: on the diagram this work started from, the
 * exact version is 40% smaller with fewer crossings.
 */
function assignAcross(
  layers: string[][],
  sides: Sides,
  V: Map<string, Vertex>,
  gap: number,
): void {
  for (const layer of layers) {
    const offset = layerOffsets(layer, V, gap);
    layer.forEach((id, i) => (V.get(id)!.pos = offset[i]!));
  }
  const centre = (id: string): number => {
    const v = V.get(id)!;
    return v.pos + v.across / 2;
  };

  for (let pass = 0; pass < COORD_PASSES; pass++) {
    // Early sweeps look one way, so layers get a chance to line up under each
    // other; the last few look both, so the answer does not depend on which
    // direction happened to run last.
    const both = pass >= COORD_PASSES - BALANCED_PASSES;
    const forward = pass % 2 === 0;
    const range = forward
      ? [...layers.keys()].slice(1)
      : [...layers.keys()].slice(0, -1).reverse();
    for (const r of range) {
      const layer = layers[r]!;
      const want: number[] = [];
      const weight: number[] = [];
      for (const id of layer) {
        const v = V.get(id)!;
        const ns: Link[] = both
          ? [...sides.up.get(id)!, ...sides.dn.get(id)!]
          : (forward ? sides.up : sides.dn).get(id)!;
        if (ns.length === 0) {
          // Nothing points at this node, but the author said what it sits
          // under, and `below` means under — not under and to the left. The
          // anchor is the only thing in the drawing that says where across,
          // so it gets to. Connections still decide wherever there are any:
          // this branch is reached only when there are none to ask.
          const anchor = v.anchorAlong;
          if (anchor !== undefined && V.has(anchor)) {
            want.push(centre(anchor));
            weight.push(1);
            continue;
          }
          want.push(centre(id));
          weight.push(IDLE_WEIGHT);
          continue;
        }
        // What each connection asks for: this node moved until its own door
        // lines up with the door at the other end. Read as a centre, which is
        // what settleLayer takes.
        const ms = ns
          .map((l) => V.get(l.id)!.pos + l.theirAt - l.myAt + v.across / 2)
          .sort((a, b) => a - b);
        const m = ms.length >> 1;
        want.push(ms.length % 2 === 1 ? ms[m]! : (ms[m - 1]! + ms[m]!) / 2);
        weight.push(v.stand ? LANE_WEIGHT : Math.max(1, ns.length));
      }
      settleLayer(layer, V, want, weight, gap);
    }
  }

  const min = Math.min(...[...V.values()].map((v) => v.pos));
  for (const v of V.values()) v.pos -= min;
}

/**
 * Place one layer as near its targets as the order and the gap permit.
 *
 * Substituting `a_i = x_i − Σ_{k<i}(size_k + gap)` turns "no two neighbours
 * closer than the gap" into "the sequence does not decrease", which makes this
 * an isotonic regression — solved exactly in one pass by pool-adjacent-
 * violators: while the last block sits left of the one before it, the two merge
 * into a block at their weighted mean. The result is the least-squares optimum,
 * so alignment is bought with the least spreading that can pay for it.
 */
function settleLayer(
  layer: string[],
  V: Map<string, Vertex>,
  want: number[],
  weight: number[],
  gap: number,
): void {
  const n = layer.length;
  if (n === 0) return;
  const offset = layerOffsets(layer, V, gap);

  const pos: number[] = [];
  const w: number[] = [];
  const size: number[] = [];
  for (let i = 0; i < n; i++) {
    pos.push(want[i]! - V.get(layer[i]!)!.across / 2 - offset[i]!);
    w.push(weight[i]!);
    size.push(1);
    while (pos.length > 1 && pos[pos.length - 2]! > pos[pos.length - 1]!) {
      const p2 = pos.pop()!;
      const w2 = w.pop()!;
      const s2 = size.pop()!;
      const p1 = pos.pop()!;
      const w1 = w.pop()!;
      const s1 = size.pop()!;
      const total = w1 + w2;
      pos.push(total > 0 ? (p1 * w1 + p2 * w2) / total : (p1 + p2) / 2);
      w.push(total);
      size.push(s1 + s2);
    }
  }

  // The lattice is applied to each block, not to each node: within a block the
  // offsets are exact sums of measured sizes and the author's gaps, so snapping
  // the block keeps every one of those distances intact and still lands the
  // whole run on the grid. Snapping node by node would round the gaps instead.
  let k = 0;
  for (let b = 0; b < pos.length; b++) {
    const at = snapHalf(pos[b]!);
    for (let j = 0; j < size[b]!; j++, k++) V.get(layer[k]!)!.pos = at + offset[k]!;
  }
}
