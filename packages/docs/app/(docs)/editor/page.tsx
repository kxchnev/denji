import Link from "next/link";
import { InlineCode } from "@/components/InlineCode";
import { ShellBlock } from "@/components/ShellBlock";
import { PRODUCT } from "@/lib/product";

function Setting({
  id,
  values,
  means,
}: {
  id: string;
  values: React.ReactNode;
  means: React.ReactNode;
}) {
  return (
    <div className="sm:flex sm:gap-4">
      <dt className="shrink-0 font-mono text-sm text-muted-foreground sm:w-64">{id}</dt>
      <dd className="text-sm leading-6">
        <span className="text-muted-foreground">{values}</span> — {means}
      </dd>
    </div>
  );
}

export const metadata = {
  title: "VS Code",
  description: "A live preview beside the file, problems as you type, and drag-to-edit.",
};

export default function EditorPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">VS Code</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        A live preview beside the file, the way markdown gets one — plus problems as you type, and
        nodes you can drag straight into the source.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Install</h2>
      <p className="mt-2 leading-7">
        Find it in the Extensions view, or install it from a terminal:
      </p>
      <ShellBlock code={`code --install-extension ${PRODUCT.extension}`} />
      <p className="mt-4 leading-7">
        It carries its own copy of the engine, so nothing has to be installed in the project you are
        drawing. Opening any <InlineCode>.denji</InlineCode> file activates it.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Opening a preview</h2>
      <p className="mt-2 leading-7">
        Press <InlineCode>Cmd/Ctrl+K V</InlineCode> to open the preview beside the file, or{" "}
        <InlineCode>Cmd/Ctrl+Shift+V</InlineCode> to open it in place. Both are in the palette as{" "}
        <em>Open Preview to the Side</em> and <em>Open Preview</em>, and there is a button in the
        editor&apos;s title bar. Until a preview is open, a one-line action sits above the top of the
        file offering the same thing.
      </p>
      <p className="mt-4 leading-7">
        One preview belongs to one document and follows the buffer, not the file on disk — you do
        not have to save to see the change. When what you are typing stops parsing, the last drawing
        that worked stays on screen with the error over it, so the picture never blinks out
        mid-edit.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Moving around the drawing</h2>
      <p className="mt-2 leading-7">
        Drag the canvas to pan, use the wheel to zoom around the pointer, and the corner buttons to
        zoom or fit the whole diagram. Clicking a node without moving it jumps the cursor to that
        node&apos;s declaration in the file — the fastest way to find the line behind a box.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Dragging a node</h2>
      <p className="mt-2 leading-7">
        Drag a shape from anywhere on it, or a container by its title band. While the button is
        down, the document holds still and you see a ghost of the node and a highlight on the
        sibling it is about to attach to; <InlineCode>Escape</InlineCode> cancels.
      </p>
      <p className="mt-4 leading-7">
        A drop does not write coordinates. It writes a relation —{" "}
        <InlineCode>@rightOf(gw)</InlineCode>, <InlineCode>@below(api)</InlineCode> — so the diagram
        keeps arranging itself afterwards, and dragging one box does not freeze the layout of the
        whole file. The edit rewrites that one declaration in place: your cursor, selection and
        folded regions stay put, and it is a single step of undo. There is no coordinate to write
        instead — a position measured on one drawing is only true of that drawing, so the language
        has no way to spell one. What you get is the{" "}
        <Link className="font-medium underline underline-offset-4" href="/layout">
          hints
        </Link>
        , and the engine honours them from there.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Problems</h2>
      <p className="mt-2 leading-7">
        Errors and layout warnings appear in the Problems panel as you type, on the line that causes
        them, from the same check the{" "}
        <Link className="font-medium underline underline-offset-4" href="/cli">
          command line
        </Link>{" "}
        runs. Layout warnings are heuristics about the drawing rather than facts about the document,
        so there is a switch for how much you want to hear.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Settings</h2>
      <dl className="mt-4 space-y-2">
        <Setting
          id={`${PRODUCT.settings}.diagnostics`}
          values={<>all · errors · off</>}
          means="What reaches the Problems panel. The default reports layout warnings too; errors is only what stops the diagram rendering."
        />
        <Setting
          id={`${PRODUCT.settings}.preview.theme`}
          values={<>auto · light · dark</>}
          means="Palette for the preview. auto follows the editor's colour theme, and a document with @theme(...) overrides all of it."
        />
        <Setting
          id={`${PRODUCT.settings}.preview.grid`}
          values={<>true · false</>}
          means="Draw a dot grid behind the diagram."
        />
        <Setting
          id={`${PRODUCT.settings}.preview.codeLens`}
          values={<>true · false</>}
          means="Offer the open-preview action above the first line, until a preview is open."
        />
      </dl>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Another editor?</h2>
      <p className="mt-2 leading-7">
        Everything except the drag survives without an extension: run{" "}
        <InlineCode>{PRODUCT.cli} watch</InlineCode> and keep the browser preview beside your editor.
        It reloads on save and reports errors the same way.
      </p>
    </article>
  );
}
