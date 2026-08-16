import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { InlineCode } from "@/components/InlineCode";
import { PRODUCT } from "@/lib/product";

const QUICK = `import { writeFileSync } from "node:fs";
import { parse, toSvg } from "${PRODUCT.pkg}";

const source = \`architecture
  app gw "API Gateway"
  database db "Postgres" @below(gw)
  gw -> db
\`;

writeFileSync("diagram.svg", toSvg(parse(source)));`;

const BUILDER = `import { architecture, toSvg } from "${PRODUCT.pkg}";

const diagram = architecture()
  .app("gw", "API Gateway")
  .app("api", "Orders API")
  .database("db", "Postgres", { hint: { below: "api" } })
  .container("orders", "Orders", {
    kind: "service",
    children: ["api", "db"],
    hint: { below: "gw" },
  })
  .connect("gw", "orders", { label: "http" })
  .build();

const svg = toSvg(diagram);`;

const STEPS = `import { parseArchitecture, layoutArchitecture, renderArchitecture } from "${PRODUCT.pkg}";

const diagram = parseArchitecture(source);
layoutArchitecture(diagram, { gap: 56, onWarn: () => {} });
const svg = renderArchitecture(diagram, { themeMode: "selector" });`;

const CHECK = `import { checkDiagram } from "${PRODUCT.pkg}";

const { diagnostics, failed } = checkDiagram(source);
for (const d of diagnostics) {
  console.log(\`\${d.line}:\${d.col} \${d.severity} \${d.message} [\${d.code}]\`);
}`;

export const metadata = {
  title: "Library API",
  description: "The engine as a package: parse or build a model, lay it out, render it to SVG.",
};

export default function ApiPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Library API</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        The same engine the site and the editor run on, as a package. Write the diagram as text or
        build it in code — both produce one model, and the model renders to SVG.
      </p>
      <p className="mt-6 leading-7">
        One entry point, ESM only. Everything below is a named export of{" "}
        <InlineCode>{PRODUCT.pkg}</InlineCode>; there are no deep imports to remember.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">From text to SVG</h2>
      <p className="mt-2 leading-7">
        <InlineCode>toSvg</InlineCode> is the whole pipeline in one call — it lays the diagram out
        and renders it. The returned string is a complete <InlineCode>&lt;svg&gt;</InlineCode>{" "}
        document, with its stylesheet inlined and its ids scoped, so two diagrams can sit on one page
        without colliding.
      </p>
      <CodeBlock code={QUICK} lang="ts" />

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Building in code</h2>
      <p className="mt-2 leading-7">
        The builder is the programmatic half of the language — useful when the diagram comes from
        something you already have: a service registry, a Terraform state, a dependency graph.
      </p>
      <CodeBlock code={BUILDER} lang="ts" />
      <p className="mt-4 leading-7">
        Shapes are <InlineCode>app</InlineCode>, <InlineCode>database</InlineCode>,{" "}
        <InlineCode>queue</InlineCode> and <InlineCode>rect</InlineCode>, each taking an id, a label
        and options. <InlineCode>container</InlineCode> takes{" "}
        <InlineCode>kind: &quot;service&quot; | &quot;group&quot;</InlineCode> and a list of{" "}
        <InlineCode>children</InlineCode> by id; <InlineCode>connect</InlineCode> takes two ids plus{" "}
        <InlineCode>label</InlineCode>, <InlineCode>dir</InlineCode> (
        <InlineCode>to</InlineCode>, <InlineCode>from</InlineCode>, <InlineCode>both</InlineCode>,{" "}
        <InlineCode>none</InlineCode>) and <InlineCode>style</InlineCode> (
        <InlineCode>solid</InlineCode> or <InlineCode>dashed</InlineCode>). The rest of the chain
        mirrors the directives: <InlineCode>theme</InlineCode>, <InlineCode>spacing</InlineCode>,{" "}
        <InlineCode>margin</InlineCode>, <InlineCode>defineStyle</InlineCode>,{" "}
        <InlineCode>defineIcon</InlineCode>, and <InlineCode>place</InlineCode> to attach a hint to a
        node declared earlier. Every method returns the builder;{" "}
        <InlineCode>build()</InlineCode> ends the chain and validates — unknown ids, a node claimed
        by two containers, a container cycle and an unusable link all throw here rather than drawing
        something wrong.
      </p>
      <p className="mt-4 leading-7">
        Placement options are the hints under{" "}
        <Link className="font-medium underline underline-offset-4" href="/layout">
          Layout
        </Link>
        : <InlineCode>hint</InlineCode> takes <InlineCode>rightOf</InlineCode>,{" "}
        <InlineCode>leftOf</InlineCode>, <InlineCode>above</InlineCode>,{" "}
        <InlineCode>below</InlineCode> and <InlineCode>gap</InlineCode>. There is no coordinate to
        pass: a hint constrains the arrangement the connections produce rather than replacing it,
        and the engine picks the numbers.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">The steps on their own</h2>
      <p className="mt-2 leading-7">
        Split the pipeline when you need what is in the middle — the laid-out model carries every
        node&apos;s rectangle, which is what a viewer hit-tests against.{" "}
        <InlineCode>layoutArchitecture</InlineCode> both mutates the diagram and returns it.
      </p>
      <CodeBlock code={STEPS} lang="ts" />
      <p className="mt-4 leading-7">
        Layout takes <InlineCode>gap</InlineCode> (or <InlineCode>gapX</InlineCode> /{" "}
        <InlineCode>gapY</InlineCode>), <InlineCode>padding</InlineCode>,{" "}
        <InlineCode>margin</InlineCode> and <InlineCode>onWarn</InlineCode> — warnings go to{" "}
        <InlineCode>console.warn</InlineCode> unless you pass a sink, as above. Render takes the
        palette (<InlineCode>theme</InlineCode>, <InlineCode>darkTheme</InlineCode>) and how it
        should switch: <InlineCode>themeMode</InlineCode> is{" "}
        <InlineCode>fixed</InlineCode> by default, which bakes one palette in;{" "}
        <InlineCode>auto</InlineCode> ships both and follows the reader&apos;s device; and{" "}
        <InlineCode>selector</InlineCode> ships both and follows an ancestor class —{" "}
        <InlineCode>.dark</InlineCode> unless <InlineCode>darkSelector</InlineCode> says otherwise —
        which is what a page with its own theme toggle wants. Also there:{" "}
        <InlineCode>background</InlineCode>, <InlineCode>fontFamily</InlineCode>,{" "}
        <InlineCode>padding</InlineCode>, <InlineCode>idPrefix</InlineCode> (defaults to a hash of
        the drawing) and <InlineCode>linkAnchors</InlineCode>, which turns link buttons into real
        anchors for a standalone file.
      </p>
      <p className="mt-4 leading-7">
        Where the document and the caller disagree, the document wins: a{" "}
        <InlineCode>@theme(...)</InlineCode> in the source pins the palette and leaves nothing to
        switch to, and <InlineCode>@spacing</InlineCode> beats the <InlineCode>gap</InlineCode> you
        passed. What an author wrote down outranks a default from the outside.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Checking a document</h2>
      <p className="mt-2 leading-7">
        <InlineCode>checkDiagram</InlineCode> is what the CLI and the editor both report from, so a
        pre-commit script and the Problems panel agree. It answers with{" "}
        <InlineCode>failed</InlineCode> — nothing could be drawn — and a list of diagnostics, each
        carrying a severity, a code, a message, the line and column it sits on and the node ids it is
        about.
      </p>
      <CodeBlock code={CHECK} lang="ts" />
    </article>
  );
}
