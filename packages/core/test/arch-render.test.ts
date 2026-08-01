import { describe, expect, it } from "vitest";
import { parseArchitecture } from "../src/dsl/arch-parse.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import { renderArchitecture, type ArchRenderOptions } from "../src/render/arch-svg.js";
import { darkTheme, lightTheme } from "../src/render/theme.js";

function svg(src: string, opts: ArchRenderOptions = {}): string {
  const d = parseArchitecture(src);
  layoutArchitecture(d);
  return renderArchitecture(d, opts);
}

function sheet(out: string): string {
  return /<style>([\s\S]*?)<\/style>/.exec(out)![1]!;
}

const SAMPLE = `
architecture
  app gw "Gateway"
  database db "PG" @below(gw)
  gw -> db : http
`;

describe("themed rendering", () => {
  it("declares the theme as custom properties with literal fallbacks", () => {
    const out = svg(SAMPLE);
    const css = sheet(out);
    expect(css).toContain(`--pwr-app-fill:${lightTheme.slots.app.fill}`);
    expect(css).toContain(`fill:var(--pwr-app-fill,${lightTheme.slots.app.fill})`);
  });

  it("never emits a var() without a literal fallback", () => {
    // librsvg (the CLI raster path) and a canvas-rasterized <img> both handle
    // custom properties poorly; the fallback is what keeps those outputs right.
    for (const opts of [{}, { theme: "light" as const }, { theme: "dark" as const }]) {
      const css = sheet(svg(SAMPLE, opts));
      expect(css.match(/var\(--[a-z0-9-]+\)/g)).toBeNull();
    }
  });

  it("paints the two built-in themes differently", () => {
    const light = sheet(svg(SAMPLE, { theme: "light" }));
    const dark = sheet(svg(SAMPLE, { theme: "dark" }));
    expect(light).toContain(lightTheme.slots.app.fill!);
    expect(dark).toContain(darkTheme.slots.app.fill!);
    expect(light).not.toEqual(dark);
  });

  it("ships both palettes in auto and selector mode, and only there", () => {
    const auto = sheet(svg(SAMPLE, { themeMode: "auto" }));
    expect(auto).toContain("@media(prefers-color-scheme:dark)");
    expect(auto).not.toContain(".dark .pwr-");

    // A host with its own toggle gets the class and no media query — the query
    // would win back whenever the reader set the toggle against their OS.
    const sel = sheet(svg(SAMPLE, { themeMode: "selector" }));
    expect(sel).toContain(".dark .pwr-");
    expect(sel).not.toContain("prefers-color-scheme");

    for (const css of [auto, sel]) {
      expect(css).toContain(`--pwr-app-fill:${lightTheme.slots.app.fill}`);
      expect(css).toContain(`--pwr-app-fill:${darkTheme.slots.app.fill}`);
    }

    // Anything destined for a file is baked: an export must not repaint itself
    // on someone else's machine.
    for (const opts of [{}, { theme: "light" as const }, { theme: "dark" as const }]) {
      const css = sheet(svg(SAMPLE, opts));
      expect(css).not.toContain("@media");
      expect(css).not.toContain(".dark .pwr-");
    }
  });

  it("honours a custom dark selector", () => {
    const css = sheet(svg(SAMPLE, { themeMode: "selector", darkSelector: '[data-theme="dark"]' }));
    expect(css).toContain('[data-theme="dark"] .pwr-');
  });

  it("switches only the variables, so every rule is stated once", () => {
    for (const mode of ["auto", "selector"] as const) {
      expect(sheet(svg(SAMPLE, { themeMode: mode })).match(/\.pwr-app \.pwr-b\{/g)).toHaveLength(1);
    }
  });

  it("defaults to a fixed light palette", () => {
    expect(sheet(svg(SAMPLE))).toEqual(sheet(svg(SAMPLE, { theme: "light" })));
  });

  it("lets @theme in the document beat the caller's option", () => {
    const css = sheet(svg(`architecture @theme(dark)\napp a "A"`, { theme: "light", themeMode: "auto" }));
    expect(css).toContain(`--pwr-app-fill:${darkTheme.slots.app.fill}`);
    expect(css).not.toContain(`--pwr-app-fill:${lightTheme.slots.app.fill}`);
    // Naming a theme pins it: there is no second palette left to switch to.
    expect(css).not.toContain("@media");
  });
});

describe("the style cascade in CSS", () => {
  const src = `
    architecture
    style app { fill: #aaaaaa }
    style named { fill: #bbbbbb }
    app a "A" @style(named) @fill(#cccccc)
  `;

  it("orders theme, then kind selector, then named, then inline", () => {
    const css = sheet(svg(src));
    const at = (needle: string) => css.indexOf(needle);
    expect(at(`var(--pwr-app-fill`)).toBeLessThan(at(".pwr-app .pwr-b{fill:#aaaaaa}"));
    expect(at(".pwr-app .pwr-b{fill:#aaaaaa}")).toBeLessThan(at(".pwr-s-named .pwr-b{fill:#bbbbbb}"));
    expect(at(".pwr-s-named .pwr-b{fill:#bbbbbb}")).toBeLessThan(at(".pwr-i-a .pwr-b{fill:#cccccc}"));
  });

  it("gives every layer the same specificity so order alone decides", () => {
    const css = sheet(svg(src));
    for (const rule of [".pwr-app .pwr-b", ".pwr-s-named .pwr-b", ".pwr-i-a .pwr-b"]) {
      expect(css).toContain(rule);
    }
  });

  it("emits named styles in declaration order, not in order of use", () => {
    const css = sheet(
      svg(`
        architecture
        style first { fill: #111111 }
        style second { fill: #222222 }
        app a "A" @style(second) @style(first)
      `),
    );
    expect(css.indexOf(".pwr-s-first")).toBeLessThan(css.indexOf(".pwr-s-second"));
  });

  it("keeps a connection's line unfilled whatever a named style says", () => {
    const out = svg(`
      architecture
      style hot { fill: #3b1d1d }
      app a "A"
      app b "B" @rightOf(a)
      a -> b @style(hot)
    `);
    const css = sheet(out);
    // A CSS declaration outranks the fill="none" attribute, so the guard rule
    // has to come last.
    expect(css.trimEnd().endsWith(".pwr-e .pwr-b{fill:none}")).toBe(true);
  });

  it("does not emit rules for slots a style is never attached to", () => {
    const css = sheet(svg(`architecture\nstyle s { fill: #123456 }\napp a "A" @style(s)`));
    expect(css).toContain(".pwr-s-s .pwr-b{fill:#123456}");
    // `a` is a shape, so the connection-chip variant would never match.
    expect(css).not.toContain(".pwr-s-s .pwr-c");
  });
});

describe("generated ids", () => {
  it("scopes classes and marker ids per instance", () => {
    const a = svg(SAMPLE);
    const b = svg(`architecture\napp x "X"\napp y "Y" @rightOf(x)\nx -> y`);
    const scope = (s: string) => /class="pwr (pwr-[a-z0-9]+)"/.exec(s)![1]!;
    expect(scope(a)).not.toEqual(scope(b));
    // Two diagrams inlined in one page must not share `url(#…)` targets.
    expect(/id="([^"]+)"/.exec(a)![1]).not.toEqual(/id="([^"]+)"/.exec(b)![1]);
  });

  it("re-scopes when only the stylesheet differs", () => {
    // Same markup, different CSS: sharing a scope class would let the second
    // diagram's rules repaint the first one on the same page.
    const scope = (s: string) => /class="pwr (pwr-[a-z0-9]+)"/.exec(s)![1]!;
    expect(scope(svg(SAMPLE, { theme: "light" }))).not.toEqual(
      scope(svg(SAMPLE, { theme: "dark" })),
    );
    expect(scope(svg(SAMPLE))).not.toEqual(scope(svg(SAMPLE, { background: "#ffffff" })));
  });

  it("honours an explicit idPrefix and emits no duplicate ids", () => {
    const out = svg(SAMPLE, { idPrefix: "fixed" });
    expect(out).toContain('class="pwr fixed"');
    expect(out).toContain('id="fixed-a0"');
    const ids = [...out.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives each distinct arrowhead colour its own marker", () => {
    const out = svg(`
      architecture
      style hot { stroke: #ef4444 }
      app a "A"
      app b "B" @rightOf(a)
      app c "C" @below(a)
      a -> b @style(hot)
      a -> c
    `);
    const markers = [...out.matchAll(/<marker id="[^"]*-a(\d+)"/g)].map((m) => m[1]);
    expect(markers).toEqual(["0", "1"]);
    expect(out).toContain('fill="#ef4444"');
    expect(out).toContain('fill="var(--pwr-edge-stroke,#334155)"');
  });
});

describe("output shape", () => {
  it("renders exactly one style element and a parseable viewBox", () => {
    const out = svg(SAMPLE);
    expect(out.match(/<style>/g)).toHaveLength(1);
    // The docs read the size back out of this attribute.
    expect(/viewBox="0 0 ([\d.]+) ([\d.]+)"/.test(out)).toBe(true);
  });

  it("is deterministic", () => {
    expect(svg(SAMPLE)).toEqual(svg(SAMPLE));
  });

  it("refuses a theme value that would break out of the style element", () => {
    const evil = { ...lightTheme, slots: { ...lightTheme.slots, app: { fill: "red}</style>" } } };
    expect(() => svg(SAMPLE, { theme: evil })).toThrow(/Unsafe style value/);
  });
});
