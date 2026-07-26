import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Diagram } from "@/components/Diagram";
import { CodeBlock } from "@/components/CodeBlock";
import type { ExampleData } from "@/examples/types";

export function Example({ title, description, dsl, api }: ExampleData) {
  return (
    <section className="my-8">
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <Card className="mt-3 overflow-hidden">
        <div className="flex min-h-40 items-center justify-center bg-[radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:16px_16px] p-8">
          <Diagram dsl={dsl} />
        </div>
        <Tabs defaultValue="dsl" className="border-t">
          <div className="border-b px-3 pt-2">
            <TabsList>
              <TabsTrigger value="dsl">DSL</TabsTrigger>
              <TabsTrigger value="api">API</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="dsl" className="m-0 p-3">
            <CodeBlock code={dsl} lang="text" />
          </TabsContent>
          <TabsContent value="api" className="m-0 p-3">
            <CodeBlock code={api} lang="ts" />
          </TabsContent>
        </Tabs>
      </Card>
    </section>
  );
}
