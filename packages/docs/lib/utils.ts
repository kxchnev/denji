import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { LINK_SCHEMES } from "@kxchnev/denji";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Turn a human title into something safe to hand to a download attribute. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Open what a link button points at.
 *
 * The scheme is re-checked even though the parser refused everything else: this
 * component is also handed documents out of localStorage, which an older core
 * may have written.
 *
 * A detached anchor rather than `window.open`: it takes a real `rel`, it is not
 * subject to the differences between engines in how they parse a feature
 * string, and inside a pointerup handler it counts as a user gesture, so no
 * popup blocker sees it.
 */
export function openLink(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  if (!LINK_SCHEMES.includes(url.protocol)) return;
  const a = document.createElement("a");
  a.href = url.href;
  // `noopener` kills window.opener, `noreferrer` drops the Referer too. A
  // mailto has no tab to open.
  if (url.protocol !== "mailto:") {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  a.click();
}
