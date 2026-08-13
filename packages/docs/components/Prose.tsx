import Link from "next/link";
import { InlineCode } from "@/components/InlineCode";

/**
 * The little bit of markdown a sentence needs: `code`, **bold**, *italic* and
 * [links](/somewhere).
 *
 * Every intro and every example description is written in markdown, because
 * that is how anyone writes a sentence with a directive in it — but they were
 * being interpolated straight into a `<p>`, so a reader saw the backticks. A
 * full markdown pipeline would be a dependency and a rendering step for four
 * inline constructs; this is those four.
 *
 * Deliberately inline-only: no headings, no lists, no paragraphs. A description
 * that wants those is not a description, it is a page.
 */
export function Prose({ children, className }: { children: string; className?: string }) {
  return <p className={className}>{render(children)}</p>;
}

/** The same markup without the paragraph, for a caption or a table cell. */
export function inlineMarkdown(text: string): React.ReactNode {
  return render(text);
}

// One pass, longest-delimiter-first so `**` is never read as two `*`. Links come
// first because their label may itself contain code.
const TOKEN = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

function render(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index!;
    if (at > last) out.push(text.slice(last, at));
    const [, label, href, code, bold, italic] = m;
    if (href !== undefined) {
      const internal = href.startsWith("/") || href.startsWith("#");
      const cls = "font-medium underline underline-offset-4";
      out.push(
        internal ? (
          <Link key={key++} href={href} className={cls}>
            {render(label!)}
          </Link>
        ) : (
          <a key={key++} href={href} className={cls} target="_blank" rel="noreferrer">
            {render(label!)}
          </a>
        ),
      );
    } else if (code !== undefined) {
      out.push(<InlineCode key={key++}>{code}</InlineCode>);
    } else if (bold !== undefined) {
      out.push(
        <strong key={key++} className="font-semibold">
          {render(bold)}
        </strong>,
      );
    } else {
      out.push(
        <em key={key++} className="italic">
          {render(italic!)}
        </em>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
