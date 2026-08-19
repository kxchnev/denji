import { describe, expect, it } from "vitest";
import * as pkg from "../src/index.js";
import { registeredIcons } from "../src/resources.js";

/**
 * What importing the package has always meant.
 *
 * Every release before 1.2.0 carried the brand marks as part of the import: a
 * consumer wrote `toSvg(parse(source))` and got logos, having asked for nothing.
 * The engine now keeps its artwork in a registry so that products which can load
 * a file get a small bundle — but the entry point still fills that registry
 * itself, because taking the logos away from working code is not a thing a minor
 * release may do.
 *
 * These are the assertions that make that promise checkable rather than
 * remembered. When 2.0 drops the side effect (NEXT-MAJOR.md), this file is what
 * says so out loud — it should be deleted in the same commit, deliberately.
 */
describe("importing the package entry", () => {
  it("registers the bundled artwork with no loader called", () => {
    const marks = registeredIcons();
    expect(marks.postgresql?.path).toBeTruthy();
    // Same object, not a second copy parsed from somewhere else: this is the
    // bundled table, put in by `index.ts` itself.
    expect(marks.postgresql).toBe(pkg.ICONS.postgresql);
  });

  it("draws a mark straight from the entry point, as 1.1 did", () => {
    const diagram = pkg.parse('architecture\n  app a "A" @icon(postgresql)\n');
    const svg = pkg.toSvg(diagram);
    expect(svg).toContain("denji-icon-postgresql");
  });

  it("still exports ICONS by name", () => {
    expect(Object.keys(pkg.ICONS).length).toBeGreaterThan(3000);
    expect(pkg.ICONS.postgresql?.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("resolves shorthands out of the bundled table", () => {
    expect(pkg.resolveIcon("pg")).toBe(pkg.ICONS.postgresql);
  });
});
