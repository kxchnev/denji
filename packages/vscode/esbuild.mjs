/**
 * Two bundles, because the extension runs in two places at once.
 *
 * The host half is CJS on Node with `vscode` provided by the runtime. The
 * webview half is a browser script that carries the whole of `@kxchnev/denji` with it:
 * the preview parses, lays out and renders on every keystroke and on every frame
 * of a drag, and putting a postMessage round-trip in the middle of that loop
 * would be felt. Bundling is also what makes the extension self-contained —
 * `@kxchnev/denji` is ESM-only with no `require` condition, so it could not be required
 * from the host anyway.
 */
import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const watch = process.argv.includes("--watch");

/**
 * The typeface and the rasterizer, copied in beside the bundles.
 *
 * Files rather than modules because WebAssembly cannot be a module and a font is
 * bytes; one copy in the `.vsix` serves both halves. The brand marks are *not*
 * here — they arrive with `@kxchnev/denji` itself, which both bundles import, so
 * each carries its own 4.8 MB. That is the price of the package keeping its old
 * promise: importing it draws logos without being asked twice. See NEXT-MAJOR.md.
 */
function copyAssets() {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, "dist", "assets");
  const require_ = createRequire(import.meta.url);
  const core = dirname(require_.resolve("@kxchnev/denji/package.json"));
  mkdirSync(out, { recursive: true });
  for (const name of ["inter.ttf", "inter-latin.woff2", "inter-cyrillic.woff2"]) {
    cpSync(join(core, "assets", name), join(out, name));
  }
  cpSync(require_.resolve("@resvg/resvg-wasm/index_bg.wasm"), join(out, "resvg.wasm"));
}

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

copyAssets();

if (watch) {
  await Promise.all(builds.map(async (o) => (await context(o)).watch()));
} else {
  await Promise.all(builds.map(build));
}
