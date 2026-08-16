import { CopyButton } from "@/components/CopyButton";

/**
 * A terminal snippet. Deliberately not the CodeMirror surface the examples use:
 * a command has no line numbers worth showing and no grammar the site already
 * carries, so an editor would cost a dependency to say less. Same code colours
 * and the same copy button, so it still reads as one family with the DSL blocks.
 *
 * No `$` prompt: it would land in the clipboard and break the paste.
 */
export function ShellBlock({ code }: { code: string }) {
  const source = code.trim();
  return (
    <div className="group relative mt-4">
      <pre className="overflow-x-auto rounded-md bg-code px-4 py-3 font-mono text-sm leading-relaxed text-code-foreground">
        {source}
      </pre>
      <CopyButton code={source} />
    </div>
  );
}
