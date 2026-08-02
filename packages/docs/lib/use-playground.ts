"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  duplicate,
  get,
  getServerSnapshot,
  getSnapshot,
  newId,
  remove,
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
  /**
   * Whether this diagram is in the list yet. A fresh draft starts out `false` so
   * that merely opening the playground does not litter the list with empty
   * "Untitled" entries; the first real content promotes it.
   */
  persisted: boolean;
}

const DEFAULT_NAME = "Untitled";
/** Matches the names `startDraft` hands out, i.e. a name the user never chose. */
const isDefaultName = (name: string) => /^Untitled( \d+)?$/.test(name);

const readHash = () => window.location.hash.slice(1);
/** `replaceState` rather than assigning `location.hash`: it fires no `hashchange`,
 *  so our own navigation never loops back through the listener. A bare `"#id"` is
 *  resolved against the current path, which keeps `trailingSlash` intact. */
const setHash = (id: string) => window.history.replaceState(null, "", `#${id}`);
const clearHash = () =>
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

function startDraft(): Session {
  const names = getSnapshot().map((d) => d.name);
  return { id: newId(), name: uniqueName(DEFAULT_NAME, names), dsl: "", persisted: false };
}

const open = (d: SavedDiagram): Session => ({
  id: d.id,
  name: d.name,
  dsl: d.dsl,
  persisted: true,
});

/**
 * Owns the diagram being edited and keeps it in sync with `localStorage`.
 *
 * `session` is `null` until the mount effect runs. That is deliberate: the page
 * is prerendered at build time, so neither `localStorage` nor `location.hash` may
 * be touched during a render pass without breaking hydration.
 *
 * The id is minted when the draft is created, not when it is first saved, because
 * the page keys `PwrEditor` and `Diagram` on it. An id that only appeared on the
 * first save would remount CodeMirror mid-keystroke.
 */
export function usePlayground() {
  const diagrams = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
    // An untouched draft stays out of the list until it has content. Emptying an
    // already-saved diagram does not remove it — deletion is always explicit.
    if (!s.persisted && s.dsl.trim() === "") return;
    const stored = get(s.id);
    // Nothing changed — skip, so that merely opening a diagram does not bump its
    // `updatedAt` and reshuffle the list.
    if (stored && stored.name === s.name && stored.dsl === s.dsl) return;
    save({ id: s.id, name: s.name, dsl: s.dsl });
    if (!s.persisted) {
      latest.current = { ...s, persisted: true };
      setSession((cur) => (cur && cur.id === s.id ? { ...cur, persisted: true } : cur));
      setHash(s.id);
    }
  }, [cancel]);

  // Resolve `#<id>` once, after hydration. An id that no longer exists (deleted,
  // or from someone else's browser) falls back to a fresh draft rather than an
  // error state.
  useEffect(() => {
    const id = readHash();
    const found = id ? get(id) : undefined;
    if (found) {
      setSession(open(found));
      return;
    }
    if (id) clearHash();
    setSession(startDraft());
  }, []);

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
      const found = id ? get(id) : undefined;
      if (found) {
        setSession(open(found));
        return;
      }
      if (id) clearHash();
      setSession(startDraft());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [flush]);

  const setDsl = useCallback((dsl: string) => {
    setSession((s) => (s ? { ...s, dsl } : s));
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
      const found = get(id);
      if (!found) return;
      setSession(open(found));
      setHash(id);
    },
    [flush],
  );

  const create = useCallback(() => {
    flush();
    setSession(startDraft());
    clearHash();
  }, [flush]);

  const destroy = useCallback(
    (id: string) => {
      const cur = latest.current;
      const isCurrent = cur?.id === id;
      // Flushing the diagram we are about to delete would resurrect it.
      if (isCurrent) cancel();
      else flush();
      remove(id);
      if (!isCurrent) return;
      const next = getSnapshot()[0];
      if (next) {
        setSession(open(next));
        setHash(next.id);
      } else {
        setSession(startDraft());
        clearHash();
      }
    },
    [cancel, flush],
  );

  const copy = useCallback(
    (id: string) => {
      // Flush first so the copy picks up unsaved edits, not the last autosave.
      if (latest.current?.id === id) flush();
      const made = duplicate(id);
      if (!made) return;
      setSession(open(made));
      setHash(made.id);
    },
    [flush],
  );

  return { diagrams, session, setDsl, setName, applyTemplate, select, create, destroy, copy };
}
