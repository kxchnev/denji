import { ICON_ALIASES, ICONS } from "./icon.data.js";

export { ICONS, ICON_ALIASES };

/**
 * A brand mark, stored the way Simple Icons stores one: the contents of a
 * single `d` attribute plus one official colour. Not an `.svg` file — the
 * renderer inlines the path, which is the only form that survives both the
 * canvas rasterizer in a browser and librsvg in the CLI.
 */
export interface Icon {
  /** Contents of the `d` attribute. May contain several subpaths. */
  path: string;
  /** The brand's own colour. */
  color: string;
  /** Stand-in where `color` would vanish against a dark surface. */
  darkColor?: string;
  /** Defaults to Simple Icons' `0 0 24 24`. */
  viewBox?: string;
  title?: string;
}

/** Every bundled name, aliases excluded. Sorted, for the docs gallery. */
export const ICON_NAMES: readonly string[] = Object.keys(ICONS).sort();

/**
 * Path data reaches the SVG as markup, where escaping does not help — so this
 * is an allowlist of what a path may contain, never an escape pass. Same
 * reasoning as the style-value grammar in `model/style.ts`.
 */
const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE,.+\-\s]+$/;
const VIEW_BOX = /^-?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+$/;

export class IconError extends Error {}

/** Check a hand-written icon before it can reach the output. */
export function validateIcon(icon: Icon): Icon {
  if (icon.path.trim() === "") throw new IconError("icon path is empty");
  if (!PATH.test(icon.path)) {
    throw new IconError("icon path may only contain SVG path commands and numbers");
  }
  if (icon.viewBox !== undefined && !VIEW_BOX.test(icon.viewBox)) {
    throw new IconError("icon viewBox expects four numbers");
  }
  return icon;
}

/**
 * Document icons first, so `icon postgresql { … }` can replace a bundled mark;
 * then the bundled set; then the shorthands.
 */
export function resolveIcon(name: string, custom?: Record<string, Icon>): Icon | undefined {
  const key = name.toLowerCase();
  return custom?.[name] ?? custom?.[key] ?? ICONS[key] ?? ICONS[ICON_ALIASES[key] ?? ""];
}

export function isKnownIcon(name: string, custom?: Record<string, Icon>): boolean {
  return resolveIcon(name, custom) !== undefined;
}

/**
 * The name an icon is filed under, so `@icon(pg)` and `@icon(postgresql)` share
 * one CSS class and one colour variable instead of emitting the mark twice.
 */
export function canonicalIconName(name: string, custom?: Record<string, Icon>): string | undefined {
  const key = name.toLowerCase();
  if (custom?.[name]) return name;
  if (custom?.[key]) return key;
  if (ICONS[key]) return key;
  const alias = ICON_ALIASES[key];
  return alias && ICONS[alias] ? alias : undefined;
}

/** Names close enough to be worth suggesting after a typo. */
export function suggestIcon(name: string, custom?: Record<string, Icon>): string | undefined {
  const key = name.toLowerCase();
  const pool = [...Object.keys(ICONS), ...Object.keys(ICON_ALIASES), ...Object.keys(custom ?? {})];
  return (
    pool.find((n) => n.startsWith(key) || key.startsWith(n)) ??
    pool.find((n) => n.includes(key) || key.includes(n))
  );
}

/** The shape `simple-icons` exports, so callers need not import its types. */
export interface SimpleIconLike {
  path: string;
  hex: string;
  title?: string;
}

/**
 * Adapt an entry from the `simple-icons` package, for the ~3400 marks not
 * bundled here:
 *
 *   import { siVercel } from "simple-icons";
 *   architecture().defineIcon("vercel", fromSimpleIcon(siVercel))
 */
export function fromSimpleIcon(icon: SimpleIconLike): Icon {
  return validateIcon({
    path: icon.path,
    color: `#${icon.hex.replace(/^#/, "").toLowerCase()}`,
    title: icon.title,
  });
}
