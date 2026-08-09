/**
 * Turning a drop into an edit of the user's file.
 */
import * as vscode from "vscode";
import { findDeclaration, setNodeRelation } from "power";
import { changedLines } from "./diff.js";
import type { Move } from "./protocol.js";

/**
 * Write `moves` into `document` as placement directives, in one undoable step.
 *
 * The source is re-read here rather than taken from the webview: a drag lasts
 * long enough for someone to type in the editor, and where the node ended up is
 * the only part of the gesture that should survive that.
 */
export async function applyMoves(
  document: vscode.TextDocument,
  moves: readonly Move[],
): Promise<void> {
  const before = document.getText();
  let after: string | null = before;
  for (const m of moves) {
    const next: string | null = setNodeRelation(after, m.id, m.side, m.anchor);
    if (next === null) {
      after = null;
      break;
    }
    after = next;
  }
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
  // The columns come from the core along with the line: where the id sits in a
  // declaration is a fact about the declaration's shape, not something every
  // caller should re-derive. Landing on the id rather than at column 0 matters —
  // the declaration keyword is never what someone clicking a node came for.
  const decl = findDeclaration(document.getText(), id);
  if (!decl) return;
  // By uri, not by object: a file closed and reopened is a different
  // `TextDocument` for the same thing.
  const key = document.uri.toString();
  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === key);
  if (!editor) return;
  const at = new vscode.Position(decl.line - 1, decl.col - 1);
  editor.selection = new vscode.Selection(at, at);
  editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}
