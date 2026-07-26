#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";

const program = new Command();

program
  .name("power")
  .description("Diagrams with controllable layout — a mermaid alternative")
  .version("0.0.1");

program
  .command("render")
  .description("Render a diagram file to SVG")
  .argument("<input>", "input diagram file (.diagram / DSL)")
  .option("-o, --out <file>", "output SVG path (defaults to <input>.svg)")
  .action((input: string, opts: { out?: string }) => {
    // DSL parser lands in M3. Until then the CLI is wired but reports clearly.
    const _src = readFileSync(input, "utf8");
    void _src;
    const out = opts.out ?? input.replace(/\.[^.]+$/, "") + ".svg";
    void writeFileSync;
    console.error(
      "DSL parsing is not implemented yet (milestone M3).\n" +
        `Wiring is ready: would render "${input}" -> "${out}".\n` +
        "For now use the programmatic API — see README.",
    );
    process.exitCode = 1;
  });

program.parse();
