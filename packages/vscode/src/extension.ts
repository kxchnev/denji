import * as vscode from "vscode";
import { OpenPreviewLens } from "./lens.js";
import { PreviewManager } from "./preview.js";

export function activate(context: vscode.ExtensionContext): void {
  const previews = new PreviewManager(context);

  const open = (beside: boolean) => async (uri?: vscode.Uri): Promise<void> => {
    // A CodeLens or a menu says which document it meant; a keybinding does not,
    // and means the one being typed in.
    const editor = vscode.window.activeTextEditor;
    const document = uri ? await vscode.workspace.openTextDocument(uri) : editor?.document;
    if (!document) return;
    const column = beside
      ? vscode.ViewColumn.Beside
      : (editor?.viewColumn ?? vscode.ViewColumn.One);
    previews.show(document, column);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("power.showPreview", open(false)),
    vscode.commands.registerCommand("power.showPreviewToSide", open(true)),
  );

  new OpenPreviewLens(previews).register(context);
}

export function deactivate(): void {}
