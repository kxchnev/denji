/**
 * The offer to open a preview, put where it cannot be missed.
 *
 * There is a button in the editor title bar too, but that row collapses into a
 * `…` menu as soon as the tab is narrow — which is precisely what happens once a
 * preview is open beside it, and near enough to when someone is looking for the
 * button in the first place. A CodeLens sits in the text and never moves.
 */
import * as vscode from "vscode";
import type { PreviewManager } from "./preview.js";

export class OpenPreviewLens implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  constructor(private readonly previews: PreviewManager) {}

  /** Re-ask whenever a preview opens or closes, or the setting is toggled. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.changed,
      vscode.languages.registerCodeLensProvider({ language: "denji" }, this),
      this.previews.onDidChange(() => this.changed.fire()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("denji.preview.codeLens")) this.changed.fire();
      }),
    );
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const on = vscode.workspace
      .getConfiguration("denji.preview", document.uri)
      .get<boolean>("codeLens", true);
    // Once the preview is open the offer has been taken up, and the line is
    // better spent on the diagram than on a button that would do nothing new.
    if (!on || this.previews.isOpen(document.uri)) return [];
    return [
      new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
        title: "$(open-preview) Open preview to the side",
        command: "denji.showPreviewToSide",
        // Naming the document rather than leaning on whichever editor happens
        // to be active when the click lands.
        arguments: [document.uri],
      }),
    ];
  }
}
