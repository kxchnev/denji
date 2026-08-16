/**
 * The URL behind an element's link button.
 *
 * Authored text that reaches the output as an `href`, so this is an allowlist of
 * what a link may be, never an escape pass — the same stance icon paths
 * (`model/icon.ts`) and style values (`model/style.ts`) take, and for the same
 * reason: a rendered diagram is inlined into a page, where the attribute is live.
 *
 * Three schemes, because a diagram has a reason to carry three things: a page, a
 * page on an internal host that still speaks plain http, and an address. The
 * list is an allowlist rather than a `javascript:`/`data:` denylist because a
 * denylist has to be right about every scheme a browser will ever add.
 */
export const LINK_SCHEMES: readonly string[] = ["http:", "https:", "mailto:"];

const SCHEME = /^(?:https?:\/\/|mailto:)/i;

/**
 * Characters that either end the attribute early or have no business unescaped
 * in a URL. A real one percent-encodes them; refusing them here keeps the
 * author's mistake on the line they made it instead of in the markup.
 */
const FORBIDDEN = /[\s"'<>\\^{|}]/;

export class LinkError extends Error {}

/** Check an authored link before it can reach the output. Returns it unchanged. */
export function validateLink(url: string): string {
  if (!SCHEME.test(url)) {
    throw new LinkError("a link must start with http://, https:// or mailto:");
  }
  if (FORBIDDEN.test(url)) {
    throw new LinkError("a link may not contain spaces, quotes or angle brackets");
  }
  // The argument is unquoted and ends at the first `)`, so a URL carrying one
  // would be cut in half and leave a stray `)` behind. Say so here rather than
  // let the scanner complain about the leftovers.
  if (url.includes(")")) {
    throw new LinkError("a link may not contain `)` — percent-encode it as %29");
  }
  // `https://` on its own is a typo, not a destination.
  if (url.replace(SCHEME, "") === "") {
    throw new LinkError("a link needs something after the scheme");
  }
  return url;
}
