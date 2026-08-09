/**
 * The two halves of the extension speak only through these. Kept in one file
 * imported by both bundles so a change to either end fails to compile rather
 * than failing silently at runtime.
 */

/** The palette a preview draws with. `auto` follows the editor's colour theme. */
export type PreviewTheme = "auto" | "light" | "dark";

export interface PreviewConfig {
  grid: boolean;
  theme: PreviewTheme;
}

/**
 * Where a dropped node belongs, said the way the document says it: next to a
 * sibling, on a side. Not a coordinate — the layout arranges the scope from its
 * connections, and a coordinate would take the node out of that for good.
 */
export interface Move {
  id: string;
  anchor: string;
  side: "rightOf" | "leftOf" | "above" | "below";
}

/** Host → webview. */
export type ToWebview =
  | { type: "source"; text: string }
  | { type: "config"; config: PreviewConfig };

/** Webview → host. */
export type FromWebview =
  /** A drag was dropped: write this relation into the document. */
  | { type: "move"; moves: Move[] }
  /** A node was clicked without being moved: put the cursor on its declaration. */
  | { type: "reveal"; id: string }
  /** A link button was pressed: open this URL outside the editor. */
  | { type: "open"; url: string }
  /** The webview is listening — the host may send the first source now. */
  | { type: "ready" };
