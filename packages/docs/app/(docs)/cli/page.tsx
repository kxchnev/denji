import Link from "next/link";
import { InlineCode } from "@/components/InlineCode";
import { ShellBlock } from "@/components/ShellBlock";
import { PRODUCT } from "@/lib/product";

/** Flags for one command. Local to this page — every other page states its
 *  vocabulary in prose, and only a CLI has a column of defaults worth aligning. */
function Flags({ rows }: { rows: Array<{ flag: string; means: React.ReactNode }> }) {
  return (
    <dl className="mt-4 space-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.flag} className="sm:flex sm:gap-4">
          <dt className="shrink-0 font-mono text-muted-foreground sm:w-52">{r.flag}</dt>
          <dd className="leading-6">{r.means}</dd>
        </div>
      ))}
    </dl>
  );
}

export const metadata = {
  title: "CLI",
  description: "Render, watch, check, search icons and print the language reference.",
};

export default function CliPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">CLI</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Five commands: draw a file, watch one, check one, look up a brand mark, and print the
        language reference.
      </p>
      <p className="mt-6 leading-7">
        The package installs a <InlineCode>{PRODUCT.cli}</InlineCode> binary. The examples below use{" "}
        <InlineCode>npx</InlineCode>; drop it if you installed globally.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">render</h2>
      <p className="mt-2 leading-7">
        Draws a diagram to a file. The output format comes from the extension you ask for — SVG, PNG
        or JPEG — so there is no format flag.
      </p>
      <ShellBlock code={`npx ${PRODUCT.cli} render diagram.denji -o diagram.png -t dark`} />
      <Flags
        rows={[
          {
            flag: "-o, --out <file>",
            means: (
              <>
                Where to write, and in which format: <InlineCode>.svg</InlineCode>,{" "}
                <InlineCode>.png</InlineCode>, <InlineCode>.jpg</InlineCode>. Defaults to the input
                path with an <InlineCode>.svg</InlineCode> extension.
              </>
            ),
          },
          {
            flag: "-t, --theme <name>",
            means: (
              <>
                <InlineCode>light</InlineCode> or <InlineCode>dark</InlineCode>. Defaults to{" "}
                <InlineCode>light</InlineCode>. A <InlineCode>@theme(...)</InlineCode> in the
                document wins over it.
              </>
            ),
          },
        ]}
      />
      <p className="mt-4 leading-7">
        The palette is baked into the file, so an export looks the same wherever it is opened.
        Rasters are drawn at twice the diagram&apos;s own units to stay crisp, and JPEG — having no
        transparency — is flattened onto the theme&apos;s surface colour. One thing is SVG-only:{" "}
        <Link className="font-medium underline underline-offset-4" href="/links">
          link buttons
        </Link>{" "}
        become real anchors there, because a standalone file has no viewer to interpret a click.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">watch</h2>
      <p className="mt-2 leading-7">
        Serves a preview that redraws as you edit, for when your editor has no preview of its own.
        Keep it on one side and the file on the other.
      </p>
      <ShellBlock code={`npx ${PRODUCT.cli} watch diagram.denji`} />
      <Flags
        rows={[
          {
            flag: "-p, --port <n>",
            means: (
              <>
                Port to serve on, <InlineCode>4400</InlineCode> by default. If it is busy the next
                free one is taken, so a second preview never fails to start.
              </>
            ),
          },
          {
            flag: "-t, --theme <name>",
            means: (
              <>
                Pins the palette to <InlineCode>light</InlineCode> or{" "}
                <InlineCode>dark</InlineCode>. Left off, the page follows the device.
              </>
            ),
          },
          { flag: "--no-open", means: "Do not open a browser; the URL is printed either way." },
        ]}
      />
      <p className="mt-4 leading-7">
        A document that stops parsing does not blank the screen: the last drawing that worked stays
        up with the error over it. Layout warnings are not reported here — that is what{" "}
        <InlineCode>check</InlineCode> is for.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">check</h2>
      <p className="mt-2 leading-7">
        Reports what is wrong without drawing anything — for a commit hook, for CI, or for a script
        that wants the findings as data.
      </p>
      <ShellBlock code={`npx ${PRODUCT.cli} check diagram.denji --strict`} />
      <Flags
        rows={[
          { flag: "--json", means: "Machine-readable diagnostics on stdout instead of a report." },
          {
            flag: "--strict",
            means: "Exit non-zero on warnings too, not only on what stops the diagram rendering.",
          },
        ]}
      />
      <p className="mt-4 leading-7">
        Pass <InlineCode>-</InlineCode> instead of a filename to read the document from stdin. A
        clean run prints <InlineCode>ok</InlineCode> and exits zero; otherwise each finding is
        printed with the offending line and a caret under it, and the exit code is 1 when there were
        errors.
      </p>
      <p className="mt-4 leading-7">
        Two codes are errors — <InlineCode>parse-error</InlineCode> and{" "}
        <InlineCode>build-error</InlineCode> — and mean nothing was drawn. The rest are warnings
        about the drawing rather than the document:{" "}
        <InlineCode>hint-cycle</InlineCode> (hints that ask for the impossible, so the closing ones
        were dropped), <InlineCode>overlapping-siblings</InlineCode>,{" "}
        <InlineCode>unconnected-node</InlineCode> and <InlineCode>extreme-aspect-ratio</InlineCode>.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">icons</h2>
      <p className="mt-2 leading-7">
        Finds a brand mark by name. Every Simple Icons slug is bundled, so this is a search over
        what you already have rather than a download.
      </p>
      <ShellBlock code={`npx ${PRODUCT.cli} icons postgres`} />
      <p className="mt-4 leading-7">
        Matches are ranked, and the name in the left column is what goes in{" "}
        <InlineCode>@icon(name)</InlineCode>. With no query it prints the set&apos;s size and the
        marks a diagram usually reaches for. Amazon, AWS, Azure and Oracle asked to be removed from
        the set, so they are not there — <InlineCode>openjdk</InlineCode> stands in for Java, and
        anything missing can be declared with an{" "}
        <Link className="font-medium underline underline-offset-4" href="/icons">
          icon block
        </Link>
        .
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">spec</h2>
      <p className="mt-2 leading-7">
        Prints the whole language reference to stdout. It exists for models: pipe it into one that
        cannot read your filesystem and it can write the DSL correctly without guessing.
      </p>
      <ShellBlock code={`npx ${PRODUCT.cli} spec > language.md`} />
    </article>
  );
}
