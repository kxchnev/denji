/**
 * Playground diagrams, kept on the device.
 *
 * The docs are a static export with no server, so `localStorage` is the whole
 * backend. Everything lives under one key rather than a key per diagram: a save
 * is then a single atomic write, listing needs no key enumeration, and rewriting
 * a few kilobytes of text on every autosave tick costs nothing at this scale.
 *
 * The store is exposed as an external store (`subscribe` + `getSnapshot`) so the
 * page can read it through `useSyncExternalStore`. That keeps the prerendered
 * markup free of any storage access — it renders `getServerSnapshot()`, an empty
 * list — and it picks up writes from other tabs through the `storage` event for
 * free.
 */

const KEY = "power.playground.diagrams.v1";
const VERSION = 1;

export interface SavedDiagram {
  id: string;
  name: string;
  /** The `.pwr` source. */
  dsl: string;
  createdAt: number;
  updatedAt: number;
}

/** Stable identity for the server/hydration render — a fresh `[]` each call would
 *  make `useSyncExternalStore` loop. */
const EMPTY: readonly SavedDiagram[] = Object.freeze([]);

const listeners = new Set<() => void>();
let cache: readonly SavedDiagram[] | null = null;

function isDiagram(v: unknown): v is SavedDiagram {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return typeof d.id === "string" && typeof d.name === "string" && typeof d.dsl === "string";
}

/** Never throws: a corrupt or unreadable store degrades to "no diagrams" rather
 *  than taking the page down with it. */
function read(): SavedDiagram[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = (parsed as { diagrams?: unknown } | null)?.diagrams;
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    return list.filter(isDiagram).map((d) => ({
      id: d.id,
      name: d.name,
      dsl: d.dsl,
      createdAt: typeof d.createdAt === "number" ? d.createdAt : now,
      updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : now,
    }));
  } catch {
    return [];
  }
}

function write(list: SavedDiagram[]): void {
  cache = null;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ version: VERSION, diagrams: list }));
  } catch {
    // Quota exhausted, or Safari private mode. Nothing useful to do — the session
    // keeps working, it just will not survive a reload.
  }
  for (const l of listeners) l();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Another tab writing the same key invalidates our snapshot.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    cache = null;
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Most-recently-updated first. Sorting by name instead would make a diagram jump
 *  around the list while it is being renamed. */
export function getSnapshot(): readonly SavedDiagram[] {
  cache ??= read().sort((a, b) => b.updatedAt - a.updatedAt);
  return cache;
}

export function getServerSnapshot(): readonly SavedDiagram[] {
  return EMPTY;
}

export function get(id: string): SavedDiagram | undefined {
  return getSnapshot().find((d) => d.id === id);
}

/** Upsert by id, stamping `updatedAt`. */
export function save(d: Omit<SavedDiagram, "createdAt" | "updatedAt">): SavedDiagram {
  const now = Date.now();
  const list = [...getSnapshot()];
  const i = list.findIndex((x) => x.id === d.id);
  const saved: SavedDiagram = {
    ...d,
    createdAt: i === -1 ? now : list[i]!.createdAt,
    updatedAt: now,
  };
  if (i === -1) list.push(saved);
  else list[i] = saved;
  write(list);
  return saved;
}

export function remove(id: string): void {
  write(getSnapshot().filter((d) => d.id !== id));
}

export function duplicate(id: string): SavedDiagram | null {
  const src = get(id);
  if (!src) return null;
  return save({
    id: newId(),
    name: uniqueName(`${src.name} copy`, getSnapshot().map((d) => d.name)),
    dsl: src.dsl,
  });
}

export function newId(): string {
  const c = globalThis.crypto;
  // `randomUUID` only exists in a secure context, and this export is meant to be
  // hosted anywhere — over plain http on a LAN address it is undefined.
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** `Untitled`, then `Untitled 2`, `Untitled 3`, … */
export function uniqueName(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}
