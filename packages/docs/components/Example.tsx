import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Diagram } from "@/components/Diagram";
import { CodeBlock } from "@/components/CodeBlock";
import { Prose } from "@/components/Prose";
import type { ExampleData } from "@/examples/types";
import { slugify } from "@/lib/utils";

export function Example({ id, title, description, dsl, api }: ExampleData) {
  // The example's own id, not a slug of its title: it is what the datasets,
  // the playground templates and any link into this page already agree on, and
  // it survives a title being reworded.
  return (
    <section id={id} className="my-8 scroll-mt-24">
      <h3 className="group text-lg font-semibold tracking-tight">
        <a href={`#${id}`} className="no-underline">
          {title}
          <span
            aria-hidden
            className="ml-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          >
            #
          </span>
        </a>
      </h3>
      {description && <Prose className="mt-1 text-sm text-muted-foreground">{description}</Prose>}
      <Card className="mt-3 overflow-hidden">
        <Diagram dsl={dsl} name={slugify(title)} className="min-h-40 bg-card p-8" />
        <Tabs defaultValue="dsl" className="border-t">
          <div className="border-b px-3 py-2">
            <TabsList>
              <TabsTrigger value="dsl">DSL</TabsTrigger>
              <TabsTrigger value="api">API</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="dsl" className="m-0">
            <CodeBlock code={dsl} lang="denji" />
          </TabsContent>
          <TabsContent value="api" className="m-0">
            <CodeBlock code={api} lang="ts" />
          </TabsContent>
        </Tabs>
      </Card>
    </section>
  );
}
