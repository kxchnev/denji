/**
 * A preview is a webview bound to one document for its whole life.
 *
 * It does not follow the active editor the way some previews do. Dragging a node
 * is a gesture that lasts several seconds and edits a file; having the target
 * change underneath it because a different tab took focus would be a very
 * expensive kind of surprise.
 *
 * Everything here is keyed on the document's **uri**, never on a `TextDocument`
 * object. Closing and reopening a file hands out a new object for the same uri,
 * and a preview that compared identities would quietly stop updating.
 */
import * as vscode from "vscode";
import { applyMoves, revealNode } from "./edit.js";
import { exportDiagram, notePreviewFocus } from "./export.js";
import { safeLink } from "./open.js";
import type { FromWebview, PreviewConfig, PreviewTheme, ToWebview } from "./protocol.js";

/** Editors fire a change per keystroke; one render per burst is enough. The
 *  number is `watch.ts`'s, which has had the same job for longer. */
const DEBOUNCE_MS = 60;

export const VIEW_TYPE = "denji.preview";

function readConfig(uri: vscode.Uri): PreviewConfig {
  const c = vscode.workspace.getConfiguration("denji.preview", uri);
  return {
    grid: c.get<boolean>("grid", true),
    theme: c.get<PreviewTheme>("theme", "auto"),
  };
}

export class PreviewManager {
  /** One preview per document. A second request reveals the one already open. */
  private readonly panels = new Map<string, Preview>();

  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires whenever a preview opens or closes, for anything offering to open one. */
  readonly onDidChange = this.changed.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(
      this.changed,
      vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
        deserializeWebviewPanel: async (panel, state: unknown) => {
          // The only thing worth restoring is which document this was: the
          // source itself comes back from the workspace, not from the webview.
          const uri = typeof state === "string" ? vscode.Uri.parse(state) : null;
          if (!uri) {
            panel.dispose();
            return;
          }
          try {
            await vscode.workspace.openTextDocument(uri);
            this.adopt(uri, panel);
          } catch {
            panel.dispose(); // the file is gone
          }
        },
      }),
    );
  }

  /** Whether this document already has a preview open somewhere. */
  isOpen(uri: vscode.Uri): boolean {
    return this.panels.has(uri.toString());
  }

  /** Show a preview of `document`, revealing the one already open on it. */
  show(document: vscode.TextDocument, column: vscode.ViewColumn): void {
    const existing = this.panels.get(document.uri.toString());
    if (existing) {
      existing.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      `Preview ${basename(document.uri)}`,
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true, // restated in `adopt`, along with the resource roots
        // Only settable at creation, and worth it: losing the pan and zoom every
        // time the tab goes to the background is exactly the annoyance this
        // preview exists to replace.
        retainContextWhenHidden: true,
      },
    );
    this.adopt(document.uri, panel);
  }

  private adopt(uri: vscode.Uri, panel: vscode.WebviewPanel): void {
    // A restored panel comes back with whatever options the last session had,
    // so one place decides what any preview may reach.
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")],
    };
    const key = uri.toString();
    this.panels.set(
      key,
      new Preview(this.context, uri, panel, () => {
        this.panels.delete(key);
        this.changed.fire();
      }),
    );
    this.changed.fire();
  }
}

class Preview {
  private readonly disposables: vscode.Disposable[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly key: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly uri: vscode.Uri,
    private readonly panel: vscode.WebviewPanel,
    onDispose: () => void,
  ) {
    this.key = uri.toString();
    panel.webview.html = this.html(context.extensionUri);

    // Which document an export means when the preview itself is the active tab:
    // there is no active editor then, and "the picture I am looking at" is the
    // only reading of the command that makes sense.
    if (panel.active) notePreviewFocus(uri);

    this.disposables.push(
      panel.onDidChangeViewState(() => {
        if (panel.active) notePreviewFocus(uri);
      }),
      panel.webview.onDidReceiveMessage((m: FromWebview) => this.onMessage(m)),

      // Reading the open document rather than the file on disk is what makes the
      // preview follow an unsaved buffer, the way the Markdown one does.
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== this.key || e.contentChanges.length === 0) return;
        this.postSourceDebounced();
      }),

      // A closed editor does not close the preview: someone may well close the
      // file to make room for the picture. The document stops changing, which is
      // the whole of what closing it means here.

      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("denji.preview", this.uri)) this.postConfig();
      }),
    );

    panel.onDidDispose(() => {
      notePreviewFocus(undefined);
      if (this.timer) clearTimeout(this.timer);
      for (const d of this.disposables) d.dispose();
      onDispose();
    });
  }

  reveal(column: vscode.ViewColumn): void {
    this.panel.reveal(column, true);
  }

  /** The open document for this uri, whichever object the editor is using now. */
  private document(): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find((d) => d.uri.toString() === this.key);
  }

  private text(): string {
    return this.document()?.getText() ?? "";
  }

  private post(message: ToWebview): void {
    void this.panel.webview.postMessage(message);
  }

  private postSourceDebounced(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.post({ type: "source", text: this.text() });
    }, DEBOUNCE_MS);
  }

  private postConfig(): void {
    this.post({ type: "config", config: readConfig(this.uri) });
  }

  private onMessage(m: FromWebview): void {
    switch (m.type) {
      case "ready":
        // The webview asks rather than the host guessing when its script has
        // run — a restored panel starts listening whenever it feels like it.
        this.postConfig();
        this.post({ type: "source", text: this.text() });
        return;
      case "move": {
        const doc = this.document();
        if (!doc) return;
        // Always answer, even when the edit changed nothing: the webview is
        // holding the drag's own render up until an authoritative source lands,
        // and a drop onto the position a node already had would otherwise leave
        // it holding that render forever.
        void applyMoves(doc, m.moves).then(() => {
          this.post({ type: "source", text: this.text() });
        });
        return;
      }
      case "reveal": {
        const doc = this.document();
        if (doc) revealNode(doc, m.id);
        return;
      }
      case "export":
        // The button in the preview and the command in the menu are the same
        // road from here on — one dialog, one writer, one set of assets.
        void exportDiagram(this.context, m.format, this.uri);
        return;
      case "open": {
        const url = safeLink(m.url);
        // Silently, when it fails: a refused URL is a bug or an attack, and
        // neither is news the reader of a diagram can act on. VS Code puts its
        // own trusted-domain prompt in front of the browser, so there is no
        // second confirmation to add here.
        if (url) void vscode.env.openExternal(vscode.Uri.parse(url));
        return;
      }
    }
  }

  private html(extensionUri: vscode.Uri): string {
    const { webview } = this.panel;
    const asset = (name: string): vscode.Uri =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", name));
    const nonce = randomNonce();
    // `style-src 'unsafe-inline'` is not avoidable: a rendered diagram carries
    // its own <style> block, which is how the palette and the per-diagram scope
    // class travel with the SVG. Nothing is ever fetched — icons are inlined as
    // paths — so no img-src or connect-src is needed at all.
    // `font-src` is the one addition, and it is narrow: the typeface travels as a
    // file next to the bundle, from this extension's own directory — `cspSource`
    // is exactly the `vscode-resource` origin of `localResourceRoots`, and nothing
    // else is reachable. The marks need no permission at all: they come with the
    // engine the bundle already carries.
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${asset("webview.css")}">
<style>${fontFaces(asset)}</style>
<title>denji preview</title>
</head>
<body data-uri="${escapeAttr(this.key)}">
<script nonce="${nonce}" src="${asset("webview.js")}"></script>
</body>
</html>`;
  }
}

/**
 * The typeface the export draws with, given to the preview as well.
 *
 * Otherwise the two disagree: a rendered diagram asks for `Inter` first and falls
 * back to the system stack, so the panel drew in San Francisco or Segoe while the
 * PNG beside it drew in Inter — measured, and every label in the drawing differed.
 * The same two woff2 subsets the export embeds, served from `dist/assets`; 31 KB,
 * and the panel is then the picture the file will be.
 *
 * Written here rather than in `webview.css` because only this side knows the
 * `vscode-resource` URI the files answer on.
 */
function fontFaces(asset: (name: string) => vscode.Uri): string {
  const subsets = [
    {
      file: "assets/inter-latin.woff2",
      range:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
    { file: "assets/inter-cyrillic.woff2", range: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116" },
  ];
  return subsets
    .map(
      (s) =>
        `@font-face{font-family:'Inter';font-style:normal;font-weight:400;` +
        `unicode-range:${s.range};src:url(${asset(s.file)}) format('woff2')}`,
    )
    .join("");
}

const basename = (uri: vscode.Uri): string => uri.path.split("/").pop() ?? uri.path;

const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function randomNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
