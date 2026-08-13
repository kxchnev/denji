import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { InlineCode } from "@/components/InlineCode";
import { ShellBlock } from "@/components/ShellBlock";
import { PRODUCT } from "@/lib/product";

export const metadata = {
  title: "Writing with an agent",
  description: "The skill file, how to install it, and the loop an agent should work in.",
};

/**
 * Read at build time from the one copy that exists — the same file this
 * repository's own agents load, and the same one `public/skill.md` is copied
 * from. A page that pasted its own version would be a second source of truth
 * for the language, which is the failure this whole site is arranged against.
 */
const SKILL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", ".claude", "skills", "denji-diagrams", "SKILL.md"),
  "utf8",
).trim();

const LOOP = `# 1. write the file, then
npx ${PRODUCT.cli} check diagram.denji

# 2. draw it and look at the picture
npx ${PRODUCT.cli} render diagram.denji -o /tmp/preview.png`;

export default function AgentsPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">Writing with an agent</h1>
      <p className="mt-3 text-lg leading-7 text-muted-foreground">
        A diagram-as-text language is written by a model about as often as by a person, and this one
        is built for it: the layout is not something to be nudged into place, the whole grammar fits
        in one file, and a checker says what is wrong with a line number.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Give it the grammar</h2>
      <p className="mt-2 leading-7">
        <InlineCode>spec</InlineCode> prints the complete language reference — the same file that
        backs this site. Pipe it into the context, or drop it in the repository as{" "}
        <InlineCode>llms.txt</InlineCode>:
      </p>
      <ShellBlock code={`npx ${PRODUCT.cli} spec > llms.txt`} />
      <p className="mt-4 leading-7">
        This site serves it too, at <InlineCode>/llms.txt</InlineCode>, next to the skill below at{" "}
        <InlineCode>/skill.md</InlineCode>. Both are copies of the files that ship, made at build
        time, so neither can describe a language the parser no longer speaks.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Install the skill</h2>
      <p className="mt-2 leading-7">
        The grammar says what is legal. The skill says what is <em>good</em> — draw the connections
        and stop, when a hint is worth writing, why a strip of boxes means a container is missing,
        and the traps that actually bite. For{" "}
        <a
          className="font-medium underline underline-offset-4"
          href="https://claude.com/claude-code"
          target="_blank"
          rel="noreferrer"
        >
          Claude Code
        </a>
        , a skill is a markdown file under <InlineCode>.claude/skills/</InlineCode> that is loaded
        when the task looks like the one it describes:
      </p>
      <ShellBlock
        code={`mkdir -p .claude/skills/denji-diagrams
curl -o .claude/skills/denji-diagrams/SKILL.md https://<docs>/skill.md`}
      />
      <p className="mt-4 leading-7">
        Commit it and every agent working in that repository picks it up. For a tool with no skill
        mechanism, the same file works as an <InlineCode>AGENTS.md</InlineCode> section, a rules
        file, or the system prompt of whatever is doing the writing — it is ordinary markdown and
        assumes nothing about who reads it.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">The loop that matters</h2>
      <p className="mt-2 leading-7">
        The skill spends its first paragraphs on this, and it is the part most worth enforcing
        yourself if you are wiring up your own agent:
      </p>
      <CodeBlock code={LOOP} lang="ts" />
      <p className="mt-4 leading-7">
        <Link className="font-medium underline underline-offset-4" href="/diagnostics">
          <InlineCode>check</InlineCode>
        </Link>{" "}
        catches what has a rule — a parse error, a hint cycle, boxes drawn on top of each other. It
        says nothing about a label colliding with a frame, or a diagram that is merely confusing.
        Rendering to a PNG and <em>looking at it</em> is the step agents skip and shouldn&apos;t:
        reading a picture is something they are good at, and it is the only way those get caught.
      </p>
      <p className="mt-4 leading-7">
        One more thing worth telling any agent that edits diagrams:{" "}
        <Link className="font-medium underline underline-offset-4" href="/editor">
          dragging a node in the preview rewrites the file
        </Link>
        . The source can change between turns, so it has to be re-read before every edit rather than
        held in memory.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">The skill in full</h2>
      <p className="mt-2 leading-7">
        This is the file, verbatim — copy it out of here if you would rather not{" "}
        <InlineCode>curl</InlineCode> it.
      </p>
      <CodeBlock code={SKILL} lang="pwr" />
    </article>
  );
}
