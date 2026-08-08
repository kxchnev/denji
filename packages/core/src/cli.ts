#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import sharp from "sharp";
import { checkDiagram } from "./check.js";
import { ICON_ALIASES, ICON_NAMES } from "./model/icon.js";
import { parseArchitecture } from "./dsl/arch-parse.js";
import { DiagramParseError } from "./dsl/error.js";
import { toSvg } from "./index.js";
import { resolveTheme } from "./render/theme.js";
import { watchDiagram } from "./watch.js";

const program = new Command();

program
  .name("power")
  .description("Architecture diagrams with controllable, relative layout")
  .version("0.0.1");

/** Render at 2x the diagram's own units so raster output stays crisp. */
const RASTER_DENSITY = 144;

function formatFor(out: string): "svg" | "png" | "jpeg" | null {
  const ext = out.slice(out.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "svg") return "svg";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  return null;
}

program
  .command("render")
  .description("Render a .pwr architecture diagram to SVG, PNG, or JPEG")
  .argument("<input>", "input diagram file (.pwr DSL)")
  .option("-o, --out <file>", "output path: .svg/.png/.jpg (defaults to <input>.svg)")
  .option("-t, --theme <name>", "light or dark", "light")
  .action(async (input: string, opts: { out?: string; theme: string }) => {
    const out = opts.out ?? input.replace(/\.[^.]+$/, "") + ".svg";
    const format = formatFor(out);
    if (opts.theme !== "light" && opts.theme !== "dark") {
      console.error(`power: unknown theme "${opts.theme}" (use light or dark)`);
      process.exitCode = 1;
      return;
    }
    if (!format) {
      const ext = out.slice(out.lastIndexOf("."));
      console.error(`power: unsupported output format "${ext}" (use .svg, .png or .jpg)`);
      process.exitCode = 1;
      return;
    }
    let source: string;
    try {
      source = readFileSync(input, "utf8");
    } catch {
      console.error(`power: cannot read "${input}"`);
      process.exitCode = 1;
      return;
    }
    try {
      const name = opts.theme;
      const diagram = parseArchitecture(source);
      const svg = toSvg(diagram, { render: { theme: name } });
      if (format === "svg") {
        writeFileSync(out, svg);
      } else {
        // JPEG has no alpha, so the transparent backdrop must be flattened onto
        // the theme's own surface — white would ruin a dark diagram.
        const surface = resolveTheme(diagram.theme ?? name).surface;
        const raster = await sharp(Buffer.from(svg), { density: RASTER_DENSITY })
          .flatten(format === "jpeg" ? { background: surface } : false)
          [format]()
          .toBuffer();
        writeFileSync(out, raster);
      }
      console.log(`wrote ${out}`);
    } catch (err) {
      if (err instanceof DiagramParseError) {
        console.error(`power: ${err.message}`);
      } else {
        console.error(`power: ${(err as Error).message}`);
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
  .description("Serve a live preview of a .pwr file that re-renders as it is edited")
  .argument("<input>", "input diagram file (.pwr DSL)")
  .option("-p, --port <n>", "port to serve on (takes the next free one if busy)", "4400")
  .option("-t, --theme <name>", "pin the palette to light or dark (default: follow the device)")
  .option("--no-open", "do not open a browser")
  .action(async (input: string, opts: { port: string; theme?: string; open: boolean }) => {
    if (opts.theme !== undefined && opts.theme !== "light" && opts.theme !== "dark") {
      console.error(`power: unknown theme "${opts.theme}" (use light or dark)`);
      process.exitCode = 1;
      return;
    }
    const port = Number(opts.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`power: invalid port "${opts.port}"`);
      process.exitCode = 1;
      return;
    }
    try {
      await watchDiagram(input, { port, theme: opts.theme, open: opts.open });
    } catch (err) {
      console.error(`power: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command("check")
  .description("Report errors and layout problems in a .pwr file without rendering it")
  .argument("<input>", "input diagram file, or - for stdin")
  .option("--json", "machine-readable diagnostics on stdout")
  .option("--strict", "exit non-zero on warnings too")
  .action((input: string, opts: { json?: boolean; strict?: boolean }) => {
    let source: string;
    try {
      source = readSource(input);
    } catch {
      console.error(`power: cannot read "${input}"`);
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
  .description("List the bundled icon names, so you can pick one without guessing")
  .action(() => {
    console.log(`${ICON_NAMES.length} bundled marks:\n`);
    // Four columns keeps the whole set on one screen.
    const width = Math.max(...ICON_NAMES.map((n) => n.length)) + 2;
    for (let i = 0; i < ICON_NAMES.length; i += 4) {
      console.log(
        "  " +
          ICON_NAMES.slice(i, i + 4)
            .map((n) => n.padEnd(width))
            .join("")
            .trimEnd(),
      );
    }
    console.log("\naliases:\n");
    for (const [alias, target] of Object.entries(ICON_ALIASES)) {
      console.log(`  ${alias.padEnd(width)}→ ${target}`);
    }
    console.log(
      "\nThese are technology and vendor marks only — there is no generic device,\n" +
        "browser or person glyph. `power icon <slug>` emits a block for any other\n" +
        "Simple Icons slug; see https://simpleicons.org.",
    );
  });

program
  .command("spec")
  .description("Print the .pwr language reference — pipe it into any model that has no file access")
  .action(() => {
    // dist/cli.js → the package root. Shipped via `files` in package.json.
    const spec = new URL("../LANGUAGE.md", import.meta.url);
    try {
      process.stdout.write(readFileSync(spec, "utf8"));
    } catch {
      console.error("power: LANGUAGE.md is missing from this install");
      process.exitCode = 1;
    }
  });

program
  .command("icon")
  .description("Print an `icon` block for any Simple Icons slug, ready to paste into a .pwr file")
  .argument("<slug>", "Simple Icons slug, e.g. vercel — see https://simpleicons.org")
  .option("-n, --name <name>", "name to declare it under (defaults to the slug)")
  .action(async (slug: string, opts: { name?: string }) => {
    // `simple-icons` is a devDependency: the ~40 bundled marks are generated
    // from it at build time, and this command is the only thing that needs the
    // other few thousand at runtime. Loading it lazily keeps the published
    // package dependency-free for everyone who does not run it.
    let icons: Record<string, { path: string; hex: string; title: string } | undefined>;
    try {
      icons = (await import("simple-icons")) as never;
    } catch {
      console.error("power: this command needs simple-icons — run `npm i -D simple-icons`");
      process.exitCode = 1;
      return;
    }
    const key = `si${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
    const icon = icons[key];
    if (!icon) {
      console.error(`power: no icon "${slug}" in simple-icons (check the slug on simpleicons.org)`);
      process.exitCode = 1;
      return;
    }
    const name = opts.name ?? slug;
    console.log(`icon ${name} {`);
    console.log(`  path: ${icon.path}`);
    console.log(`  color: #${icon.hex.toLowerCase()}`);
    console.log(`  title: ${icon.title}`);
    console.log(`}`);
  });

program.parse();
