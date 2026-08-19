import { ICON_ALIASES, ICON_NAMES, ICON_TITLES } from "./icon.names.js";
import { registeredIcons } from "../resources.js";

export { ICON_ALIASES, ICON_NAMES, ICON_TITLES, ICONSET_VERSION } from "./icon.names.js";

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
 * then whatever artwork this installation registered; then the shorthands.
 *
 * The artwork is asked for through {@link registeredIcons} rather than imported,
 * because 4.9 MB of path data has no business inside a bundle that only checks a
 * document — and because the same registry is how a product hands over the marks
 * it fetched. A caller that registered nothing gets `undefined` and draws the
 * label without a mark, which is what a diagram looks like before its icons have
 * finished loading.
 */
export function resolveIcon(name: string, custom?: Record<string, Icon>): Icon | undefined {
  const key = name.toLowerCase();
  const bundled = registeredIcons();
  return custom?.[name] ?? custom?.[key] ?? bundled[key] ?? bundled[ICON_ALIASES[key] ?? ""];
}

/**
 * Whether a name resolves — asked by the parser and the builder, which validate
 * a diagram without ever drawing one.
 *
 * Deliberately answered from the **names**, never from {@link ICONS}: the paths
 * are 4.8 MB and the answer is a string lookup. That is what lets a bundler keep
 * the artwork out of anything that only checks a document — the VS Code
 * extension host runs exactly this path and would otherwise carry all of it.
 */
export function isKnownIcon(name: string, custom?: Record<string, Icon>): boolean {
  return canonicalIconName(name, custom) !== undefined;
}

/**
 * The name an icon is filed under, so `@icon(pg)` and `@icon(postgresql)` share
 * one CSS class and one colour variable instead of emitting the mark twice.
 */
export function canonicalIconName(name: string, custom?: Record<string, Icon>): string | undefined {
  const key = name.toLowerCase();
  if (custom?.[name]) return name;
  if (custom?.[key]) return key;
  if (ICON_TITLES[key]) return key;
  const alias = ICON_ALIASES[key];
  return alias && ICON_TITLES[alias] ? alias : undefined;
}

/** Punctuation and case are noise in a slug, so a difference in either is not a typo. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Every name that resolves, with its normalized form, built once. Thousands of
 * strings is nothing to hold; rebuilding the list per call was fine at sixty
 * names and is not at three and a half thousand.
 */
const POOL: ReadonlyArray<readonly [string, string]> = [
  ...ICON_NAMES,
  ...Object.keys(ICON_ALIASES),
].map((name) => [name, norm(name)] as const);

/** Levenshtein, abandoned as soon as it cannot come in under `max`. */
function distance(a: string, b: string, max: number): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * A name close enough to be worth suggesting after a typo, or nothing.
 *
 * Ranked, and that is the whole point. With sixty names the first containment
 * hit was as good as any; with 3,450 the set holds slugs one and two characters
 * long, and "did you mean `e`?" for `kubernets` is worse than silence — it is
 * exactly what sends an author off to paste raw path data.
 *
 * Nothing is offered across a length gap either: `aws` must come back empty,
 * because Amazon asked to be removed and no mark here is the one they wanted.
 */
export function suggestIcon(name: string, custom?: Record<string, Icon>): string | undefined {
  const key = norm(name);
  if (key.length < 2) return undefined;
  const pool = custom
    ? [...POOL, ...Object.keys(custom).map((n) => [n, norm(n)] as const)]
    : POOL;

  let best: string | undefined;
  let score = 0;
  for (const [raw, n] of pool) {
    let s = 0;
    if (n === key) s = 100;
    else if (n.startsWith(key)) s = 80 - Math.min(19, n.length - key.length);
    else if (key.startsWith(n) && n.length >= 4) s = 60 - Math.min(19, key.length - n.length);
    else if (key.length >= 4 && n.includes(key)) s = 40 - Math.min(19, n.length - key.length);
    if (s > score) {
      score = s;
      best = raw;
    }
  }
  if (score > 0) return best;

  // Only then a real misspelling: one edit for a short name, two for a long one,
  // and never between names of very different length.
  const max = key.length >= 6 ? 2 : 1;
  let closest = max + 1;
  let typo: string | undefined;
  for (const [raw, n] of pool) {
    if (key.length < 3 || Math.abs(n.length - key.length) > 1) continue;
    const d = distance(key, n, max);
    if (d < closest) {
      closest = d;
      typo = raw;
      if (d === 1) break;
    }
  }
  return closest <= max ? typo : undefined;
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
