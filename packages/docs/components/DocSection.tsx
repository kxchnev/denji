import { Example } from "@/components/Example";
import type { ExampleData } from "@/examples/types";

export function DocSection({
  title,
  intro,
  examples,
}: {
  title: string;
  intro: string;
  examples: ExampleData[];
}) {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-muted-foreground">{intro}</p>
      {examples.map((e) => (
        <Example key={e.id} {...e} />
      ))}
    </article>
  );
}
