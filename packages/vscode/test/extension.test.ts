/**
 * That the host bundle loads, activates, and registers what the manifest
 * promises.
 *
 * A `require` of a module VS Code supplies cannot be resolved outside VS Code,
 * so a stub is planted in the module cache before the bundle is loaded. This is
 * not a test of the editor's behaviour — it is a test that nothing in the host
 * half throws on the way up, which is otherwise only discoverable by launching a
 * second window and reading a notification.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BUNDLE = fileURLToPath(new URL("../dist/extension.js", import.meta.url));
const MANIFEST = fileURLToPath(new URL("../package.json", import.meta.url));

interface Lens {
  range: unknown;
  command: { title: string; command: string; arguments?: unknown[] };
}

interface LensProvider {
  provideCodeLenses: (document: unknown) => Lens[];
}

/** What the extension put in the Problems panel, by document uri. */
type Published = Map<string, FakeDiagnostic[] | undefined>;

interface FakeDiagnostic {
  range: { line: number; start: number; end: number };
  message: string;
  severity: number;
  source?: string;
  code?: string;
  relatedInformation?: Array<{ message: string; line: number }>;
}

interface Recorder {
  commands: string[];
  serializers: string[];
  subscriptions: unknown[];
  lensProviders: Array<{ selector: { language?: string }; provider: LensProvider }>;
  /** What `power.preview.codeLens` and friends answer during a test. */
  config: Record<string, unknown>;
  /** Documents the extension believes are open, which it checks on activation. */
  documents: unknown[];
  published: Published;
  /** The handlers the extension subscribed to, so a test can fire them. */
  onOpen: Array<(d: unknown) => void>;
  onClose: Array<(d: unknown) => void>;
  onConfig: Array<(e: { affectsConfiguration: (s: string) => boolean }) => void>;
}

const recorder = (): Recorder => ({
  commands: [],
  serializers: [],
  subscriptions: [],
  lensProviders: [],
  config: {},
  documents: [],
  published: new Map(),
  onOpen: [],
  onClose: [],
  onConfig: [],
});

/** The slice of the VS Code API the host half touches on the way up. */
function stub(rec: Recorder): Record<string, unknown> {
  return {
    commands: {
      registerCommand: (id: string) => {
        rec.commands.push(id);
        return { dispose() {} };
      },
    },
    window: {
      registerWebviewPanelSerializer: (viewType: string) => {
        rec.serializers.push(viewType);
        return { dispose() {} };
      },
      createWebviewPanel: () => {
        throw new Error("not reached during activation");
      },
      get activeTextEditor() {
        return undefined;
      },
      visibleTextEditors: [],
    },
    languages: {
      registerCodeLensProvider: (selector: { language?: string }, provider: LensProvider) => {
        rec.lensProviders.push({ selector, provider });
        return { dispose() {} };
      },
      createDiagnosticCollection: () => ({
        set: (uri: { toString: () => string }, list: FakeDiagnostic[]) =>
          rec.published.set(uri.toString(), list),
        delete: (uri: { toString: () => string }) => rec.published.delete(uri.toString()),
        dispose() {},
      }),
    },
    workspace: {
      getConfiguration: () => ({
        get: (k: string, d: unknown) => (k in rec.config ? rec.config[k] : d),
      }),
      get textDocuments() {
        return rec.documents;
      },
      onDidOpenTextDocument: (h: (d: unknown) => void) => {
        rec.onOpen.push(h);
        return { dispose() {} };
      },
      onDidCloseTextDocument: (h: (d: unknown) => void) => {
        rec.onClose.push(h);
        return { dispose() {} };
      },
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onDidChangeConfiguration: (h: (e: { affectsConfiguration: (s: string) => boolean }) => void) => {
        rec.onConfig.push(h);
        return { dispose() {} };
      },
      applyEdit: async () => true,
    },
    Uri: { joinPath: () => ({}), parse: (s: string) => ({ toString: () => s }) },
    ViewColumn: { One: 1, Beside: -2 },
    WorkspaceEdit: class {},
    Range: class {
      constructor(
        public line: number,
        public start: number,
        public endLine?: number,
        public end?: number,
      ) {}
    },
    Position: class {},
    Selection: class {},
    Location: class {
      constructor(
        public uri: unknown,
        public range: { line: number },
      ) {}
    },
    Diagnostic: class {
      source?: string;
      code?: string;
      relatedInformation?: unknown[];
      constructor(
        public range: unknown,
        public message: string,
        public severity: number,
      ) {}
    },
    DiagnosticRelatedInformation: class {
      constructor(
        public location: { range: { line: number } },
        public message: string,
      ) {}
    },
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    CodeLens: class {
      constructor(
        public range: unknown,
        public command: unknown,
      ) {}
    },
    EventEmitter: class {
      event = () => ({ dispose() {} });
      fire(): void {}
      dispose(): void {}
    },
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
  };
}

function load(rec: Recorder): { activate: (ctx: unknown) => void; deactivate: () => void } {
  const require_ = createRequire(BUNDLE);
  // `vscode` has no file on disk; short-circuit resolution for that one id.
  const resolve = (Module as unknown as { _resolveFilename: Function })._resolveFilename;
  (Module as unknown as { _resolveFilename: Function })._resolveFilename = function (
    request: string,
    ...rest: unknown[]
  ) {
    if (request === "vscode") return "vscode";
    return resolve.call(this, request, ...rest);
  };
  require_.cache["vscode"] = { id: "vscode", exports: stub(rec), loaded: true } as never;
  try {
    assert.ok(readFileSync(BUNDLE, "utf8").length > 0, "the bundle was built");
    return require_(BUNDLE);
  } finally {
    (Module as unknown as { _resolveFilename: Function })._resolveFilename = resolve;
  }
}

const tests: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void): void => {
  tests.push([name, fn]);
};

/** The slice of a `TextDocument` a CodeLens provider looks at. */
const doc = (uri: string): unknown => ({ uri: { toString: () => uri } });

/** A .pwr document as the diagnostics code reads it: text, plus line lookup. */
function pwrDoc(uri: string, text: string): unknown {
  const lines = text.split("\n");
  return {
    uri: { toString: () => uri },
    languageId: "power",
    getText: () => text,
    lineCount: lines.length,
    lineAt: (i: number) => ({
      text: lines[i] ?? "",
      range: { end: { character: (lines[i] ?? "").length } },
    }),
  };
}

/** A diagram whose `stray` is unconnected and whose relation is dead — two on one line. */
const STRAY = [
  "architecture",
  '  app a "A"',
  '  app b "B" @rightOf(a)',
  '  app stray "S" @below(a) @at(0, 300)',
  "  a -> b",
].join("\n");

/** Open a document, run every handler that would fire, and read what was published. */
function publish(uri: string, text: string): FakeDiagnostic[] {
  const d = pwrDoc(uri, text);
  for (const h of rec.onOpen) h(d);
  return rec.published.get(uri) ?? [];
}

// The bundle is loaded and activated exactly once, which is also all VS Code
// ever does. Everything below reads the same recording.
const rec = recorder();
const ext = load(rec);

test("activates without throwing", () => {
  ext.activate({ subscriptions: rec.subscriptions, extensionUri: {} });
});

test("registers both commands", () => {
  assert.deepEqual(rec.commands.slice().sort(), [
    "power.showPreview",
    "power.showPreviewToSide",
  ]);
});

test("registers a serializer, so a preview survives a window reload", () => {
  assert.deepEqual(rec.serializers, ["power.preview"]);
});

test("registers exactly what the manifest promises", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const declared: string[] = manifest.contributes.commands.map(
    (c: { command: string }) => c.command,
  );
  assert.deepEqual(
    rec.commands.slice().sort(),
    declared.slice().sort(),
    "no command is declared but missing, or registered but undeclared",
  );
  // A serializer for a view type the manifest does not list as an activation
  // event never runs after a reload.
  assert.ok(
    manifest.activationEvents.includes(`onWebviewPanel:${rec.serializers[0]}`),
    "the serializer's view type is an activation event",
  );
});

test("offers a CodeLens on .pwr files, so the button cannot hide", () => {
  const registered = rec.lensProviders;
  assert.equal(registered.length, 1, "one provider");
  assert.equal(registered[0]!.selector.language, "power", "for .pwr files only");

  const lenses = registered[0]!.provider.provideCodeLenses(doc("file:///a.pwr"));
  assert.equal(lenses.length, 1);
  assert.equal(lenses[0]!.command.command, "power.showPreviewToSide");
  assert.match(lenses[0]!.command.title, /preview/i);
  // The lens names its own document rather than trusting whichever editor is
  // active when the click lands.
  assert.deepEqual(lenses[0]!.command.arguments?.map(String), ["file:///a.pwr"]);
});

test("the lens command is one the manifest declares", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const declared: string[] = manifest.contributes.commands.map(
    (c: { command: string }) => c.command,
  );
  const lens = rec.lensProviders[0]!.provider.provideCodeLenses(doc("file:///a.pwr"))[0]!;
  assert.ok(declared.includes(lens.command.command));
});

test("the lens can be turned off, and the setting is declared", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  assert.ok(
    "power.preview.codeLens" in manifest.contributes.configuration.properties,
    "a lens on every file is the kind of thing someone turns off",
  );
  rec.config["codeLens"] = false;
  try {
    const lenses = rec.lensProviders[0]!.provider.provideCodeLenses(doc("file:///a.pwr"));
    assert.deepEqual(lenses, []);
  } finally {
    delete rec.config["codeLens"];
  }
});

test("activates on the language, or the lens is never there to be clicked", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  // Commands self-activate; a CodeLens has to already exist. Without this the
  // offer only appears after something else has woken the extension.
  assert.ok(manifest.activationEvents.includes("onLanguage:power"));
});

test("puts check's findings in the Problems panel, on the right line", () => {
  const found = publish("file:///stray.pwr", STRAY);
  const dead = found.find((d) => d.code === "at-overrides-hint");
  assert.ok(dead, "the dead relation is reported");
  assert.equal(dead.severity, 1, "as a warning");
  assert.equal(dead.source, "power", "attributed, so the panel can group it");
  // The `stray` declaration is line 4 (0-based 3), and `stray` starts at column 6.
  assert.deepEqual(
    { line: dead.range.line, start: dead.range.start, end: dead.range.end },
    { line: 3, start: 6, end: 11 },
    "squiggled under the id, not the whole line",
  );
});

test("makes both ends of an overlap-style finding reachable", () => {
  // Two nodes, one message: the second is somewhere else in the file, and a
  // reader who cannot get there has half a diagnostic.
  const src = 'architecture\n  app a "A" @rightOf(b)\n  app b "B" @rightOf(a)\n';
  const found = publish("file:///cycle.pwr", src);
  const cycle = found.find((d) => d.code === "hint-cycle");
  assert.ok(cycle, "the cycle is reported");
  assert.ok(
    (cycle.relatedInformation?.length ?? 0) > 0,
    "and the other node it names is a place you can go",
  );
});

test("reports a parse error where the parser stopped", () => {
  const found = publish("file:///bad.pwr", 'architecture\n  app a "A" @nope(1)\n');
  assert.equal(found.length, 1, "an error stops the checks, so nothing else is listed");
  assert.equal(found[0]!.severity, 0, "as an error");
  assert.equal(found[0]!.code, "parse-error");
  assert.equal(found[0]!.range.line, 1);
});

test("can be turned down to errors, or off altogether", () => {
  rec.config["diagnostics"] = "errors";
  try {
    assert.deepEqual(publish("file:///stray.pwr", STRAY), [], "the heuristics go quiet");
    assert.equal(
      publish("file:///bad.pwr", 'architecture\n  app a "A" @nope(1)\n').length,
      1,
      "but a broken document still says so",
    );
    rec.config["diagnostics"] = "off";
    publish("file:///bad.pwr", 'architecture\n  app a "A" @nope(1)\n');
    assert.equal(rec.published.has("file:///bad.pwr"), false, "and off means nothing at all");
  } finally {
    delete rec.config["diagnostics"];
  }
});

test("clears a document's findings when it is closed", () => {
  const d = pwrDoc("file:///gone.pwr", STRAY);
  for (const h of rec.onOpen) h(d);
  assert.ok(rec.published.has("file:///gone.pwr"));
  for (const h of rec.onClose) h(d);
  assert.equal(
    rec.published.has("file:///gone.pwr"),
    false,
    "a list of problems in a file nobody can see is not useful",
  );
});

test("leaves documents in other languages alone", () => {
  const other = { ...(pwrDoc("file:///a.ts", STRAY) as object), languageId: "typescript" };
  for (const h of rec.onOpen) h(other);
  assert.equal(rec.published.has("file:///a.ts"), false);
});

test("declares the setting it reads", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const prop = manifest.contributes.configuration.properties["power.diagnostics"];
  assert.ok(prop, "power.diagnostics is declared");
  assert.deepEqual(prop.enum, ["all", "errors", "off"]);
  assert.equal(prop.default, "all", "matching what `power check` reports");
});

test("hands everything it registered to the context, so it all gets disposed", () => {
  assert.ok(
    rec.subscriptions.length >= rec.commands.length + rec.serializers.length + 1,
    "commands, the serializer and the lens provider are all disposable",
  );
});

test("deactivating is safe", () => {
  ext.deactivate();
});

let failures = 0;
console.log("extension");
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} failing`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} passing`);
}
