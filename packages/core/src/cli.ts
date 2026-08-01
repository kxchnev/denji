#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import sharp from "sharp";
import { parseArchitecture } from "./dsl/arch-parse.js";
import { DiagramParseError } from "./dsl/error.js";
import { toSvg } from "./index.js";
import { resolveTheme } from "./render/theme.js";

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
