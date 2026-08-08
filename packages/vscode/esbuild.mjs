/**
 * Two bundles, because the extension runs in two places at once.
 *
 * The host half is CJS on Node with `vscode` provided by the runtime. The
 * webview half is a browser script that carries the whole of `power` with it:
 * the preview parses, lays out and renders on every keystroke and on every frame
 * of a drag, and putting a postMessage round-trip in the middle of that loop
 * would be felt. Bundling is also what makes the extension self-contained —
 * `power` is ESM-only with no `require` condition, so it could not be required
 * from the host anyway.
 */
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const common = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  target: "es2022",
};

/** @type {import("esbuild").BuildOptions[]} */
const builds = [
  {
    ...common,
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
    format: "cjs",
    platform: "node",
    // Supplied by VS Code itself; bundling it would shadow the real thing.
    external: ["vscode"],
  },
  {
    ...common,
    entryPoints: ["webview/main.ts"],
    outfile: "dist/webview.js",
    format: "iife",
    platform: "browser",
  },
  {
    ...common,
    entryPoints: ["webview/style.css"],
    outfile: "dist/webview.css",
  },
];

if (watch) {
  await Promise.all(builds.map(async (o) => (await context(o)).watch()));
} else {
  await Promise.all(builds.map(build));
}
