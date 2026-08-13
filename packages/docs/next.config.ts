import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/**
 * The dev server gets a directory of its own, and the build keeps the default.
 *
 * They must not share one: `next build` run while `next dev` is up overwrites
 * the running server's chunks, and it then dies on `Cannot find module
 * './NNN.js'` until someone restarts it — the one thing `npm run docs` exists to
 * avoid.
 *
 * It has to be the *dev* side that moves. Under `output: "export"` a custom
 * `distDir` does not relocate the build's working files at all — it relocates
 * the exported site, while `server/` and `static/` are still written to `.next`
 * (measured: three ways of setting it, same result). So pointing the build
 * elsewhere protects nothing, while pointing the dev server elsewhere puts it
 * out of the build's reach for good.
 *
 * `NEXT_DIST_DIR` overrides it, which is what a second dev server needs so the
 * two do not fight over one directory:
 * `NEXT_DIST_DIR=.next-dev2 next dev -p 3005`.
 */
export default function config(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    distDir: process.env.NEXT_DIST_DIR ?? (dev ? ".next-dev" : ".next"),
    // Static export so the docs can be hosted anywhere and embedded as an iframe.
    output: "export",
    trailingSlash: true,
    images: { unoptimized: true },
    reactStrictMode: true,
  };
}
