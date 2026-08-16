/**
 * Turning a link button into a browser tab.
 *
 * The parser already refused every scheme but three — but the parser runs in the
 * *webview*, and the message channel, not the bundle on the other side of it, is
 * the boundary the host has to defend. `env.openExternal` on a `command:` URI
 * runs that command, so "our own webview would never send one" is not a thing to
 * rest on.
 *
 * Kept free of `vscode` imports so it can be tested outside the editor.
 */
import { LINK_SCHEMES } from "@kxchnev/denji";

/** The URL to open, or null when it is not one this preview may open. */
export function safeLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null; // schemeless, relative, or not a URL at all
  }
  return LINK_SCHEMES.includes(url.protocol) ? url.href : null;
}
