"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ICONS, ICON_ALIASES, ICON_NAMES, ICONSET_VERSION, POPULAR_ICONS } from "@kxchnev/denji";

/**
 * How many marks a search may show at once. The whole set is three and a half
 * thousand: rendering it would put ten megabytes of inline `<path>` into the
 * prerendered page, and nobody scrolls a wall of logos anyway — they search.
 */
const LIMIT = 120;

/** Shorthands grouped by what they resolve to, so each card can list its own. */
const ALIASES = Object.entries(ICON_ALIASES).reduce<Record<string, string[]>>((acc, [from, to]) => {
  (acc[to] ??= []).push(from);
  return acc;
}, {});

export function IconGallery() {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Before anyone types: the marks a diagram actually reaches for. The full
    // set sorted alphabetically opens on `1001tracklists`, which reads as a bug.
    if (q === "") return POPULAR_ICONS;
    return ICON_NAMES.filter(
      (name) =>
        name.includes(q) ||
        ICONS[name]?.title?.toLowerCase().includes(q) ||
        ALIASES[name]?.some((a) => a.includes(q)),
    );
  }, [query]);

  const shown = useMemo(() => matches.slice(0, LIMIT), [matches]);



  return (
    <div className="my-6">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${ICON_NAMES.length} icons…`}
        aria-label="Filter icons"
        className="h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Every mark in Simple Icons {ICONSET_VERSION} is bundled — {ICON_NAMES.length} of them.
        {query.trim() === ""
          ? " These are the ones a diagram usually reaches for; search for any other."
          : matches.length > shown.length
            ? ` Showing ${shown.length} of ${matches.length} matches; keep typing to narrow.`
            : ` ${matches.length} match${matches.length === 1 ? "" : "es"}.`}
      </p>
      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing matches. AWS, Azure and Oracle asked Simple Icons to drop them, so those
          are not here either — declare an <code>icon</code> block for a mark the set does
          not carry.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.map((name) => {
            const icon = ICONS[name]!;
            return (
              <li key={name} className="flex items-center gap-3 rounded-md border px-3 py-2">
                <svg
                  viewBox={icon.viewBox ?? "0 0 24 24"}
                  // Two custom properties and one static rule, rather than a
                  // stylesheet built per keystroke: the dark variant has to
                  // switch with the page, which a plain `fill` attribute cannot.
                  style={
                    {
                      "--denji-swatch": icon.color,
                      "--denji-swatch-dark": icon.darkColor ?? icon.color,
                    } as CSSProperties
                  }
                  className="denji-swatch h-5 w-5 shrink-0"
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
