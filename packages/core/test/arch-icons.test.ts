import { describe, expect, it } from "vitest";
import { parseArchitecture } from "../src/dsl/arch-parse.js";
import { DiagramParseError } from "../src/dsl/error.js";
import { architecture } from "../src/model/arch-builder.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import { renderArchitecture } from "../src/render/arch-svg.js";
import { ICONS, ICON_ALIASES, fromSimpleIcon, resolveIcon } from "../src/model/icon.js";
import type { ArchDiagram, Container, Shape } from "../src/model/arch.js";

function shape(d: ArchDiagram, id: string): Shape {
  const n = d.nodes.find((x) => x.id === id);
  if (!n || n.type !== "shape") throw new Error(`no shape ${id}`);
  return n;
}
function container(d: ArchDiagram, id: string): Container {
  const n = d.nodes.find((x) => x.id === id);
  if (!n || n.type !== "container") throw new Error(`no container ${id}`);
  return n;
}
function reason(src: string): string {
  try {
    parseArchitecture(src);
  } catch (e) {
    return (e as DiagramParseError).reason ?? (e as Error).message;
  }
  throw new Error("expected throw");
}
function svg(src: string, dark = false): string {
  const d = parseArchitecture(src);
  layoutArchitecture(d);
  return renderArchitecture(d, dark ? { theme: "dark" } : {});
}

describe("the bundled icon set", () => {
  it("ships marks that are safe to inline", () => {
    // The registry is generated; this is the guard against a bad generation
    // reaching the output, where escaping would not help.
    const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE,.+\-\s]+$/;
    expect(Object.keys(ICONS).length).toBeGreaterThan(30);
    for (const [name, icon] of Object.entries(ICONS)) {
      expect(name, `${name} is not a usable CSS class suffix`).toMatch(/^[a-z][a-z0-9]*$/);
      expect(icon.path.length, `${name} has no path`).toBeGreaterThan(0);
      expect(PATH.test(icon.path), `${name} has an unsafe path`).toBe(true);
      expect(icon.color, `${name} has no brand colour`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("points every alias at a real icon", () => {
    for (const [from, to] of Object.entries(ICON_ALIASES)) {
      expect(ICONS[to], `alias ${from} → ${to}`).toBeDefined();
    }
  });

  it("gives near-black brands something visible on dark", () => {
    expect(ICONS.openjdk!.darkColor).toBeDefined();
    expect(ICONS.postgresql!.darkColor).toBeUndefined(); // already bright enough
  });

  it("adapts a simple-icons entry", () => {
    const si = { path: "M0 0H24V24H0Z", hex: "FF6600", title: "Acme" };
    expect(fromSimpleIcon(si)).toEqual({ path: "M0 0H24V24H0Z", color: "#ff6600", title: "Acme" });
  });
});

describe("@icon", () => {
  it("attaches a bundled mark to a shape and a container", () => {
    const d = parseArchitecture(`
      architecture
      app api "API" @icon(dotnet)
      service svc "Payments" @icon(openjdk) {
        app pay "Pay"
      }
    `);
    expect(shape(d, "api").icon).toBe("dotnet");
    expect(container(d, "svc").icon).toBe("openjdk");
  });

  it("accepts an alias and files it under the canonical name", () => {
    const d = parseArchitecture(`architecture\ndatabase db "PG" @icon(pg)`);
    expect(shape(d, "db").icon).toBe("pg");
    expect(resolveIcon("pg")).toBe(ICONS.postgresql);
    // One CSS class and one variable, whichever spelling was used.
    expect(svg(`architecture\ndatabase db "PG" @icon(pg)`)).toContain("pwr-icon-postgresql");
  });

  it("rejects an unknown name, with a suggestion", () => {
    expect(() => parseArchitecture(`architecture\napp a "A" @icon(postgres_ql)`)).toThrow(
      /unknown icon: "postgres_ql".*did you mean/,
    );
  });

  it("is not allowed where it means nothing", () => {
    expect(reason(`architecture @icon(dotnet)\napp a "A"`)).toContain("not allowed");
    expect(reason(`architecture\napp a "A"\napp b "B"\na -> b @icon(dotnet)`)).toContain(
      "not allowed on a connection",
    );
  });

  it("keeps working now that KNOWN covers shape-only directives", () => {
    // `@icon` is legal on a shape and a container but not on the architecture
    // line; before KNOWN included ALLOWED.shape a shape-only directive would
    // have died as "unknown directive" instead.
    expect(() => parseArchitecture(`architecture\napp a "A" @icon(react)`)).not.toThrow();
  });
});

describe("icon blocks", () => {
  const acme = `
    architecture
    icon acme {
      path: M12 2 L22 20 L2 20 Z
      color: #ff6600
    }
    app a "Acme" @icon(acme)
  `;

  it("declares a custom mark", () => {
    const d = parseArchitecture(acme);
    expect(d.icons?.acme).toEqual({
      path: "M12 2 L22 20 L2 20 Z",
      color: "#ff6600",
      darkColor: undefined,
      viewBox: undefined,
      title: undefined,
    });
    expect(svg(acme)).toContain("pwr-icon-acme");
  });

  it("accepts the single-line form", () => {
    const d = parseArchitecture(
      `architecture\nicon acme { path: M0 0H24V24H0Z; color: #ff6600 }\napp a "A" @icon(acme)`,
    );
    expect(d.icons?.acme?.color).toBe("#ff6600");
  });

  it("resolves a mark declared after its use", () => {
    const d = parseArchitecture(
      `architecture\napp a "A" @icon(late)\nicon late { path: M0 0H24V24H0Z }`,
    );
    expect(d.icons?.late).toBeDefined();
  });

  it("shadows a bundled mark of the same name", () => {
    const d = parseArchitecture(
      `architecture\nicon postgresql { path: M0 0H24V24H0Z; color: #123456 }\ndatabase db "PG" @icon(postgresql)`,
    );
    expect(d.icons?.postgresql?.color).toBe("#123456");
    expect(resolveIcon("postgresql", d.icons)).toBe(d.icons!.postgresql);
  });

  it("takes dark-color, view-box and title", () => {
    const d = parseArchitecture(
      `architecture\nicon a { path: M0 0H8V8H0Z; color: #000000; dark-color: #ffffff; view-box: 0 0 8 8; title: A }\napp x "X" @icon(a)`,
    );
    expect(d.icons?.a).toMatchObject({ darkColor: "#ffffff", viewBox: "0 0 8 8", title: "A" });
  });

  it("matches what the builder produces", () => {
    const built = architecture()
      .defineIcon("acme", { path: "M12 2 L22 20 L2 20 Z", color: "#ff6600" })
      .app("a", "Acme", { icon: "acme" })
      .build();
    const parsed = parseArchitecture(acme);
    expect(built.icons!.acme!.path).toEqual(parsed.icons!.acme!.path);
    expect(shape(built, "a").icon).toEqual(shape(parsed, "a").icon);
  });
});

describe("icon block errors", () => {
  it("needs a path, and refuses markup in one", () => {
    expect(reason(`architecture\nicon a { color: #fff }`)).toContain("needs a `path`");
    expect(reason(`architecture\nicon a { path: <svg>x</svg> }`)).toContain("path commands");
    expect(reason(`architecture\nicon a { path: M0 0"/><script> }`)).toContain("path commands");
  });

  it("rejects an unknown property, a bad view-box and a duplicate name", () => {
    expect(reason(`architecture\nicon a { path: M0 0Z; glow: 3 }`)).toContain(
      "unknown icon property",
    );
    expect(reason(`architecture\nicon a { path: M0 0Z; view-box: 0 0 8 }`)).toContain(
      "four numbers",
    );
    expect(reason(`architecture\nicon a { path: M0 0Z }\nicon a { path: M1 1Z }`)).toContain(
      "Duplicate icon",
    );
  });

  it("is top-level only, and must be closed", () => {
    expect(reason(`architecture\nservice s "S" {\nicon a { path: M0 0Z }\n}`)).toContain(
      "top-level only",
    );
    expect(reason(`architecture\nicon a {\n  path: M0 0Z`)).toContain("unclosed icon");
  });
});

describe("icon block parsing hazards", () => {
  it("does not hand a path to the connection scanner", () => {
    // Path data is full of `-` and `,`; `--` anywhere in a line is an operator.
    const d = parseArchitecture(`
      architecture
      icon a {
        path: M12,2 L22,20 L2,20 Z M-4,-4 L-2,-2 Z
      }
      app x "X" @icon(a)
    `);
    expect(d.connections).toHaveLength(0);
    expect(d.icons?.a?.path).toContain("M-4,-4");
  });

  it("does not let an icon block's brace close a container", () => {
    const d = parseArchitecture(`
      architecture
      icon a { path: M0 0Z }
      service svc "S" {
        app p "P"
        app q "Q"
      }
    `);
    expect(container(d, "svc").children).toEqual(["p", "q"]);
  });

  it("still reads `icon` as a node id in a connection", () => {
    const d = parseArchitecture(`architecture\napp icon "I"\napp db "D"\nicon -> db`);
    expect(d.connections).toHaveLength(1);
  });
});

describe("icons in the layout", () => {
  const sized = (src: string, id: string) => {
    const d = parseArchitecture(src);
    layoutArchitecture(d);
    return shape(d, id).rect!;
  };

  it("widens a labelled shape to make room", () => {
    const plain = sized(`architecture\napp a "Orders API"`, "a");
    const withIcon = sized(`architecture\napp a "Orders API" @icon(dotnet)`, "a");
    expect(withIcon.width).toBeGreaterThan(plain.width);
  });

  it("keeps an icon-only shape compact instead of stretching it", () => {
    const iconOnly = sized(`architecture\napp a "" @icon(react)`, "a");
    const empty = sized(`architecture\napp a ""`, "a");
    expect(iconOnly.width).toBeLessThan(empty.width);
    expect(iconOnly.width).toBeLessThanOrEqual(iconOnly.height + 10);
  });

  it("widens a container header for its icon", () => {
    // A long title, so the header is what decides the width rather than the
    // content — otherwise the icon would just eat into the padding.
    const title = "Payments and billing platform";
    const d = parseArchitecture(`architecture\ngroup g "${title}" @icon(php) {\n  rect m ""\n}`);
    const plain = parseArchitecture(`architecture\ngroup g "${title}" {\n  rect m ""\n}`);
    layoutArchitecture(d);
    layoutArchitecture(plain);
    expect(container(d, "g").rect!.width).toBeGreaterThan(container(plain, "g").rect!.width);
  });
});

describe("icons in the output", () => {
  it("inlines the path, with no external reference", () => {
    const out = svg(`architecture\ndatabase db "PG" @icon(postgresql)`);
    expect(out).toContain(ICONS.postgresql!.path);
    expect(out).not.toContain("<image");
    expect(out).not.toContain("<use");
    expect(out).not.toMatch(/href="(?!#)/);
  });

  it("declares a colour variable only for the marks actually drawn", () => {
    const out = svg(`architecture\napp a "A" @icon(react)`);
    expect(out).toContain("--pwr-icon-react:");
    expect(out).not.toContain("--pwr-icon-dotnet:");
  });

  it("uses the dark variant, in the variable and in the fallback", () => {
    // librsvg renders the fallback and ignores the variable, so a light hex
    // baked into a dark render would be invisible in PNG output.
    const out = svg(`architecture\napp a "A" @icon(openjdk)`, true);
    const dark = ICONS.openjdk!.darkColor!;
    expect(out).toContain(`--pwr-icon-openjdk:${dark}`);
    expect(out).toContain(`fill:var(--pwr-icon-openjdk,${dark})`);
  });

  it("lets @iconColor beat the brand colour", () => {
    const out = svg(`architecture\napp a "A" @icon(python) @iconColor(#94a3b8)`);
    // Higher specificity than the single-class brand rule, so order cannot
    // accidentally undo it.
    expect(out).toContain(".pwr-i-a .pwr-ic{fill:#94a3b8}");
  });

  it("stays deterministic", () => {
    const src = `architecture\napp a "A" @icon(react)`;
    expect(svg(src)).toEqual(svg(src));
  });
});

describe("icon geometry", () => {
  /** Every mark is drawn as one transformed path; pull its placement back out. */
  function marks(out: string): { x: number; y: number; scale: number }[] {
    const re = /class="pwr-ic[^"]*" transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)"/g;
    return [...out.matchAll(re)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      scale: Number(m[3]),
    }));
  }

  it("draws a mark at the same size in a shape and in a container title", () => {
    // The title band used to get a 14px mark against the shape's 18px, which
    // read as inconsistent because the two labels are the same size.
    const out = svg(
      [
        "architecture",
        '  service svc "Payments" @icon(openjdk) {',
        '    app api "API" @icon(react)',
        "  }",
      ].join("\n"),
    );
    const found = marks(out);
    expect(found).toHaveLength(2);
    expect(found[0]!.scale).toBeCloseTo(found[1]!.scale, 6);
  });

  it("centres the mark on the title band, for a group as well as a service", () => {
    // The group branch used to place its icon off a raw text baseline with a
    // hand-tuned fudge, leaving it ~2.6px below the label it sat beside.
    const offsets = ["service", "group"].map((kind) => {
      const src = `architecture\n  ${kind} c "Title" @icon(k8s) {\n    app a "A"\n  }`;
      const d = parseArchitecture(src);
      layoutArchitecture(d);
      const out = renderArchitecture(d);
      const rect = container(d, "c").rect!;
      const mark = marks(out)[0]!;
      return { top: mark.y - rect.y, left: mark.x - rect.x };
    });
    expect(offsets[0]!.top).toBeCloseTo(offsets[1]!.top, 6);
    expect(offsets[0]!.left).toBeCloseTo(offsets[1]!.left, 6);
    // 18px mark centred on a 28px band
    expect(offsets[0]!.top).toBeCloseTo(5, 6);
  });

  it("centres a non-square view-box inside the square reserved for it", () => {
    // Fitting the long side leaves slack on the other one; without centring the
    // mark clings to the top-left of its box.
    const wide = svg(
      [
        "icon wide {",
        "  path: M0 0 L24 0 L24 12 L0 12 Z",
        "  view-box: 0 0 24 12",
        "}",
        "architecture",
        '  app a "A" @icon(wide)',
      ].join("\n"),
    );
    const tall = svg(
      [
        "icon tall {",
        "  path: M0 0 L12 0 L12 24 L0 24 Z",
        "  view-box: 0 0 12 24",
        "}",
        "architecture",
        '  app a "A" @icon(tall)',
      ].join("\n"),
    );
    const w = marks(wide)[0]!;
    const t = marks(tall)[0]!;
    // A half-height mark is pushed down by a quarter of the box; a half-width
    // one is pushed right by the same. Compare against the square case.
    const square = marks(svg('architecture\n  app a "A" @icon(react)'))[0]!;
    expect(w.y - square.y).toBeCloseTo(4.5, 1);
    expect(w.x - square.x).toBeCloseTo(0, 1);
    expect(t.x - square.x).toBeCloseTo(4.5, 1);
    expect(t.y - square.y).toBeCloseTo(0, 1);
  });
});
