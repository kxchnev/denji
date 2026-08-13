import {
  ARCH_OPERATORS,
  CONTAINER_KIND_NAMES,
  DIRECTIVES,
  ICON_PROP_NAMES,
  SHAPE_KIND_NAMES,
  STYLABLE,
  STYLE_PROPS,
  themes,
  type DirectiveCtx,
} from "power";
import { CodeBlock } from "@/components/CodeBlock";
import { InlineCode } from "@/components/InlineCode";
import { inlineMarkdown } from "@/components/Prose";

export const metadata = {
  title: "Language reference",
  description: "Every keyword, directive, operator and style property, in one place.",
};

const GRAMMAR = `architecture  <directives…>
  app|database|queue|rect  <id>  ["<label>"]  <directives…>

  service|group  <id>  ["<label>"]  <directives…>  {
    text "<note>" @corner(topLeft)
    …
  }

  <id> -> <id>  <directives…>  : <label>

style <name|kind> { <property>: <value>; … }
icon  <name>     { path: <d>; … }`;

/** Long enough to be worth a legend, short enough to sit above the tables. */
const CONTEXTS: Array<{ ctx: DirectiveCtx; label: string }> = [
  { ctx: "diagram", label: "architecture" },
  { ctx: "shape", label: "shape" },
  { ctx: "container", label: "container" },
  { ctx: "connection", label: "connection" },
  { ctx: "text", label: "text" },
];

function Where({ used }: { used: readonly DirectiveCtx[] }) {
  return (
    <span className="text-muted-foreground">
      {CONTEXTS.filter((c) => used.includes(c.ctx))
        .map((c) => c.label)
        .join(", ")}
    </span>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-border/50 align-top">
              {cells.map((c, j) => (
                <td key={j} className="py-2 pr-4">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-24 text-xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}

export default function ReferencePage() {
  const stylable = CONTEXTS.filter((c) => STYLABLE.has(c.ctx)).map((c) => c.label);

  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Language reference</h1>
      <p className="mt-3 text-lg leading-7 text-muted-foreground">
        Every word the parser knows. The tables below are built from the same lists the parser, the
        editor&apos;s autocomplete and the syntax highlighter read, so they cannot fall behind the
        language. For the ideas behind them, start with the guide; for the whole grammar as one
        file, run <InlineCode>spec</InlineCode>.
      </p>

      <H2 id="shape-of-a-file">The shape of a file</H2>
      <p className="mt-2 leading-7">
        Lines are read one at a time and trimmed first, so indentation is decoration — nesting comes
        only from <InlineCode>{"{"}</InlineCode> … <InlineCode>{"}"}</InlineCode>. A{" "}
        <InlineCode>{"{"}</InlineCode> must end its line and the closing{" "}
        <InlineCode>{"}"}</InlineCode> must sit alone on its own. Comments own a whole line and
        start with <InlineCode>#</InlineCode> or <InlineCode>%%</InlineCode>; there is no trailing
        comment. Sizes are unitless.
      </p>
      <CodeBlock code={GRAMMAR} lang="pwr" />
      <p className="mt-4 leading-7">
        An <strong>id</strong> is <InlineCode>[A-Za-z0-9_]+</InlineCode> — no hyphens, no dots — and
        may not be one of the keywords below, which are dispatched on the first word of the line.
        Labels are double-quoted and cannot contain a <InlineCode>&quot;</InlineCode>; omit the
        label and the id is used instead.
      </p>

      <H2 id="keywords">Keywords</H2>
      <Table
        head={["Keyword", "Declares"]}
        rows={[
          ...SHAPE_KIND_NAMES.map((k) => [<InlineCode key={k}>{k}</InlineCode>, "a shape"]),
          ...CONTAINER_KIND_NAMES.map((k) => [
            <InlineCode key={k}>{k}</InlineCode>,
            "a container, opened with a brace",
          ]),
          [<InlineCode key="t">text</InlineCode>, "a free note in a group's corner"],
          [<InlineCode key="a">architecture</InlineCode>, "the document, and its own settings"],
          [<InlineCode key="s">style</InlineCode>, "a style block: a named style, or one per kind"],
          [<InlineCode key="i">icon</InlineCode>, "a mark the document brings itself"],
        ]}
      />

      <H2 id="operators">Connection operators</H2>
      <Table
        head={["Operator", "Arrows", "Line"]}
        rows={ARCH_OPERATORS.map((op) => [
          <InlineCode key={op}>{op}</InlineCode>,
          op === "<->" ? "both ends" : op === "->" || op === "-.->" ? "at the target" : op === "<-" ? "at the source" : "none",
          op.includes(".") ? "dashed" : "solid",
        ])}
      />

      <H2 id="directives">Directives</H2>
      <p className="mt-2 leading-7">
        Names are case-insensitive: <InlineCode>@rightOf</InlineCode> and{" "}
        <InlineCode>@rightof</InlineCode> are the same directive. Written where they are not
        allowed, they are a parse error rather than a silent no-op.
      </p>
      <Table
        head={["Directive", "Where", "Means"]}
        rows={DIRECTIVES.map((d) => [
          <span key={d.name} id={d.name.toLowerCase()} className="scroll-mt-24">
            <InlineCode>
              @{d.name}
              {d.arg}
            </InlineCode>
          </span>,
          <Where key="w" used={d.in} />,
          inlineMarkdown(d.info),
        ])}
      />

      <H2 id="style-properties">Style properties</H2>
      <p className="mt-2 leading-7">
        Written inside a <InlineCode>style</InlineCode> block as{" "}
        <InlineCode>name: value</InlineCode>, or straight on an element as{" "}
        <InlineCode>@name(value)</InlineCode> — legal on {stylable.join(", ")}. Spelling is
        forgiving: <InlineCode>stroke-width</InlineCode> and <InlineCode>strokeWidth</InlineCode>{" "}
        are one property. Colours take <InlineCode>#rgb</InlineCode>, <InlineCode>#rrggbb</InlineCode>
        {" "}with or without alpha, a CSS colour name, or <InlineCode>rgb()</InlineCode> /{" "}
        <InlineCode>hsl()</InlineCode>.
      </p>
      <Table
        head={["Property", "Value", "Applies to"]}
        rows={Object.values(STYLE_PROPS).map((spec) => [
          <span key={spec.key} id={spec.key.toLowerCase()} className="scroll-mt-24">
            <InlineCode>{spec.key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}</InlineCode>
          </span>,
          <span key="k" className="text-muted-foreground">
            {spec.kind}
          </span>,
          <span key="s" className="text-muted-foreground">
            {spec.slots.join(", ")}
          </span>,
        ])}
      />
      <p className="mt-4 leading-7">
        Two of them are not paint: <InlineCode>width</InlineCode> and{" "}
        <InlineCode>height</InlineCode> are read by the layout. On a shape the size is exact; on a
        container it is a floor, since a container still has to hold its children. There is no{" "}
        <InlineCode>fontSize</InlineCode> — labels are measured before styles resolve, so text is
        always 14px.
      </p>

      <H2 id="themes">Themes</H2>
      <p className="mt-2 leading-7">
        {Object.keys(themes).map((t, i) => (
          <span key={t}>
            {i > 0 && ", "}
            <InlineCode>{t}</InlineCode>
          </span>
        ))}{" "}
        ship built in. Without <InlineCode>@theme</InlineCode> a diagram carries both palettes and
        follows the page it is on; with it, one palette is baked in and nothing switches.
      </p>

      <H2 id="icon-blocks">Icon blocks</H2>
      <p className="mt-2 leading-7">
        An <InlineCode>icon</InlineCode> block declares a mark the bundled set does not carry, and
        shadows a bundled one of the same name.
      </p>
      <Table
        head={["Property", "Means"]}
        rows={ICON_PROP_NAMES.map((n) => [
          <InlineCode key={n}>{n === "darkcolor" ? "dark-color" : n === "viewbox" ? "view-box" : n}</InlineCode>,
          {
            path: "The `d` attribute of the mark's path. Required.",
            color: "The brand colour. Defaults to the surrounding text colour.",
            darkcolor: "Used instead on a dark palette.",
            viewbox: "Four numbers. Defaults to `0 0 24 24`.",
            title: "Human-readable name.",
          }[n] ?? "",
        ])}
      />
    </article>
  );
}
