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

interface Recorder {
  commands: string[];
  serializers: string[];
  subscriptions: unknown[];
  lensProviders: Array<{ selector: { language?: string }; provider: LensProvider }>;
  /** What `power.preview.codeLens` and friends answer during a test. */
  config: Record<string, unknown>;
}

const recorder = (): Recorder => ({
  commands: [],
  serializers: [],
  subscriptions: [],
  lensProviders: [],
  config: {},
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
    },
    workspace: {
      getConfiguration: () => ({
        get: (k: string, d: unknown) => (k in rec.config ? rec.config[k] : d),
      }),
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
      textDocuments: [],
      applyEdit: async () => true,
    },
    Uri: { joinPath: () => ({}), parse: (s: string) => ({ toString: () => s }) },
    ViewColumn: { One: 1, Beside: -2 },
    WorkspaceEdit: class {},
    Range: class {
      constructor(...args: unknown[]) {
        Object.assign(this, { args });
      }
    },
    Position: class {},
    Selection: class {},
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
