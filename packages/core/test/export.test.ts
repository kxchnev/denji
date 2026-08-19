import { describe, expect, it } from "vitest";
import { parseArchitecture } from "../src/dsl/arch-parse.js";
import { layoutArchitecture } from "../src/layout/arch/index.js";
import { renderArchitecture } from "../src/render/arch-svg.js";
import { toJpeg, toPng, toSvgFile } from "../src/export.js";
import { loadAll } from "../src/assets-node.js";

/**
 * The export path, which the CLI, the VS Code extension and the web playground
 * all take — so what is asserted here is what all three write.
 */
loadAll();

const SOURCE = `architecture
  service orders "Заказы" {
    app api "Orders API" @icon(postgresql)
    database db "Postgres" @below(api)
    api -> db : sql
  }
  app client "Client" @below(orders) @link(https://example.com/)
  client -> api
`;

const laid = (): ReturnType<typeof parseArchitecture> => {
  const d = parseArchitecture(SOURCE);
  layoutArchitecture(d, { onWarn: () => {} });
  return d;
};

describe("an exported SVG", () => {
  it("carries no custom properties at all", () => {
    // resvg drops a declaration it cannot parse together with its fallback, so a
    // `var(--x, #fff)` is not a safe way to say `#fff`. Measured once the hard
    // way: the whole drawing came out black.
    const svg = toSvgFile(laid());
    expect(svg).not.toContain("var(--");
    // Including the arrowhead's fill, which is an attribute rather than a rule.
    expect(svg).toMatch(/<marker[^>]*>.*fill="#[0-9a-f]{6}"/s);
  });

  it("embeds its own typeface, split by script", () => {
    const svg = toSvgFile(laid());
    expect(svg.match(/@font-face/g)).toHaveLength(2);
    expect(svg).toContain("font-family:'Inter'");
    expect(svg).toContain("unicode-range:U+0301,U+0400-045F");
    expect(svg).toContain("src:url(data:font/woff2;base64,");
    // The face is named first, so a viewer that reads the @font-face uses it.
    expect(svg).toMatch(/font-family="Inter,/);
  });

  it("can be asked to leave the font out", () => {
    expect(toSvgFile(laid(), { embedFont: false })).not.toContain("@font-face");
  });

  it("turns link buttons into anchors, which only a file needs", () => {
    expect(toSvgFile(laid())).toContain("<a ");
    expect(renderArchitecture(laid())).not.toContain("<a ");
  });
});

describe("raster output", () => {
  it("writes a PNG twice the size of the diagram's own units", async () => {
    const d = laid();
    const png = await toPng(d);
    // PNG signature, then IHDR's width and height as big-endian 32-bit ints.
    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(renderArchitecture(d))!;
    expect(view.getUint32(16)).toBe(Math.round(Number(box[1]) * 2));
    expect(view.getUint32(20)).toBe(Math.round(Number(box[2]) * 2));
  });

  it("honours the scale it is given", async () => {
    const png = await toPng(laid(), { scale: 1 });
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(renderArchitecture(laid()))!;
    expect(view.getUint32(16)).toBe(Math.round(Number(box[1])));
  });

  it("is the same bytes every time", async () => {
    // The promise the three products rest on: one rasterizer, one font, no system
    // state. If this ever stops holding, "pixel for pixel" has stopped being true.
    const [a, b] = await Promise.all([toPng(laid()), toPng(laid())]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("writes a JPEG, flattened onto the theme's own surface", async () => {
    const jpeg = await toJpeg(laid());
    expect([...jpeg.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    // A dark diagram must not come out on white: the surface is the theme's.
    const dark = await toJpeg(parsedDark());
    expect(Buffer.from(dark).equals(Buffer.from(jpeg))).toBe(false);
  });
});

function parsedDark(): ReturnType<typeof parseArchitecture> {
  const d = parseArchitecture(`architecture @theme(dark)\n${SOURCE.split("\n").slice(1).join("\n")}`);
  layoutArchitecture(d, { onWarn: () => {} });
  return d;
}
