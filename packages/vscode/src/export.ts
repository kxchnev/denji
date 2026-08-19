import * as vscode from "vscode";
import {
  DiagramParseError,
  layoutArchitecture,
  parseArchitecture,
  toJpeg,
  toPng,
  toSvgFile,
} from "@kxchnev/denji";
import { loadAssets } from "./assets.js";

/**
 * Saving a diagram as a picture, from wherever the reader happens to be.
 *
 * All of it runs in the **host**, and nothing here asks a preview for anything.
 * That is the point: the marks and the rasterizer are files this extension ships,
 * so a right-click on a `.denji` file in the explorer can write a PNG with no
 * window open — the preview used to be the only half that could draw, purely
 * because it was the only half carrying the artwork.
 *
 * The three functions come from the core, and the CLI and the web playground call
 * exactly the same ones. So "the same diagram, the same picture" is not three
 * implementations agreeing; it is one implementation, called from three places.
 */

export type Format = "svg" | "png" | "jpeg";

const LABEL: Record<Format, string> = { svg: "SVG", png: "PNG", jpeg: "JPEG" };
const EXTENSION: Record<Format, string> = { svg: "svg", png: "png", jpeg: "jpg" };

export function registerExport(context: vscode.ExtensionContext): void {
  for (const format of ["svg", "png", "jpeg"] as const) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`denji.export${LABEL[format]}`, (arg?: unknown) =>
        exportDiagram(context, format, asUri(arg)),
      ),
    );
  }
}

/**
 * What the command was invoked *on*, if anything.
 *
 * A menu hands the command whatever its contribution point hands out, and only
 * the explorer hands out a `Uri`: an editor title bar over a webview passes the
 * panel, a webview context menu passes `{ webviewSection, … }`. Those are not
 * documents, and treating one as a document threw on the first property access —
 * which is the error the preview's own buttons ran into. Anything that is not
 * plainly a uri is discarded, and the fallbacks below decide instead.
 */
function asUri(arg: unknown): vscode.Uri | undefined {
  const maybe = arg as { scheme?: unknown; path?: unknown; with?: unknown } | undefined;
  return typeof maybe?.scheme === "string" &&
    typeof maybe.path === "string" &&
    typeof maybe.with === "function"
    ? (arg as vscode.Uri)
    : undefined;
}

export async function exportDiagram(
  context: vscode.ExtensionContext,
  format: Format,
  uri: vscode.Uri | undefined,
): Promise<void> {
  const source = await sourceFor(uri);
  if (!source) {
    void vscode.window.showErrorMessage("denji: no .denji document to export.");
    return;
  }

  const target = await vscode.window.showSaveDialog({
    // Beside the document, named after it — the answer nine times out of ten.
    defaultUri: source.uri.with({ path: swapExtension(source.uri.path, EXTENSION[format]) }),
    filters: { [LABEL[format]]: [EXTENSION[format]] },
    title: `Export diagram as ${LABEL[format]}`,
  });
  if (!target) return;

  try {
    loadAssets(context);
    const diagram = parseArchitecture(source.text);
    // Warnings belong to the Problems panel, which already has them from
    // `checkDiagram`; a second copy in a modal would be the same news twice.
    layoutArchitecture(diagram, { onWarn: () => {} });
    const bytes =
      format === "svg"
        ? new TextEncoder().encode(toSvgFile(diagram))
        : format === "png"
          ? await toPng(diagram)
          : await toJpeg(diagram);
    await vscode.workspace.fs.writeFile(target, bytes);

    const open = "Open";
    const reveal = "Reveal in Explorer";
    const answer = await vscode.window.showInformationMessage(
      `denji: wrote ${basename(target)}`,
      open,
      reveal,
    );
    if (answer === open) await vscode.commands.executeCommand("vscode.open", target);
    if (answer === reveal) await vscode.commands.executeCommand("revealFileInOS", target);
  } catch (err) {
    // A parse error is the document's, and the reader can act on it; anything
    // else is ours and says so plainly.
    const message =
      err instanceof DiagramParseError
        ? `denji: ${err.message}`
        : `denji: export failed — ${(err as Error).message}`;
    void vscode.window.showErrorMessage(message);
  }
}

/**
 * Which document to draw: the one the menu named, else the one being edited, else
 * the one the active preview is showing.
 *
 * The **open buffer** wins over the file on disk, so exporting what you are
 * looking at includes the edit you have not saved — the same rule the preview
 * follows.
 */
async function sourceFor(
  uri: vscode.Uri | undefined,
): Promise<{ uri: vscode.Uri; text: string } | undefined> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri ?? activePreviewUri();
  if (!target) return undefined;
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === target.toString());
  if (open) return { uri: target, text: open.getText() };
  try {
    const bytes = await vscode.workspace.fs.readFile(target);
    return { uri: target, text: new TextDecoder().decode(bytes) };
  } catch {
    return undefined;
  }
}

/** Set by the preview manager while one of its panels is the active tab. */
let activeUri: vscode.Uri | undefined;
export function notePreviewFocus(uri: vscode.Uri | undefined): void {
  activeUri = uri;
}
const activePreviewUri = (): vscode.Uri | undefined => activeUri;

const swapExtension = (path: string, ext: string): string =>
  `${path.replace(/\.[^./]*$/, "")}.${ext}`;

const basename = (uri: vscode.Uri): string => uri.path.split("/").pop() ?? uri.path;
