#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import sharp from "sharp";
import { parseArchitecture } from "./dsl/arch-parse.js";
import { DiagramParseError } from "./dsl/error.js";
import { toSvg } from "./index.js";

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
  .action(async (input: string, opts: { out?: string }) => {
    const out = opts.out ?? input.replace(/\.[^.]+$/, "") + ".svg";
    const format = formatFor(out);
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
      const svg = toSvg(parseArchitecture(source));
      if (format === "svg") {
        writeFileSync(out, svg);
      } else {
        const raster = await sharp(Buffer.from(svg), { density: RASTER_DENSITY })
          .flatten(format === "jpeg" ? { background: "#ffffff" } : false)
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

program.parse();
