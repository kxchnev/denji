import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { InlineCode } from "@/components/InlineCode";
import { ShellBlock } from "@/components/ShellBlock";
import { PRODUCT } from "@/lib/product";

export const metadata = {
  title: "Diagnostics",
  description: "Every finding check reports: what it means, and what to do about it.",
};

const CYCLE = `architecture
  app a "A" @rightOf(b)
  app b "B" @rightOf(a)`;

const STRIP = `architecture
  app a "A"
  app b "B" @rightOf(a)
  app c "C" @rightOf(b)
  app d "D" @rightOf(c)
  app e "E" @rightOf(d)`;

function Finding({
  code,
  severity,
  means,
  children,
}: {
  code: string;
  severity: "error" | "warning";
  means: string;
  children: React.ReactNode;
}) {
  return (
    <section id={code} className="mt-10 scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight">
        <InlineCode>{code}</InlineCode>{" "}
        <span className="text-sm font-normal text-muted-foreground">{severity}</span>
      </h2>
      <p className="mt-2 leading-7">{means}</p>
      {children}
    </section>
  );
}

export default function DiagnosticsPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Diagnostics</h1>
      <p className="mt-3 text-lg leading-7 text-muted-foreground">
        Six findings, each with a stable code — match on the code, never on the wording. Two are
        errors: nothing renders until they are fixed. Four are warnings about a drawing that renders
        but will not read well, and every one of them is a judgement you are allowed to disagree
        with.
      </p>
      <p className="mt-6 leading-7">
        You meet them through{" "}
        <Link className="font-medium underline underline-offset-4" href="/cli">
          <InlineCode>check</InlineCode>
        </Link>
        , in the Problems panel of the{" "}
        <Link className="font-medium underline underline-offset-4" href="/editor">
          VS Code extension
        </Link>{" "}
        as you type, or from <InlineCode>checkDiagram()</InlineCode> in the{" "}
        <Link className="font-medium underline underline-offset-4" href="/api">
          library
        </Link>
        . Each carries the line, the column and the span of the id it is about, so an editor can put
        a squiggle exactly under it.
      </p>
      <ShellBlock code={`npx ${PRODUCT.cli} check diagram.denji --strict`} />

      <Finding
        code="parse-error"
        severity="error"
        means="The document does not parse. The message names what was expected, and the caret points at the column where the parser gave up."
      >
        <p className="mt-2 leading-7">
          Most of them are one of a few things: an id with a <InlineCode>-</InlineCode> in it, a
          node named after a keyword (<InlineCode>rect -&gt; db</InlineCode> is read as a shape
          declaration), a trailing comment (comments own a whole line), a{" "}
          <InlineCode>{"{"}</InlineCode> that is not the last thing on its line, or a directive
          written where it is not allowed — the{" "}
          <Link className="font-medium underline underline-offset-4" href="/reference#directives">
            reference
          </Link>{" "}
          says where each one goes.
        </p>
      </Finding>

      <Finding
        code="build-error"
        severity="error"
        means="It parses, but it does not hold together: a duplicate id, a connection to an id nobody declared, a node claimed by two containers, a container inside itself, an unknown style or icon name."
      >
        <p className="mt-2 leading-7">
          An unknown icon comes with a suggestion when one is close enough, which is usually a typo
          in a slug.
        </p>
      </Finding>

      <Finding
        code="hint-cycle"
        severity="warning"
        means="Placement hints contradict each other. Nothing fails: the relations that close the cycle are dropped and the rest are honoured, so the drawing you get is missing exactly the constraints that could not all be true at once."
      >
        <CodeBlock code={CYCLE} lang="denji" />
        <p className="mt-4 leading-7">
          Decide which of the two you actually meant and delete the other. A cycle in the{" "}
          <em>connections</em> is a different thing entirely — an ordinary service graph — and is
          never reported.
        </p>
      </Finding>

      <Finding
        code="unconnected-node"
        severity="warning"
        means="A shape nothing connects to, in a diagram that is otherwise wired up. Usually a leftover from an edit, or a box someone meant to attach and did not."
      >
        <p className="mt-2 leading-7">
          Connect it, delete it, or — if it is genuinely standalone — accept the warning. A diagram
          with no connections at all is not reported: there is nothing to be inconsistent with.
        </p>
      </Finding>

      <Finding
        code="overlapping-siblings"
        severity="warning"
        means="Two nodes in the same scope are drawn on top of each other. The layout does not do this on its own, so it means the constraints it was given left it no room."
      >
        <p className="mt-2 leading-7">
          This is the one warning worth treating as a bug report: if you can reach it with hints
          alone, the arrangement could not satisfy them. Removing a hint usually clears it.
        </p>
      </Finding>

      <Finding
        code="extreme-aspect-ratio"
        severity="warning"
        means="The drawing came out a strip more than four times longer than it is tall, or the other way round — reported only once there are at least four nodes, since a small diagram is allowed an odd shape."
      >
        <CodeBlock code={STRIP} lang="denji" />
        <p className="mt-4 leading-7">
          A strip is almost always a missing container: group the things that belong together and
          the row becomes a block. Turning part of the flow with{" "}
          <Link className="font-medium underline underline-offset-4" href="/reference#below">
            <InlineCode>@below</InlineCode>
          </Link>{" "}
          works too. This is the only finding that is about the whole drawing rather than a node, so
          it lands on the <InlineCode>architecture</InlineCode> line.
        </p>
      </Finding>
    </article>
  );
}
