import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { InlineCode } from "@/components/InlineCode";
import { ShellBlock } from "@/components/ShellBlock";
import { PRODUCT } from "@/lib/product";

const FIRST_DIAGRAM = `architecture
  app gw "API Gateway"
  app api "Orders API" @below(gw)
  database db "Postgres" @below(api)
  gw -> api : http
  api -> db
`;

export const metadata = {
  title: "Installation",
  description: "Install the library, the command line and the editor extension.",
};

export default function InstallationPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Installation</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        One package carries the library, the command line and the language reference. The editor
        extension is a separate install, and neither is needed to try the language.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Requirements</h2>
      <p className="mt-2 leading-7">
        Node 18.17 or newer. The package is ESM only — reach for it with{" "}
        <InlineCode>import</InlineCode>, not <InlineCode>require</InlineCode> — and it ships its own
        TypeScript types, so there is no <InlineCode>@types</InlineCode> package to add. Rendering to
        PNG or JPEG pulls in a native image dependency; SVG has none.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">The library</h2>
      <ShellBlock code={`npm install ${PRODUCT.pkg}`} />
      <p className="mt-4 leading-7">
        That is all you need to build diagrams in code. The{" "}
        <Link className="font-medium underline underline-offset-4" href="/api">
          Library API
        </Link>{" "}
        page covers the builder and the parse, layout and render steps.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">The command line</h2>
      <p className="mt-2 leading-7">
        The same package installs a <InlineCode>{PRODUCT.cli}</InlineCode> binary. Run it without
        installing anything permanently:
      </p>
      <ShellBlock code={`npx ${PRODUCT.cli} render diagram.denji`} />
      <p className="mt-4 leading-7">Or put it on your path for good:</p>
      <ShellBlock code={`npm install -g ${PRODUCT.pkg}`} />
      <p className="mt-4 leading-7">
        Every command and flag is listed under{" "}
        <Link className="font-medium underline underline-offset-4" href="/cli">
          CLI
        </Link>
        .
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">The VS Code extension</h2>
      <p className="mt-2 leading-7">
        Search the Marketplace from the Extensions view, or install it from a terminal:
      </p>
      <ShellBlock code={`code --install-extension ${PRODUCT.extension}`} />
      <p className="mt-4 leading-7">
        It brings syntax highlighting, problems as you type and a live preview you can drag nodes
        around in — see{" "}
        <Link className="font-medium underline underline-offset-4" href="/editor">
          VS Code
        </Link>
        . The extension bundles everything it needs, so it works whether or not the package is
        installed in your project.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Your first diagram</h2>
      <p className="mt-2 leading-7">
        Put this in <InlineCode>diagram.denji</InlineCode>. Nothing in it says where a box goes: the
        connections decide, and the hints only constrain the order.
      </p>
      <CodeBlock code={FIRST_DIAGRAM} lang="denji" />
      <p className="mt-4 leading-7">Render it to a file:</p>
      <ShellBlock code={`npx ${PRODUCT.cli} render diagram.denji -o diagram.svg`} />
      <p className="mt-4 leading-7">
        Or keep a preview open that redraws every time you save — the portable half of the editor
        experience, in any editor:
      </p>
      <ShellBlock code={`npx ${PRODUCT.cli} watch diagram.denji`} />

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Nothing installed?</h2>
      <p className="mt-2 leading-7">
        The{" "}
        <Link className="font-medium underline underline-offset-4" href="/playground">
          Playground
        </Link>{" "}
        runs the same engine in the browser and keeps your diagrams in local storage. It is the
        fastest way to find out whether the language suits you before any of the above.
      </p>
    </article>
  );
}
