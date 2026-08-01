"use client";

import { useMemo, useState } from "react";
import { ICONS, ICON_ALIASES, ICON_NAMES } from "power";

/** Shorthands grouped by what they resolve to, so each card can list its own. */
const ALIASES = Object.entries(ICON_ALIASES).reduce<Record<string, string[]>>((acc, [from, to]) => {
  (acc[to] ??= []).push(from);
  return acc;
}, {});

/**
 * One stylesheet for the whole gallery rather than an inline `fill` per card:
 * the dark variants have to switch with the page, and a plain attribute cannot.
 */
const SWATCH_CSS = ICON_NAMES.map((name) => {
  const icon = ICONS[name]!;
  const dark = icon.darkColor ?? icon.color;
  return `.pwr-g-${name}{fill:${icon.color}}.dark .pwr-g-${name}{fill:${dark}}`;
}).join("");

export function IconGallery() {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return ICON_NAMES;
    return ICON_NAMES.filter(
      (name) =>
        name.includes(q) ||
        ICONS[name]?.title?.toLowerCase().includes(q) ||
        ALIASES[name]?.some((a) => a.includes(q)),
    );
  }, [query]);

  return (
    <div className="my-6">
      <style>{SWATCH_CSS}</style>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Filter ${ICON_NAMES.length} icons…`}
        aria-label="Filter icons"
        className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
      />
      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing matches — but any other Simple Icons slug still works, see below.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.map((name) => {
            const icon = ICONS[name]!;
            return (
              <li key={name} className="flex items-center gap-3 rounded-md border px-3 py-2">
                <svg
                  viewBox={icon.viewBox ?? "0 0 24 24"}
                  className={`h-5 w-5 shrink-0 pwr-g-${name}`}
                  aria-hidden
                >
                  <path d={icon.path} />
                </svg>
                <div className="min-w-0">
                  <code className="block truncate text-xs">{name}</code>
                  {ALIASES[name] && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {ALIASES[name]!.join(", ")}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
