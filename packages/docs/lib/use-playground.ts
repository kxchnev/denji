"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  duplicate,
  get,
  getServerSnapshot,
  getSnapshot,
  getTrashSnapshot,
  newId,
  purge,
  remove,
  restore,
  save,
  subscribe,
  uniqueName,
  type SavedDiagram,
} from "@/lib/playground-store";

/** How long typing has to settle before the diagram is written to storage. */
const AUTOSAVE_MS = 600;

export interface Session {
  id: string;
  name: string;
  dsl: string;
}

const DEFAULT_NAME = "Untitled";
/** Matches the names `blank` hands out, i.e. a name the user never chose. */
const isDefaultName = (name: string) => /^Untitled( \d+)?$/.test(name);

const readHash = () => window.location.hash.slice(1);
/** `replaceState` rather than assigning `location.hash`: it fires no `hashchange`,
 *  so our own navigation never loops back through the listener. A bare `"#id"` is
 *  resolved against the current path, which keeps `trailingSlash` intact. */
const setHash = (id: string) => window.history.replaceState(null, "", `#${id}`);

/** Deliberately not `get`, which also sees the trash: a link to a deleted diagram
 *  should land on a new diagram rather than quietly resurrect it. */
const live = (id: string): SavedDiagram | undefined =>
  getSnapshot().find((d) => d.id === id);

/**
 * A diagram to start writing in, saved and listed straight away.
 *
 * An untouched empty one is reused rather than stacked on, so pressing New twice
 * does not leave a column of identical "Untitled" rows. The list is newest-first,
 * so this picks the most recent blank.
 */
function blank(): SavedDiagram {
  const existing = getSnapshot().find((d) => d.dsl.trim() === "");
  if (existing) return existing;
  const names = getSnapshot().map((d) => d.name);
  return save({ id: newId(), name: uniqueName(DEFAULT_NAME, names), dsl: "" });
}

/** What to open when nothing specific was asked for: pick up where the last
 *  session left off, or start a first diagram. */
const firstOrBlank = (): SavedDiagram => getSnapshot()[0] ?? blank();

const open = (d: SavedDiagram): Session => ({ id: d.id, name: d.name, dsl: d.dsl });

/**
 * Owns the diagram being edited and keeps it in sync with `localStorage`.
 *
 * `session` is `null` until the mount effect runs. That is deliberate: the page
 * is prerendered at build time, so neither `localStorage` nor `location.hash` may
 * be touched during a render pass without breaking hydration.
 */
export function usePlayground() {
  const diagrams = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const trash = useSyncExternalStore(subscribe, getTrashSnapshot, getServerSnapshot);
  const [session, setSession] = useState<Session | null>(null);

  // Event handlers and timers need the current session without being rebuilt on
  // every keystroke. Written in an effect, not during render: this value decides
  // what gets persisted, and a render React throws away must not reach storage.
  const latest = useRef<Session | null>(null);
  useEffect(() => {
    latest.current = session;
  }, [session]);

  const timer = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /** Write now, dropping any pending debounce. */
  const flush = useCallback(() => {
    cancel();
    const s = latest.current;
    if (!s) return;
    const stored = get(s.id);
    // Nothing changed — skip, so that merely opening a diagram does not bump its
    // `updatedAt` and reshuffle the list.
    if (stored && stored.name === s.name && stored.dsl === s.dsl) return;
    save({ id: s.id, name: s.name, dsl: s.dsl });
  }, [cancel]);

  const start = useCallback((d: SavedDiagram) => {
    setSession(open(d));
    setHash(d.id);
  }, []);

  // Resolve `#<id>` once, after hydration. An id that no longer exists (deleted,
  // or from someone else's browser) falls back to the newest diagram rather than
  // to an error.
  useEffect(() => {
    const id = readHash();
    const found = id ? live(id) : undefined;
    start(found ?? firstOrBlank());
  }, [start]);

  // Autosave.
  useEffect(() => {
    if (!session) return;
    timer.current = window.setTimeout(flush, AUTOSAVE_MS);
    return cancel;
  }, [session, flush, cancel]);

  // Closing the tab must not cost the last few hundred milliseconds of typing.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  // Someone editing the address bar, or following a `#<id>` link.
  useEffect(() => {
    const onHash = () => {
      const id = readHash();
      if (id === latest.current?.id) return;
      flush();
      const found = id ? live(id) : undefined;
      start(found ?? firstOrBlank());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [flush, start]);

  /** Takes an updater as well as a value: a drag has to edit whatever the document
   *  says *now*, not what it said when the handler was created. */
  const setDsl = useCallback((dsl: string | ((prev: string) => string)) => {
    setSession((s) => (s ? { ...s, dsl: typeof dsl === "function" ? dsl(s.dsl) : dsl } : s));
  }, []);

  const setName = useCallback((name: string) => {
    setSession((s) => (s ? { ...s, name } : s));
  }, []);

  /** Fill an empty diagram from a template, naming it after the template unless
   *  the user has already chosen a name. */
  const applyTemplate = useCallback((label: string, dsl: string) => {
    setSession((s) => {
      if (!s) return s;
      const name = isDefaultName(s.name)
        ? uniqueName(label, getSnapshot().map((d) => d.name))
        : s.name;
      return { ...s, name, dsl };
    });
  }, []);

  const select = useCallback(
    (id: string) => {
      if (latest.current?.id === id) return;
      flush();
      const found = live(id);
      if (found) start(found);
    },
    [flush, start],
  );

  const create = useCallback(() => {
    flush();
    start(blank());
  }, [flush, start]);

  /** Move on to whatever is left once the open diagram goes away. */
  const stepAway = useCallback(() => {
    start(firstOrBlank());
  }, [start]);

  /** Soft delete — the diagram moves to the trash, where it can be brought back
   *  for the next 30 days. */
  const destroy = useCallback(
    (id: string) => {
      const isCurrent = latest.current?.id === id;
      // A pending autosave would write the diagram straight back out of the
      // trash, so drop it rather than flushing it.
      if (isCurrent) cancel();
      else flush();
      remove(id);
      if (isCurrent) stepAway();
    },
    [cancel, flush, stepAway],
  );

  const undelete = useCallback((id: string) => {
    restore(id);
  }, []);

  /** Hard delete, ahead of the 30 days. */
  const destroyForever = useCallback(
    (id: string) => {
      const isCurrent = latest.current?.id === id;
      if (isCurrent) cancel();
      purge(id);
      if (isCurrent) stepAway();
    },
    [cancel, stepAway],
  );

  const copy = useCallback(
    (id: string) => {
      // Flush first so the copy picks up unsaved edits, not the last autosave.
      if (latest.current?.id === id) flush();
      const made = duplicate(id);
      if (made) start(made);
    },
    [flush, start],
  );

  return {
    diagrams,
    trash,
    session,
    setDsl,
    setName,
    applyTemplate,
    select,
    create,
    destroy,
    undelete,
    destroyForever,
    copy,
  };
}
