/**
 * The public identifiers, in one place.
 *
 * Every page interpolates these instead of spelling a name out, so the day the
 * package, the binary or the extension is renamed is one edit here rather than
 * a search across the site.
 */
export const PRODUCT = {
  /** The npm package: what `npm install` takes. */
  pkg: "@kxchnev/denji",
  /** The binary the package installs, and what `npx` resolves. */
  cli: "denji",
  /** How the extension is listed in the VS Code Marketplace. */
  extension: "kxchnev.denji",
  /** Namespace of the extension's settings — `denji.diagnostics`. */
  settings: "denji",
  /** Where the source lives. */
  repo: "https://github.com/kxchnev/denji",
} as const;
