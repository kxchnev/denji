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

const KEY = "denji.playground.diagrams.v1";
/** What the key was called before the product was named. Read once, so a rename
 *  does not quietly throw away the diagrams someone already saved. */
const LEGACY_KEY = "power.playground.diagrams.v1";
const VERSION = 1;

/** How long a deleted diagram stays recoverable before it is dropped for good. */
export const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SavedDiagram {
  id: string;
  name: string;
  /** The `.denji` source. */
  dsl: string;
  createdAt: number;
  updatedAt: number;
  /**
   * When the diagram was deleted. Deletion is soft: the entry stays put and
   * recoverable, and is only dropped once it has sat here for `TRASH_TTL_MS`.
   */
  deletedAt?: number;
}

/** Stable identity for the server/hydration render — a fresh `[]` each call would
 *  make `useSyncExternalStore` loop. */
const EMPTY: readonly SavedDiagram[] = Object.freeze([]);

const listeners = new Set<() => void>();
// Three views over the same data. They are cached separately because
// `useSyncExternalStore` compares snapshots by identity and would spin on a
// freshly built array.
let cacheAll: SavedDiagram[] | null = null;
let cacheLive: readonly SavedDiagram[] | null = null;
let cacheTrash: readonly SavedDiagram[] | null = null;

function invalidate(): void {
  cacheAll = null;
  cacheLive = null;
  cacheTrash = null;
}

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
    raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = (parsed as { diagrams?: unknown } | null)?.diagrams;
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    const cutoff = now - TRASH_TTL_MS;
    return list
      .filter(isDiagram)
      .map((d) => ({
        id: d.id,
        name: d.name,
        dsl: d.dsl,
        createdAt: typeof d.createdAt === "number" ? d.createdAt : now,
        updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : now,
        ...(typeof d.deletedAt === "number" ? { deletedAt: d.deletedAt } : {}),
      }))
      // The hard delete happens here, lazily: anything that has been in the
      // trash longer than the TTL never makes it into memory, and the next write
      // makes that permanent.
      .filter((d) => d.deletedAt === undefined || d.deletedAt > cutoff);
  } catch {
    return [];
  }
}

function write(list: SavedDiagram[]): void {
  invalidate();
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
    invalidate();
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Everything on disk, deleted included. Writes must go through this, or they
 *  would drop the trash on the floor. */
function all(): SavedDiagram[] {
  cacheAll ??= read();
  return cacheAll;
}

/** Most-recently-updated first. Sorting by name instead would make a diagram jump
 *  around the list while it is being renamed. */
export function getSnapshot(): readonly SavedDiagram[] {
  cacheLive ??= all()
    .filter((d) => d.deletedAt === undefined)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return cacheLive;
}

/** Deleted diagrams, most recently deleted first. */
export function getTrashSnapshot(): readonly SavedDiagram[] {
  cacheTrash ??= all()
    .filter((d) => d.deletedAt !== undefined)
    .sort((a, b) => b.deletedAt! - a.deletedAt!);
  return cacheTrash;
}

export function getServerSnapshot(): readonly SavedDiagram[] {
  return EMPTY;
}

/** Looks in the trash too, so a restore can find what it is restoring. */
export function get(id: string): SavedDiagram | undefined {
  return all().find((d) => d.id === id);
}

/** Upsert by id, stamping `updatedAt`. Saving a diagram takes it out of the
 *  trash — editing something is a clearer intent to keep it than any button. */
export function save(d: Omit<SavedDiagram, "createdAt" | "updatedAt" | "deletedAt">): SavedDiagram {
  const now = Date.now();
  const list = [...all()];
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

/** Soft delete: the diagram moves to the trash and stays recoverable for
 *  `TRASH_TTL_MS`. */
export function remove(id: string): void {
  const now = Date.now();
  write(all().map((d) => (d.id === id ? { ...d, deletedAt: now } : d)));
}

export function restore(id: string): void {
  write(
    all().map((d) => {
      if (d.id !== id) return d;
      const { deletedAt: _, ...rest } = d;
      return rest;
    }),
  );
}

/** Hard delete, ahead of the TTL. */
export function purge(id: string): void {
  write(all().filter((d) => d.id !== id));
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
