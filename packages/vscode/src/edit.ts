/**
 * Turning a drop into an edit of the user's file.
 */
import * as vscode from "vscode";
import { findDeclarationLine, setNodePositions } from "power";
import { changedLines } from "./diff.js";
import type { Move } from "./protocol.js";

/**
 * Write `moves` into `document` as `@at` directives, in one undoable step.
 *
 * The source is re-read here rather than taken from the webview: a drag lasts
 * long enough for someone to type in the editor, and the coordinates are the
 * only part of the gesture that should survive that.
 */
export async function applyMoves(
  document: vscode.TextDocument,
  moves: readonly Move[],
): Promise<void> {
  const before = document.getText();
  const after = setNodePositions(before, moves);
  // Null means not one of the ids is declared any more — the document moved on.
  if (after === null || after === before) return;

  const edit = new vscode.WorkspaceEdit();
  const lines = changedLines(before, after);
  if (lines === null) {
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(before.length));
    edit.replace(document.uri, whole, after);
  } else {
    for (const [line, text] of lines) {
      edit.replace(document.uri, document.lineAt(line).range, text);
    }
  }
  await vscode.workspace.applyEdit(edit);
}

/** Put the cursor on the line declaring `id`, and scroll it into view. */
export function revealNode(document: vscode.TextDocument, id: string): void {
  const line = findDeclarationLine(document.getText(), id);
  if (line === null) return;
  // By uri, not by object: a file closed and reopened is a different
  // `TextDocument` for the same thing.
  const key = document.uri.toString();
  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === key);
  if (!editor) return;
  // Land on the id itself rather than at column 0 — the declaration keyword is
  // never what someone clicking a node in the picture came for.
  const text = document.lineAt(line - 1).text;
  const col = Math.max(0, text.indexOf(id));
  const at = new vscode.Position(line - 1, col);
  editor.selection = new vscode.Selection(at, at);
  editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}
