#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { NAME } from "./brand.js";
import { checkDiagram } from "./check.js";
import { ICON_ALIASES, ICON_NAMES, ICON_TITLES, ICONSET_VERSION } from "./model/icon.js";
import { POPULAR_ICONS } from "./model/icon.popular.js";
import { parseArchitecture } from "./dsl/arch-parse.js";
import { DiagramParseError } from "./dsl/error.js";
import { toJpeg, toPng, toSvgFile } from "./export.js";
import { layoutArchitecture } from "./layout/arch/index.js";
import { resolveTheme } from "./render/theme.js";
import { watchDiagram } from "./watch.js";

const program = new Command();

/**
 * The one version anyone can trust: the manifest's. A second copy here drifts
 * from the first release onwards, and `--version` is the one answer nobody
 * double-checks. `dist/cli.js` → the package root, shipped via `files`.
 */
function version(): string {
  try {
    const manifest = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    return (JSON.parse(manifest) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

program
  .name(NAME)
  .description("Architecture diagrams that lay themselves out")
  .version(version());

/**
 * The shipped assets, loaded when a command actually needs them.
 *
 * Nothing here is imported at the top of the file: `check` and `spec` draw
 * nothing, and charging them for 4.8 MB of brand marks — let alone 2.4 MB of
 * rasterizer — is how a linter comes to take a second to start.
 */
async function loadAssets(format: "svg" | "png" | "jpeg"): Promise<void> {
  const assets = await import("./assets-node.js");
  assets.loadIcons();
  assets.loadFont(undefined, { outlines: format !== "svg" });
  if (format !== "svg") assets.loadRasterizer();
}

function formatFor(out: string): "svg" | "png" | "jpeg" | null {
  const ext = out.slice(out.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "svg") return "svg";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  return null;
}

program
  .command("render")
  .description("Render a .denji architecture diagram to SVG, PNG, or JPEG")
  .argument("<input>", "input diagram file (.denji DSL)")
  .option("-o, --out <file>", "output path: .svg/.png/.jpg (defaults to <input>.svg)")
  .option("-t, --theme <name>", "light or dark", "light")
  .action(async (input: string, opts: { out?: string; theme: string }) => {
    const out = opts.out ?? input.replace(/\.[^.]+$/, "") + ".svg";
    const format = formatFor(out);
    if (opts.theme !== "light" && opts.theme !== "dark") {
      console.error(`${NAME}: unknown theme "${opts.theme}" (use light or dark)`);
      process.exitCode = 1;
      return;
    }
    if (!format) {
      const ext = out.slice(out.lastIndexOf("."));
      console.error(`${NAME}: unsupported output format "${ext}" (use .svg, .png or .jpg)`);
      process.exitCode = 1;
      return;
    }
    let source: string;
    try {
      source = readFileSync(input, "utf8");
    } catch {
      console.error(`${NAME}: cannot read "${input}"`);
      process.exitCode = 1;
      return;
    }
    try {
      const name = opts.theme;
      const diagram = parseArchitecture(source);
      await loadAssets(format);
      layoutArchitecture(diagram);
      // The same three functions the extension and the playground call, so the
      // file this writes is the file they write.
      if (format === "svg") {
        writeFileSync(out, toSvgFile(diagram, { theme: name }));
      } else {
        const bytes = format === "png"
          ? await toPng(diagram, { theme: name })
          : await toJpeg(diagram, { theme: name });
        writeFileSync(out, bytes);
      }
      console.log(`wrote ${out}`);
    } catch (err) {
      if (err instanceof DiagramParseError) {
        console.error(`${NAME}: ${err.message}`);
      } else {
        console.error(`${NAME}: ${(err as Error).message}`);
      }
      process.exitCode = 1;
    }
  });

/** `-` means stdin, so `check` can sit in a pipe without a temp file. */
function readSource(input: string): string {
  return readFileSync(input === "-" ? 0 : input, "utf8");
}

program
  .command("watch")
  .description("Serve a live preview of a .denji file that re-renders as it is edited")
  .argument("<input>", "input diagram file (.denji DSL)")
  .option("-p, --port <n>", "port to serve on (takes the next free one if busy)", "4400")
  .option("-t, --theme <name>", "pin the palette to light or dark (default: follow the device)")
  .option("--no-open", "do not open a browser")
  .action(async (input: string, opts: { port: string; theme?: string; open: boolean }) => {
    if (opts.theme !== undefined && opts.theme !== "light" && opts.theme !== "dark") {
      console.error(`${NAME}: unknown theme "${opts.theme}" (use light or dark)`);
      process.exitCode = 1;
      return;
    }
    const port = Number(opts.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`${NAME}: invalid port "${opts.port}"`);
      process.exitCode = 1;
      return;
    }
    try {
      // The same assets `render` loads, minus the rasterizer: a preview is the
      // picture the file will be, so it needs the marks and the typeface. Missing
      // them is not loud — a diagram simply draws without its logos, which is how
      // this went unnoticed once already.
      await loadAssets("svg");
      await watchDiagram(input, { port, theme: opts.theme, open: opts.open });
    } catch (err) {
      console.error(`${NAME}: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command("check")
  .description("Report errors and layout problems in a .denji file without rendering it")
  .argument("<input>", "input diagram file, or - for stdin")
  .option("--json", "machine-readable diagnostics on stdout")
  .option("--strict", "exit non-zero on warnings too")
  .action((input: string, opts: { json?: boolean; strict?: boolean }) => {
    let source: string;
    try {
      source = readSource(input);
    } catch {
      console.error(`${NAME}: cannot read "${input}"`);
      process.exitCode = 1;
      return;
    }
    const { diagnostics } = checkDiagram(source);
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const warnings = diagnostics.length - errors;
    const where = input === "-" ? "<stdin>" : input;

    if (opts.json) {
      console.log(JSON.stringify({ file: where, errors, warnings, diagnostics }, null, 2));
    } else if (diagnostics.length === 0) {
      console.log(`${where}: ok`);
    } else {
      for (const d of diagnostics) {
        const at = d.line === null ? where : `${where}:${d.line}:${d.col}`;
        console.error(`${at}  ${d.severity}  ${d.message}  [${d.code}]`);
        // The caret only means anything when the column is a real offset. When
        // the finding also knows how far it reaches, underline that instead of
        // pointing at its first character.
        if (d.srcLine) {
          const col = d.col ?? 1;
          const width = Math.max(1, (d.endCol ?? col + 1) - col);
          console.error(`    ${d.srcLine}`);
          console.error(`    ${" ".repeat(Math.max(0, col - 1))}^${"~".repeat(width - 1)}`);
        }
      }
      console.error(`\n${errors} error(s), ${warnings} warning(s)`);
    }
    if (errors > 0 || (opts.strict && warnings > 0)) process.exitCode = 1;
  });

program
  .command("icons")
  .description("Find a brand mark by name — every Simple Icons slug is bundled")
  .argument("[query]", "part of a slug, a title or a shorthand")
  .action((query?: string) => {
    const aliasesOf = new Map<string, string[]>();
    for (const [from, to] of Object.entries(ICON_ALIASES)) {
      aliasesOf.set(to, [...(aliasesOf.get(to) ?? []), from]);
    }
    const missing =
      "AWS, Azure, Amazon and Oracle asked Simple Icons to drop their marks, so\n" +
      "nothing of theirs is here; `openjdk` stands in for Java and `googlecloud`\n" +
      "is. Generic ideas — a database, a user, a browser, a mobile app — have no\n" +
      "mark at all. Declare an `icon` block for one of your own.";

    if (!query) {
      // Three and a half thousand names help nobody — least of all a model,
      // which would spend its context on a list it has to search anyway. What
      // it needs before typing is a starting vocabulary.
      console.log(
        `${ICON_NAMES.length} marks bundled — the whole of Simple Icons ${ICONSET_VERSION} — ` +
          `plus ${Object.keys(ICON_ALIASES).length} shorthands.\n` +
          `Search by name, title or shorthand:  ${NAME} icons <text>\n\n` +
          "Common ones:\n" +
          POPULAR_ICONS.reduce<string[]>((lines, name, i) => {
            if (i % 6 === 0) lines.push("  ");
            lines[lines.length - 1] += `${name} `;
            return lines;
          }, []).join("\n") +
          `\n\n${missing}`,
      );
      return;
    }

    const q = query.toLowerCase();
    const titleOf = (name: string) => ICON_TITLES[name] ?? name;
    /** Ranked, so `denji icons go` does not open on `agora` and `algolia`. */
    const rank = (name: string): number => {
      const title = titleOf(name).toLowerCase();
      const shorthands = aliasesOf.get(name) ?? [];
      if (name === q || shorthands.includes(q)) return 0;
      if (name.startsWith(q)) return 1;
      if (shorthands.some((a) => a.startsWith(q))) return 2;
      if (title.startsWith(q)) return 3;
      if (name.includes(q)) return 4;
      if (title.includes(q)) return 5;
      return shorthands.some((a) => a.includes(q)) ? 6 : 7;
    };

    const hits = ICON_NAMES.filter((name) => rank(name) < 7).sort(
      (a, b) => rank(a) - rank(b) || a.localeCompare(b),
    );

    if (hits.length === 0) {
      console.error(`No mark matches "${query}".\n${missing}`);
      process.exitCode = 1;
      return;
    }

    // A search that answers with hundreds of lines is a search that failed.
    const LIMIT = 40;
    const shown = hits.slice(0, LIMIT);
    const width = Math.max(...shown.map((n) => n.length)) + 2;
    for (const name of shown) {
      const shorthands = aliasesOf.get(name);
      console.log(
        `  ${name.padEnd(width)}${titleOf(name)}` +
          (shorthands ? `  (${shorthands.join(", ")})` : ""),
      );
    }
    console.log(
      hits.length > LIMIT
        ? `\n${LIMIT} of ${hits.length} matches shown — narrow the search.`
        : `\n${hits.length} of ${ICON_NAMES.length} marks. Use the name on the left as @icon(name).`,
    );
  });

program
  .command("spec")
  .description("Print the .denji language reference — pipe it into any model that has no file access")
  .action(() => {
    // dist/cli.js → the package root. Shipped via `files` in package.json.
    const spec = new URL("../LANGUAGE.md", import.meta.url);
    try {
      process.stdout.write(readFileSync(spec, "utf8"));
    } catch {
      console.error(`${NAME}: LANGUAGE.md is missing from this install`);
      process.exitCode = 1;
    }
  });

program.parse();
