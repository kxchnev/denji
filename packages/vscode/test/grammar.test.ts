/**
 * Runs `.pwr` text through the generated grammar with the real TextMate engine —
 * the same `vscode-textmate` + `vscode-oniguruma` pair VS Code itself uses.
 *
 * Asserting that the generated JSON *contains* the right words would pass
 * happily while nothing was coloured, which is exactly the state this fixes.
 * The only useful question is what scope each piece of text ends up with, so
 * that is what is asked here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as oniguruma from "vscode-oniguruma";
import { INITIAL, Registry, parseRawGrammar, type IGrammar } from "vscode-textmate";
import { ARCH_OPERATORS, CONTAINER_KIND_NAMES, DIRECTIVE_NAMES, SHAPE_KIND_NAMES } from "power";

const GRAMMAR = fileURLToPath(new URL("../syntaxes/pwr.tmLanguage.json", import.meta.url));
const SAMPLE = fileURLToPath(new URL("../examples/sample.pwr", import.meta.url));
const WASM = createRequire(import.meta.url).resolve("vscode-oniguruma/release/onig.wasm");

async function load(): Promise<IGrammar> {
  await oniguruma.loadWASM(readFileSync(WASM).buffer as ArrayBuffer);
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (s) => new oniguruma.OnigScanner(s),
      createOnigString: (s) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async (scope) =>
      scope === "source.pwr"
        ? parseRawGrammar(readFileSync(GRAMMAR, "utf8"), GRAMMAR)
        : null,
  });
  const grammar = await registry.loadGrammar("source.pwr");
  assert.ok(grammar, "the generated grammar loads");
  return grammar;
}

interface Token {
  text: string;
  scopes: string[];
}

/** Every token of a document, with the text it covers. */
function tokenize(grammar: IGrammar, source: string): Token[] {
  let rule = INITIAL;
  const out: Token[] = [];
  for (const line of source.split("\n")) {
    const result = grammar.tokenizeLine(line, rule);
    rule = result.ruleStack;
    for (const t of result.tokens) {
      out.push({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes });
    }
  }
  return out;
}

/** The scopes of the first token whose text is exactly `text`. */
function scopesOf(tokens: Token[], text: string): string[] {
  const t = tokens.find((x) => x.text === text);
  assert.ok(t, `something tokenizes as ${JSON.stringify(text)}`);
  return t.scopes;
}

const has = (scopes: string[], prefix: string): boolean =>
  scopes.some((s) => s.startsWith(prefix));

const tests: Array<[string, (g: IGrammar) => void]> = [];
const test = (name: string, fn: (g: IGrammar) => void): void => {
  tests.push([name, fn]);
};

// ── the tests ────────────────────────────────────────────────────────────────

test("paints the sample file's keywords, names, strings and operators", (g) => {
  const t = tokenize(g, readFileSync(SAMPLE, "utf8"));
  assert.ok(has(scopesOf(t, "architecture"), "keyword.control"), "architecture is a keyword");
  assert.ok(has(scopesOf(t, "app"), "storage.type"), "app is a type");
  assert.ok(has(scopesOf(t, "cdn"), "entity.name"), "the declared id is a name");
  assert.ok(has(scopesOf(t, "CDN"), "string.quoted"), "a label is a string");
  assert.ok(has(scopesOf(t, "->"), "keyword.operator"), "-> is an operator");
  assert.ok(has(scopesOf(t, "group"), "storage.type"), "group is a type");
  assert.ok(has(scopesOf(t, "text"), "keyword.control"), "text is a keyword");
});

test("knows a directive from a typo", (g) => {
  const t = tokenize(g, 'architecture\napp a "A" @rightOf(b) @nonsense(1)');
  assert.ok(has(scopesOf(t, "rightOf"), "support.function"), "a real directive is a function");
  assert.ok(has(scopesOf(t, "nonsense"), "invalid"), "one the core does not know is not");
  assert.ok(has(scopesOf(t, "@"), "punctuation.definition.directive"));
});

test("treats a comment line as a comment, all of it", (g) => {
  for (const marker of ["#", "%%"]) {
    const t = tokenize(g, `${marker} app a "A" -> b\narchitecture`);
    for (const token of t.slice(0, -1)) {
      assert.ok(
        has(token.scopes, "comment"),
        `${JSON.stringify(token.text)} after ${marker} is comment`,
      );
    }
  }
});

test("does not invent a trailing comment, because the language has none", (g) => {
  // `app a "X" # note` is a syntax error in the core, not a comment. Painting
  // the tail grey would tell the author the opposite.
  const t = tokenize(g, 'architecture\napp a "A" # note');
  assert.ok(!t.some((x) => x.text.includes("note") && has(x.scopes, "comment")));
});

test("reads a style block as properties, not as a connection", (g) => {
  // `dash: 6 4` contains `--`-free text but `stroke: …` lines and the block's
  // own `}` would otherwise be dispatched as something else entirely.
  const t = tokenize(g, "style hot {\n  fill: #fee;\n  dash: 6 4;\n}");
  assert.ok(has(scopesOf(t, "style"), "keyword"), "style opens a block");
  assert.ok(has(scopesOf(t, "hot"), "entity.name"), "and names it");
  assert.ok(has(scopesOf(t, "fill"), "support.type.property-name"), "fill is a property");
  assert.ok(has(scopesOf(t, "#fee"), "constant.other.color"), "and its value is a colour");
});

test("flags a property that does not belong in an icon block", (g) => {
  const t = tokenize(g, "icon mine {\n  path: M0 0;\n  fill: #fff;\n}");
  assert.ok(has(scopesOf(t, "path"), "support.type.property-name"), "path belongs here");
  assert.ok(has(scopesOf(t, "fill"), "invalid"), "fill does not");
});

test("takes a connection label from the colon to the end of the line", (g) => {
  const t = tokenize(g, "architecture\na -> b : sends @style(hot)");
  assert.ok(has(scopesOf(t, "a"), "variable.other"), "an endpoint is a reference, not a name");
  const label = t.find((x) => x.text.includes("sends"));
  assert.ok(label && has(label.scopes, "string.unquoted"), "the label is unquoted text");
  // The directive is *inside* the label — the core reads it that way too.
  const directive = t.find((x) => x.text.includes("@style"));
  assert.ok(!directive || has(directive.scopes, "string.unquoted"));
});

test("is case-sensitive exactly where the core is", (g) => {
  // Keywords are matched literally by the parser, so `App` is not a kind and
  // must not be coloured as one.
  // No rule matches the line at all, so `App` is not even its own token —
  // whatever token covers it, it must not be a type.
  const wrong = tokenize(g, 'architecture\nApp a "A"');
  const covering = wrong.filter((t) => t.text.includes("App"));
  assert.ok(covering.length > 0, "the line was tokenized");
  for (const t of covering) assert.ok(!has(t.scopes, "storage.type"), "App is not a kind");
  // Directive names are normalized before lookup, so any casing is the real one.
  for (const spelling of ["rightOf", "RIGHTOF", "rightof"]) {
    const t = tokenize(g, `architecture\napp a "A" @${spelling}(b)`);
    assert.ok(has(scopesOf(t, spelling), "support.function"), `@${spelling} is a directive`);
  }
});

test("carries every word the core knows", (g) => {
  // The generator reads the core's tables; this is the guard against it reading
  // one of them and quietly dropping another.
  const json = readFileSync(GRAMMAR, "utf8");
  for (const kind of [...SHAPE_KIND_NAMES, ...CONTAINER_KIND_NAMES]) {
    assert.ok(json.includes(kind), `${kind} is in the grammar`);
    const t = tokenize(g, `architecture\n${kind} x "X"`);
    assert.ok(has(scopesOf(t, kind), "storage.type"), `${kind} paints as a type`);
  }
  for (const op of ARCH_OPERATORS) {
    const t = tokenize(g, `architecture\na ${op} b`);
    assert.ok(has(scopesOf(t, op), "keyword.operator"), `${op} paints as an operator`);
  }
  for (const name of DIRECTIVE_NAMES) {
    const t = tokenize(g, `architecture\napp a "A" @${name}(0)`);
    assert.ok(has(scopesOf(t, name), "support.function"), `@${name} paints as a directive`);
  }
});


test("paints a URL as one link, not as a word, two numbers and a colour", (g) => {
  const t = tokenize(g, 'architecture\napp a "A" @link(https://ops.example.com:8080/run#3fa)');
  assert.ok(has(scopesOf(t, "link"), "support.function"), "@link is a directive");
  const url = t.find((x) => x.text.includes("ops.example.com"));
  assert.ok(url && has(url.scopes, "markup.underline.link"), "the URL is one link token");
  assert.ok(
    !t.some((x) => x.text.includes("#3fa") && has(x.scopes, "constant.other.color")),
    "and a fragment that happens to read as hex is not a colour swatch",
  );
});

test("paints a mailto the same way", (g) => {
  const t = tokenize(g, 'architecture\napp a "A" @link(mailto:team@example.com)');
  const url = t.find((x) => x.text.includes("team@example.com"));
  assert.ok(url && has(url.scopes, "markup.underline.link"), "a mailto is a link too");
});

// ── go ───────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const grammar = await load();
  let failures = 0;
  console.log("grammar");
  for (const [name, fn] of tests) {
    try {
      fn(grammar);
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
}

void run();
