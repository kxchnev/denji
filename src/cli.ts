#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { parseFlowchart, DiagramParseError } from "./dsl/index.js";
import { toSvg } from "./index.js";

const program = new Command();

program
  .name("power")
  .description("Diagrams with controllable layout — a mermaid alternative")
  .version("0.0.1");

program
  .command("render")
  .description("Render a .pwr diagram file to SVG")
  .argument("<input>", "input diagram file (.pwr DSL)")
  .option("-o, --out <file>", "output SVG path (defaults to <input>.svg)")
  .action((input: string, opts: { out?: string }) => {
    const out = opts.out ?? input.replace(/\.[^.]+$/, "") + ".svg";
    let source: string;
    try {
      source = readFileSync(input, "utf8");
    } catch {
      console.error(`power: cannot read "${input}"`);
      process.exitCode = 1;
      return;
    }
    try {
      const svg = toSvg(parseFlowchart(source));
      writeFileSync(out, svg);
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
