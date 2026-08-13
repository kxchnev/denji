import { describe, expect, it } from "vitest";
import { parseArchitecture } from "../src/dsl/arch-parse.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import { renderArchitecture, type ArchRenderOptions } from "../src/render/arch-svg.js";
import { capRx, capRy } from "../src/layout/arch/measure.js";
import { CORNER_RADIUS, DOCK_RUN } from "../src/layout/arch/route.js";
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

  it("puts a cylinder's label on its optical centre, not its geometric one", () => {
    // A cylinder's rim is drawn inside its own box, so the visible face starts a
    // whole rim in; text centred on the box reads as pushed into the rim.
    const label = (src: string, id: string) => {
      const d = parseArchitecture(src);
      layoutArchitecture(d);
      const out = renderArchitecture(d);
      const rect = d.nodes.find((n) => n.id === id)!.rect!;
      const [, x, y] = /<text class="pwr-t" x="([\d.]+)" y="([\d.]+)"/.exec(out)!;
      return {
        x: Number(x),
        y: Number(y),
        middle: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        // The seam-free face: past the rim, out to the far bulge.
        face: {
          x: (rect.x + 2 * capRx(rect.width) + rect.x + rect.width) / 2,
          y: (rect.y + 2 * capRy(rect.height) + rect.y + rect.height) / 2,
        },
      };
    };
    // The database's lid is on top, so its face — and its label — sit low.
    const db = label(`architecture\ndatabase db "PG"`, "db");
    expect(db.y).toBe(db.face.y);
    expect(db.y).toBeGreaterThan(db.middle.y);
    expect(db.x).toBe(db.middle.x);

    // The queue's rim is on the left, so the same shift is horizontal.
    const q = label(`architecture\nqueue q "Events"`, "q");
    expect(q.x).toBe(q.face.x);
    expect(q.x).toBeGreaterThan(q.middle.x);
    expect(q.y).toBe(q.middle.y);

    // A box has no rim to dodge either way.
    const app = label(`architecture\napp a "A"`, "a");
    expect(app.x).toBe(app.middle.x);
    expect(app.y).toBe(app.middle.y);
  });

  it("draws a group's corner texts in their own corners", () => {
    const out = svg(`
      architecture
      group g "G" {
        text "tl"
        text "tr" @corner(topRight)
        text "bl" @corner(bottomLeft)
        text "br" @corner(bottomRight)
        app a "A"
      }
    `);
    const at = (text: string) => {
      const m = new RegExp(
        `<text class="pwr-t" x="([\\d.]+)" y="([\\d.]+)"[^>]*text-anchor="(start|end)"[^>]*>${text}</text>`,
      ).exec(out)!;
      return { x: Number(m[1]), y: Number(m[2]), anchor: m[3] };
    };
    const g = /<rect class="pwr-b" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(
      out,
    )!;
    const [x, y, w, h] = g.slice(1, 5).map(Number) as [number, number, number, number];

    expect(at("tl")).toEqual({ x: x + 12, y: y + 28 + 10, anchor: "start" });
    expect(at("tr")).toEqual({ x: x + w - 12, y: y + 28 + 10, anchor: "end" });
    expect(at("bl")).toEqual({ x: x + 12, y: y + h - 10, anchor: "start" });
    expect(at("br")).toEqual({ x: x + w - 12, y: y + h - 10, anchor: "end" });
  });

  it("stacks several texts in one corner, hanging from the edge they are pinned to", () => {
    const out = svg(`
      architecture
      group g "G" {
        text "t1"
        text "t2"
        text "t3"
        text "b1" @corner(bottomRight)
        text "b2" @corner(bottomRight)
        app a "A"
      }
    `);
    const yOf = (text: string) =>
      Number(new RegExp(`<text class="pwr-t" x="[\\d.]+" y="([\\d.]+)"[^>]*>${text}</text>`).exec(out)![1]);
    const g = /<rect class="pwr-b" x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/.exec(out)!;
    const [y, h] = g.slice(1, 3).map(Number) as [number, number];

    // Source order reads downwards, and a line box is 20 tall.
    expect(yOf("t1")).toBe(y + 28 + 10);
    expect(yOf("t2")).toBe(yOf("t1") + 20);
    expect(yOf("t3")).toBe(yOf("t2") + 20);
    // The bottom stack is flush with the bottom edge, so its *last* line is.
    expect(yOf("b2")).toBe(y + h - 10);
    expect(yOf("b1")).toBe(yOf("b2") - 20);
  });

  it("escapes a corner text like any other label", () => {
    const out = svg(`architecture\ngroup g "G" {\ntext "a & <b>"\napp a "A"\n}`);
    expect(out).toContain("a &amp; &lt;b&gt;");
  });

  it("is deterministic", () => {
    expect(svg(SAMPLE)).toEqual(svg(SAMPLE));
  });

  it("refuses a theme value that would break out of the style element", () => {
    const evil = { ...lightTheme, slots: { ...lightTheme.slots, app: { fill: "red}</style>" } } };
    expect(() => svg(SAMPLE, { theme: evil })).toThrow(/Unsafe style value/);
  });
});

describe("link buttons", () => {
  const LINKED = `
architecture
  app gw "Gateway" @link(https://example.com/gw)
  service svc "Orders" @below(gw) @link(https://example.com/runbook) {
    database db "PG"
  }
  gw -> svc : http
`;

  it("draws one button per linked element and nothing for the rest", () => {
    const out = svg(LINKED);
    expect(out.match(/class="pwr-lk-p"/g)).toHaveLength(2);
    expect(svg(SAMPLE)).not.toContain("pwr-lk");
  });

  it("leaves a link-free diagram's stylesheet exactly as it was", () => {
    // The scope class is a hash of markup plus palette, so a rule that leaked
    // into every diagram would repaint every already-published one.
    const css = sheet(svg(SAMPLE));
    expect(css).not.toContain("--pwr-link-");
    expect(css).not.toContain(".pwr-lk");
  });

  it("draws the buttons over the connections", () => {
    // A connector docks within ten pixels of a corner, so an arrow really does
    // cross this patch — and a button with a line through it is not a button.
    const out = svg(LINKED);
    expect(out.indexOf('class="pwr-lks"')).toBeGreaterThan(out.lastIndexOf('class="pwr-e'));
  });

  it("carries its own chrome in both palettes, with literal fallbacks", () => {
    for (const theme of ["light", "dark"] as const) {
      const css = sheet(svg(LINKED, { theme }));
      const chrome = theme === "dark" ? darkTheme.link! : lightTheme.link!;
      expect(css).toContain(`--pwr-link-fill:${chrome.fill}`);
      expect(css).toContain(`fill:var(--pwr-link-fill,${chrome.fill})`);
      expect(css).toContain(`stroke:var(--pwr-link-glyph,${chrome.glyph})`);
      expect(css.match(/var\(--[a-z0-9-]+\)/g)).toBeNull();
    }
  });

  it("restates the chrome for the dark half of a two-palette render", () => {
    const css = sheet(svg(LINKED, { themeMode: "selector" }));
    expect(css).toContain(`--pwr-link-fill:${lightTheme.link!.fill}`);
    expect(css).toContain(`--pwr-link-fill:${darkTheme.link!.fill}`);
  });

  it("is inert markup by default, and an anchor only when asked", () => {
    // An <a> is live in a page, dead in the VS Code webview and dropped by the
    // rasterizer, so the viewers hit-test instead and only a standalone .svg
    // asks for the anchor.
    const plain = svg(LINKED);
    expect(plain).not.toContain("<a ");
    expect(plain).not.toMatch(/href="(?!#)/);

    const anchored = svg(LINKED, { linkAnchors: true });
    expect(anchored.match(/<a class="pwr-lk"/g)).toHaveLength(2);
    expect(anchored).toContain('href="https://example.com/gw"');
    expect(anchored).toContain('rel="noopener noreferrer"');
  });

  it("escapes the URL wherever it lands", () => {
    const src = 'architecture\napp a "A" @link(https://x.com/a?b=1&c=2)';
    const out = svg(src, { linkAnchors: true });
    expect(out).toContain('href="https://x.com/a?b=1&amp;c=2"');
    expect(out).toContain("<title>https://x.com/a?b=1&amp;c=2</title>");
    expect(out).not.toContain("b=1&c=2");
  });

  it("inlines the glyph, like every other mark in the output", () => {
    const out = svg(LINKED);
    expect(out).not.toContain("<image");
    expect(out).not.toContain("<use");
    expect(out).toContain('class="pwr-lk-i"');
  });

  it("is deterministic", () => {
    expect(svg(LINKED)).toBe(svg(LINKED));
  });
});

describe("labels on two lines", () => {
  const texts = (out: string): Array<{ x: number; y: number; text: string }> =>
    [...out.matchAll(/<text class="pwr-t" x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]*)<\/text>/g)].map(
      (m) => ({ x: Number(m[1]), y: Number(m[2]), text: m[3]! }),
    );

  it("draws one text element per line, never a tspan", () => {
    const out = svg('architecture\n  app a "Storefront web service"\n');
    const lines = texts(out);
    expect(lines).toHaveLength(2);
    expect(out).not.toContain("<tspan");
    expect(lines[1]!.y - lines[0]!.y).toBe(18);
  });

  it("centres the block where a single line sits", () => {
    // A one-line and a two-line label share a box, so the pair must straddle
    // exactly the point the single line sits on.
    const one = texts(svg('architecture\n  app a "A"\n'));
    const two = texts(svg('architecture\n  app a "Storefront web service"\n'));
    expect(one).toHaveLength(1);
    expect((two[0]!.y + two[1]!.y) / 2).toBe(one[0]!.y);
    expect(two[0]!.x).toBe(two[1]!.x);
  });

  it("escapes every line it broke the label into", () => {
    const out = svg('architecture\n  app a "a&b <one> and c&d <two>"\n');
    expect(out).toContain("&amp;");
    expect(out).toContain("&lt;one&gt;");
    expect(out).toContain("&lt;two&gt;");
    expect(texts(out)).toHaveLength(2);
  });

  it("keeps a wrapped label on the barrel's face, clear of the lid", () => {
    const out = svg('architecture\n  database db "Order history archive"\n');
    const lid = /<ellipse class="pwr-b" cx="[-\d.]+" cy="([-\d.]+)" rx="[-\d.]+" ry="([-\d.]+)"/.exec(out)!;
    const cy = Number(lid[1]);
    const ry = Number(lid[2]);
    const lines = texts(out);
    expect(lines.length).toBeGreaterThan(1);
    // The lid's underside is at cy + ry; every line sits below it.
    for (const l of lines) expect(l.y).toBeGreaterThan(cy + ry);
  });

  it("gives the database a lid rather than a slot", () => {
    const out = svg('architecture\n  app a "A"\n  database db "B" @rightOf(a)\n');
    const ry = Number(/<ellipse class="pwr-b"[^>]*ry="([-\d.]+)"/.exec(out)![1]);
    expect(ry).toBe(12);
  });

  it("keeps the mark centred against a pair of lines", () => {
    const marks = (out: string) =>
      [...out.matchAll(/<path class="pwr-ic[^"]*" transform="translate\([-\d.]+ ([-\d.]+)\)/g)].map(
        (m) => Number(m[1]),
      );
    const one = marks(svg('architecture\n  app a "A" @icon(react)\n  app b "Storefront web service"\n'));
    const two = marks(
      svg('architecture\n  app a "Storefront web service" @icon(react)\n  app b "B"\n'),
    );
    // Same box, same mark position, whether the label took one line or two.
    expect(one[0]).toBe(two[0]);
  });

  it("is deterministic with a wrapped label", () => {
    const src = 'architecture\n  app a "Storefront web service"\n  database b "Order archive" @below(a)\n';
    expect(svg(src)).toBe(svg(src));
  });
});

/**
 * A bend is read against the other bends on the same drawing, so an even radius
 * matters more than a wide one. These read the radius back out of the emitted
 * path — the distance from where the straight run stops to the corner the
 * quadratic bends through — because that is the number a reader actually sees.
 */
describe("rounded corners", () => {
  /** Every connector's path data, in document order. */
  const connectors = (out: string): string[] =>
    [...out.matchAll(/<g class="pwr-e[^"]*"><path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!);

  /** The radius of each quadratic corner, and how many smooth transitions. */
  function corners(d: string): { radii: number[]; blends: number } {
    const nums = (t: string): number[] => t.slice(1).trim().split(/[\s,]+/).map(Number);
    const radii: number[] = [];
    let blends = 0;
    let at: { x: number; y: number } | null = null;
    for (const tok of d.match(/[MLQC][^MLQC]*/g) ?? []) {
      const n = nums(tok);
      if (tok[0] === "M" || tok[0] === "L") at = { x: n[0]!, y: n[1]! };
      else if (tok[0] === "Q") {
        radii.push(Math.hypot(n[0]! - at!.x, n[1]! - at!.y));
        at = { x: n[2]!, y: n[3]! };
      } else {
        blends++;
        at = { x: n[4]!, y: n[5]! };
      }
    }
    return { radii, blends };
  }

  const WIRED = [
    "architecture",
    '  app edge "Edge"',
    '  app one "One"',
    '  app two "Two"',
    '  app three "Three"',
    '  database store "Store"',
    "  edge -> one",
    "  edge -> two",
    "  edge -> three",
    "  one -> store",
    "  two -> store",
    "  three -> store",
    "  edge -> store",
  ].join("\n");

  it("rounds every corner by the same radius, wherever it falls on the path", () => {
    // The bend beside a box used to come out at 6 and the one in open space at
    // 20, on the same line: the straight run out of a dock is DOCK_RUN long, and
    // both the half-segment cap and the arrowhead's room are measured off it.
    const drawn = connectors(svg(WIRED)).flatMap((d) => corners(d).radii);
    expect(drawn.length).toBeGreaterThan(8);
    expect([...new Set(drawn.map((r) => Math.round(r * 100) / 100))]).toEqual([CORNER_RADIUS]);
  });

  it("draws a step too short to round as one transition, not two kinks", () => {
    // An app and a narrower database in one service: their docks end up a few
    // pixels out of line, so the router steps sideways by 7 — less than the cut
    // a corner needs, and once upon a time two hard kinks that close together.
    const src = [
      "architecture",
      '  service orders "Orders" {',
      '    app api "Orders API"',
      '    database db "Postgres"',
      "    api -> db",
      "  }",
      '  service pay "Payments" {',
      '    app papi "Payments API"',
      '    database pdb "Postgres"',
      "    papi -> pdb",
      "  }",
      "  api -> papi",
    ].join("\n");
    const drawn = connectors(svg(src)).map(corners);
    expect(drawn.reduce((n, c) => n + c.blends, 0)).toBeGreaterThan(0);
    // And the step never leaves a corner tighter than the radius behind it.
    for (const c of drawn) {
      for (const r of c.radii) expect(r).toBeCloseTo(CORNER_RADIUS, 5);
    }
  });

  it("keeps a straight run at each end for the arrowhead to sit on", () => {
    // What is left of the dock's run once the first corner has taken its cut:
    // the radius is half that run, so half of it survives — and that half is the
    // arrowhead's length. The three constants meet here, which is the whole
    // reason one radius fits everywhere.
    for (const d of connectors(svg(WIRED))) {
      const first = /^M ([-\d.]+) ([-\d.]+) L ([-\d.]+) ([-\d.]+)/.exec(d)!;
      const run = Math.hypot(Number(first[3]) - Number(first[1]), Number(first[4]) - Number(first[2]));
      expect(run).toBeGreaterThanOrEqual(DOCK_RUN - CORNER_RADIUS - 0.01);
    }
  });
});
