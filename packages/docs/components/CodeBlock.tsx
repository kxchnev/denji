import { CodeViewer } from "@/components/CodeViewer";
import { CopyButton } from "@/components/CopyButton";
import type { CodeLang } from "@/lib/code-lang";

/** The outer Card already frames the example — no border/rounding here, just
 *  the code surface, so the tabs don't read as a frame within a frame. */
export function CodeBlock({ code, lang = "pwr" }: { code: string; lang?: CodeLang }) {
  const source = code.trim();
  return (
    <div className="group relative">
      <CodeViewer
        code={source}
        lang={lang}
        className="h-96 overflow-hidden bg-code text-sm text-code-foreground"
      />
      <CopyButton code={source} />
    </div>
  );
}
