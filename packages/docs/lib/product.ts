/**
 * The public identifiers, in one place.
 *
 * The name is not settled yet, and an installation page cannot be written
 * without one — so every page interpolates these instead of spelling a name out.
 * Picking a name is then this file plus the real renames (the package's `name`
 * and `bin`, and the extension's setting ids), not a search across the site.
 */
export const PRODUCT = {
  /** The npm package: what `npm install` takes. */
  pkg: "<package>",
  /** The binary the package installs, and what `npx` resolves. */
  cli: "<package>",
  /** How the extension is listed in the VS Code Marketplace. */
  extension: "<extension>",
  /** Namespace of the extension's settings — `<prefix>.diagnostics`. */
  settings: "<package>",
} as const;
