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

/** A node's position in the coordinate space of its own scope — i.e. an `@at`. */
export interface Move {
  id: string;
  at: { x: number; y: number };
}

/** Host → webview. */
export type ToWebview =
  | { type: "source"; text: string }
  | { type: "config"; config: PreviewConfig };

/** Webview → host. */
export type FromWebview =
  /** A drag was dropped: write these coordinates into the document. */
  | { type: "move"; moves: Move[] }
  /** A node was clicked without being moved: put the cursor on its declaration. */
  | { type: "reveal"; id: string }
  /** The webview is listening — the host may send the first source now. */
  | { type: "ready" };
