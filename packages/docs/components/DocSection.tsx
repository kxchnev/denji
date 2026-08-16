import { Example } from "@/components/Example";
import { Prose } from "@/components/Prose";
import type { ExampleData } from "@/examples/types";

export function DocSection({
  title,
  intro,
  examples,
  children,
}: {
  title: string;
  /** Markdown, inline only — see {@link Prose}. */
  intro: string;
  examples: ExampleData[];
  /** Rendered between the intro and the examples. */
  children?: React.ReactNode;
}) {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <Prose className="mt-3 text-lg leading-7 text-muted-foreground">{intro}</Prose>
      {children}
      {examples.map((e) => (
        <Example key={e.id} {...e} />
      ))}
    </article>
  );
}
