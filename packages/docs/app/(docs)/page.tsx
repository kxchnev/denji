import Link from "next/link";
import { Example } from "@/components/Example";
import { intro } from "@/examples";

export default function Home() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">power</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Free-form architecture diagrams (not C4) that lay themselves out — a mermaid alternative
        where the arrows go around the boxes instead of through them.
      </p>
      <p className="mt-6 leading-7">
        Describe a diagram in the <code className="rounded bg-muted px-1.5 py-0.5 text-sm">.pwr</code>{" "}
        text DSL or with the programmatic builder — both produce the same model. You declare the
        boxes and wire them up; <strong>the connections are the layout</strong>. Containers size
        themselves to wrap their contents, and where you do want a say, hints like{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">@below</code> and{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">@rightOf</code> constrain the
        arrangement rather than replacing it.
      </p>

      <Example {...intro} />

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Explore</h2>
      <p className="mt-2 leading-7">
        Browse the primitives in{" "}
        <Link className="font-medium underline underline-offset-4" href="/elements">
          Elements
        </Link>
        ,{" "}
        <Link className="font-medium underline underline-offset-4" href="/arrows">
          Arrows
        </Link>
        ,{" "}
        <Link className="font-medium underline underline-offset-4" href="/blocks">
          Blocks
        </Link>{" "}
        and{" "}
        <Link className="font-medium underline underline-offset-4" href="/layout">
          Layout
        </Link>
        , or try your own in the{" "}
        <Link className="font-medium underline underline-offset-4" href="/playground">
          Playground
        </Link>
        .
      </p>
    </article>
  );
}
