/**
 * `power check` in the Problems panel.
 *
 * The same findings the CLI prints, on the lines they are about — errors from
 * the parser and the builder, plus the layout warnings that say a diagram
 * renders but probably is not what was meant.
 *
 * These are heuristics, not rules. `power.diagnostics` exists because someone
 * who disagrees with one of them should be able to turn the lot down rather
 * than argue with a squiggle on every file they open.
 */
import * as vscode from "vscode";
import { checkDiagram, findDeclaration, type Diagnostic as Finding } from "power";

/**
 * Longer than the preview's 60 ms, on purpose. A repaint that lags looks
 * sluggish; a squiggle that appears under a half-typed line and vanishes again
 * is worse than one that arrives a moment late — and this runs a full parse
 * *and* layout, same as a render.
 */
const DEBOUNCE_MS = 300;

const LANGUAGE = "power";

type Level = "all" | "errors" | "off";

const level = (uri: vscode.Uri): Level =>
  vscode.workspace.getConfiguration("power", uri).get<Level>("diagnostics", "all");

export function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("power");
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const refresh = (document: vscode.TextDocument): void => {
    if (document.languageId !== LANGUAGE) return;
    const setting = level(document.uri);
    if (setting === "off") {
      collection.delete(document.uri);
      return;
    }
    const { diagnostics } = checkDiagram(document.getText());
    const source = document.getText();
    collection.set(
      document.uri,
      diagnostics
        .filter((d) => setting === "all" || d.severity === "error")
        .map((d) => toVscode(d, source, document)),
    );
  };

  const refreshSoon = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const pending = timers.get(key);
    if (pending) clearTimeout(pending);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(document);
      }, DEBOUNCE_MS),
    );
  };

  const forget = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const pending = timers.get(key);
    if (pending) clearTimeout(pending);
    timers.delete(key);
    collection.delete(document.uri);
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refreshSoon(e.document)),
    // A closed document is not a clean document — leaving its findings in the
    // panel would be a list of problems in a file nobody can see.
    vscode.workspace.onDidCloseTextDocument(forget),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("power.diagnostics")) return;
      for (const d of vscode.workspace.textDocuments) refresh(d);
    }),
    { dispose: () => timers.forEach(clearTimeout) },
  );

  // Whatever is already open when the extension wakes up.
  for (const d of vscode.workspace.textDocuments) refresh(d);
}

function toVscode(
  finding: Finding,
  source: string,
  document: vscode.TextDocument,
): vscode.Diagnostic {
  const d = new vscode.Diagnostic(
    rangeOf(finding, document),
    finding.message,
    finding.severity === "error"
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning,
  );
  d.source = "power";
  // The stable code, not the prose — it is what the panel filters on and what
  // someone looks up when they want to know why a warning exists.
  d.code = finding.code;

  // "a and b overlap" is about two places. The first is where the squiggle
  // went; the rest become destinations the reader can click through to.
  const others = (finding.nodes ?? []).slice(1);
  if (others.length > 0) {
    d.relatedInformation = others
      .map((id) => {
        const at = findDeclaration(source, id);
        return at
          ? new vscode.DiagnosticRelatedInformation(
              new vscode.Location(
                document.uri,
                new vscode.Range(at.line - 1, at.col - 1, at.line - 1, at.endCol - 1),
              ),
              id,
            )
          : null;
      })
      .filter((x): x is vscode.DiagnosticRelatedInformation => x !== null);
  }
  return d;
}

/**
 * Where to draw it. The core reports a span for anything it can measure; a
 * parse error knows only where it stopped, so that gets the rest of the line,
 * and a finding with no position at all gets the first line rather than being
 * dropped on the floor.
 */
function rangeOf(finding: Finding, document: vscode.TextDocument): vscode.Range {
  if (finding.line === null) return document.lineAt(0).range;
  const line = Math.min(finding.line - 1, document.lineCount - 1);
  const text = document.lineAt(line);
  if (finding.col === null) return text.range;
  const start = Math.max(0, finding.col - 1);
  const end = finding.endCol ? finding.endCol - 1 : text.range.end.character;
  return new vscode.Range(line, start, line, Math.max(end, start + 1));
}
