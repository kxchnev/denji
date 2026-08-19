/**
 * Exporting a picture from the host half, with no preview anywhere.
 *
 * That is the property worth a test: the marks and the rasterizer are files the
 * extension ships, so a right-click in the explorer can write a PNG with no
 * window open. Before this they lived inside the webview bundle, and the host
 * could not draw at all.
 *
 * Run against the **built** bundle, with `vscode` planted in the module cache the
 * way `extension.test.ts` does it — a stub of just the calls an export makes.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLE = fileURLToPath(new URL("../dist/extension.js", import.meta.url));
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = `architecture
  service orders "Заказы" {
    app api "Orders API" @icon(postgresql)
    database db "Postgres" @below(api)
    api -> db
  }
`;

interface FakeUri {
  scheme: string;
  path: string;
  fsPath: string;
  toString: () => string;
  with: (change: { path?: string }) => FakeUri;
}

const uri = (path: string): FakeUri => ({
  scheme: "file",
  path,
  fsPath: path,
  toString: () => `file://${path}`,
  with: (change) => uri(change.path ?? path),
});

interface FakeDocument {
  uri: FakeUri;
  getText: () => string;
}

interface Harness {
  /** Command id → handler, as the extension registered them. */
  commands: Map<string, (arg?: unknown) => unknown>;
  /** The document the editor is on, if any — set before invoking a command. */
  editor: { document: FakeDocument } | undefined;
  /** Files the export wrote. */
  written: Map<string, Uint8Array>;
  /** What the save dialog will answer with; `undefined` means the reader cancelled. */
  saveAs: FakeUri | undefined;
  messages: string[];
  errors: string[];
}

function boot(): Harness {
  const h: Harness = {
    commands: new Map(),
    editor: undefined,
    written: new Map(),
    saveAs: uri("/tmp/out.png"),
    messages: [],
    errors: [],
  };

  const stub = {
    commands: {
      registerCommand: (id: string, fn: (arg?: unknown) => unknown) => {
        h.commands.set(id, fn);
        return { dispose() {} };
      },
      executeCommand: async () => undefined,
    },
    window: {
      registerWebviewPanelSerializer: () => ({ dispose() {} }),
      createWebviewPanel: () => {
        throw new Error("no preview is opened by an export");
      },
      get activeTextEditor() {
        return h.editor;
      },
      visibleTextEditors: [],
      showSaveDialog: async () => h.saveAs,
      showInformationMessage: async (m: string) => {
        h.messages.push(m);
        return undefined;
      },
      showErrorMessage: async (m: string) => {
        h.errors.push(m);
        return undefined;
      },
    },
    languages: {
      registerCodeLensProvider: () => ({ dispose() {} }),
      createDiagnosticCollection: () => ({ set() {}, delete() {}, dispose() {} }),
    },
    workspace: {
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      get textDocuments() {
        return h.editor ? [h.editor.document] : [];
      },
      onDidOpenTextDocument: () => ({ dispose() {} }),
      onDidCloseTextDocument: () => ({ dispose() {} }),
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
      applyEdit: async () => true,
      fs: {
        readFile: async (u: FakeUri) => new TextEncoder().encode(SOURCE_BY_PATH[u.path] ?? ""),
        writeFile: async (u: FakeUri, bytes: Uint8Array) => {
          h.written.set(u.path, bytes);
        },
      },
    },
    Uri: { joinPath: () => ({}), parse: (s: string) => uri(s), file: uri },
    ViewColumn: { One: 1, Beside: -2 },
    WorkspaceEdit: class {},
    Range: class {},
    Position: class {},
    Selection: class {},
    Location: class {},
    Diagnostic: class {},
    DiagnosticRelatedInformation: class {},
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    CodeLens: class {},
    EventEmitter: class {
      event = () => ({ dispose() {} });
      fire(): void {}
      dispose(): void {}
    },
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
  };

  const require_ = createRequire(BUNDLE);
  const resolve = (Module as unknown as { _resolveFilename: Function })._resolveFilename;
  (Module as unknown as { _resolveFilename: Function })._resolveFilename = function (
    request: string,
    ...rest: unknown[]
  ) {
    if (request === "vscode") return "vscode";
    return resolve.call(this, request, ...rest);
  };
  require_.cache["vscode"] = { id: "vscode", exports: stub, loaded: true } as never;
  delete require_.cache[BUNDLE];
  try {
    const ext = require_(BUNDLE) as { activate: (ctx: unknown) => void };
    ext.activate({ subscriptions: [], extensionUri: uri(ROOT.replace(/\/$/, "")) });
  } finally {
    (Module as unknown as { _resolveFilename: Function })._resolveFilename = resolve;
  }
  return h;
}

/** The one document the fake file system holds. */
const SOURCE_BY_PATH: Record<string, string> = { "/tmp/diagram.denji": SOURCE };

const tests: Array<[string, () => Promise<void> | void]> = [];
const test = (name: string, fn: () => Promise<void> | void): void => void tests.push([name, fn]);

test("writes a PNG for a file nobody has open", async () => {
  const h = boot();
  h.saveAs = uri("/tmp/out.png");
  await h.commands.get("denji.exportPNG")!(uri("/tmp/diagram.denji"));
  assert.deepEqual(h.errors, []);
  const png = h.written.get("/tmp/out.png");
  assert.ok(png && png.length > 1000, "a PNG was written");
  assert.deepEqual([...png.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(h.messages.length, 1);
});

test("writes an SVG that carries its own typeface and no CSS variables", async () => {
  const h = boot();
  h.saveAs = uri("/tmp/out.svg");
  await h.commands.get("denji.exportSVG")!(uri("/tmp/diagram.denji"));
  const svg = new TextDecoder().decode(h.written.get("/tmp/out.svg")!);
  assert.ok(svg.includes("@font-face"), "the face travels with the file");
  assert.ok(!svg.includes("var(--"), "nothing depends on custom properties");
  // The mark resolved, which means the artwork was found beside the bundle.
  assert.ok(svg.includes("denji-icon-postgresql"), "the brand mark is in the file");
});

test("writes a JPEG", async () => {
  const h = boot();
  h.saveAs = uri("/tmp/out.jpg");
  await h.commands.get("denji.exportJPEG")!(uri("/tmp/diagram.denji"));
  const jpeg = h.written.get("/tmp/out.jpg")!;
  assert.deepEqual([...jpeg.slice(0, 3)], [0xff, 0xd8, 0xff]);
});

test("writes nothing when the reader cancels the dialog", async () => {
  const h = boot();
  h.saveAs = undefined;
  await h.commands.get("denji.exportPNG")!(uri("/tmp/diagram.denji"));
  assert.equal(h.written.size, 0);
  assert.deepEqual(h.errors, []);
});

test("takes a menu's own argument for what it is, not for a document", async () => {
  // A webview context menu hands the command `{ webviewSection, … }` and an
  // editor title bar over a webview hands it the panel. Neither is a uri, and
  // treating one as a uri is what made the preview's buttons fail.
  const h = boot();
  h.editor = { document: { uri: uri("/tmp/diagram.denji"), getText: () => SOURCE } };
  h.saveAs = uri("/tmp/menu.png");
  for (const arg of [
    { webviewSection: "editor", preventDefaultContextMenuItems: true },
    { viewType: "denji.preview" },
    "denji.preview",
  ]) {
    h.written.clear();
    await h.commands.get("denji.exportPNG")!(arg);
    assert.deepEqual(h.errors, [], `argument ${JSON.stringify(arg)}`);
    assert.ok(h.written.get("/tmp/menu.png"), "the picture was written anyway");
  }
});

test("exports the buffer being edited, not the file on disk", async () => {
  const h = boot();
  const edited = SOURCE.replace('"Заказы"', '"Изменённое"');
  h.editor = { document: { uri: uri("/tmp/diagram.denji"), getText: () => edited } };
  h.saveAs = uri("/tmp/buffer.svg");
  await h.commands.get("denji.exportSVG")!(undefined);
  const svg = new TextDecoder().decode(h.written.get("/tmp/buffer.svg")!);
  assert.ok(svg.includes("Изменённое"), "the unsaved edit is in the picture");
});

/**
 * The promise the whole export path rests on, checked across two products rather
 * than asserted in prose: this bundle and the `denji` command line must write the
 * *same file*.
 *
 * It can only be tested from here, because only here are both halves present —
 * the host bundle with its own copy of the engine in `dist/assets`, and the core's
 * CLI reading the package's own `assets/`. If this ever fails, the two have
 * drifted: a different rasterizer, a different font, or an asset copied at the
 * wrong version.
 */
test("writes the same bytes as the command line, format for format", async () => {
  const dir = mkdtempSync(join(tmpdir(), "denji-export-"));
  const doc = join(dir, "same.denji");
  writeFileSync(doc, SOURCE);
  SOURCE_BY_PATH[doc] = SOURCE;
  const cli = fileURLToPath(new URL("../../core/dist/cli.js", import.meta.url));
  const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

  for (const [format, ext] of [
    ["PNG", "png"],
    ["SVG", "svg"],
    ["JPEG", "jpg"],
  ] as const) {
    const fromCli = join(dir, `cli.${ext}`);
    execFileSync(process.execPath, [cli, "render", doc, "-o", fromCli], { stdio: "pipe" });

    const h = boot();
    h.saveAs = uri(join(dir, `host.${ext}`));
    await h.commands.get(`denji.export${format}`)!(uri(doc));
    assert.deepEqual(h.errors, [], `${format} exported without complaint`);

    assert.equal(
      sha(h.written.get(join(dir, `host.${ext}`))!),
      sha(readFileSync(fromCli)),
      `${format} from this extension is byte-identical to denji render`,
    );
  }
});

test("says so when there is nothing to export", async () => {
  const h = boot();
  await h.commands.get("denji.exportPNG")!(undefined);
  assert.equal(h.written.size, 0);
  assert.match(h.errors[0] ?? "", /no \.denji document/);
});

// Keep the bundle honest: the assets it reads have to be where the build put them.
assert.ok(readFileSync(new URL("../dist/assets/inter.ttf", import.meta.url)).length > 0);
assert.ok(readFileSync(new URL("../dist/assets/resvg.wasm", import.meta.url)).length > 0);

void (async () => {
  let failures = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failures++;
      console.error(`  ✗ ${name}`);
      console.error(err);
    }
  }
  console.log(failures === 0 ? `\n${tests.length} passing` : `\n${failures} failing`);
  if (failures > 0) process.exitCode = 1;
})();
