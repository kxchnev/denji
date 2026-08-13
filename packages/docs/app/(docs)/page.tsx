import Link from "next/link";
import { Example } from "@/components/Example";
import { InlineCode } from "@/components/InlineCode";
import { intro } from "@/examples";

const PATHS = [
  {
    href: "/installation",
    title: "Install it",
    body: "One package for the library and the command line, plus an editor extension if you want a preview beside the file.",
  },
  {
    href: "/shapes",
    title: "Learn the language",
    body: "Six things to declare, one way to connect them, and a handful of directives for the rest. Every page is worked examples.",
  },
  {
    href: "/playground",
    title: "Try it now",
    body: "The same engine in the browser. Nothing to install, and your diagrams stay in this browser.",
  },
];

export default function Home() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">
        Architecture diagrams that lay themselves out
      </h1>
      <p className="mt-3 text-lg leading-7 text-muted-foreground">
        You declare the boxes and wire them up. Where everything goes is worked out from the
        connections, and the connectors are routed <strong>around</strong> the boxes rather than
        through them.
      </p>
      <p className="mt-6 leading-7">
        Write it as <InlineCode>.pwr</InlineCode> text or build it in code — both produce one model,
        and the model renders to SVG. Containers size themselves to what they hold. Where you do
        want a say, hints like <InlineCode>@below</InlineCode> and <InlineCode>@rightOf</InlineCode>{" "}
        constrain the arrangement instead of replacing it, so a diagram survives having something
        added to it a year later.
      </p>

      <Example {...intro} />

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {PATHS.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="rounded-lg border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/40"
          >
            <span className="font-medium">{p.title}</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">{p.body}</span>
          </Link>
        ))}
      </div>

      <p className="mt-8 leading-7 text-muted-foreground">
        Curious why a drawing comes out the way it does?{" "}
        <Link className="font-medium underline underline-offset-4" href="/how-it-works">
          How it works
        </Link>{" "}
        covers the layout engine — layers, clusters, corridors and sizes — without a line of syntax.
      </p>
    </article>
  );
}
