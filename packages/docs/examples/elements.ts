import type { ExampleData } from "./types";

export const elements: ExampleData[] = [
  {
    id: "app",
    title: "App",
    description: "A rounded rectangle — the default building block for a service or component.",
    dsl: `architecture\n  app api "API Service"`,
    api: `architecture()\n  .app("api", "API Service")\n  .build();`,
  },
  {
    id: "database",
    title: "Database",
    description: "A vertical cylinder for a data store.",
    dsl: `architecture\n  database db "PostgreSQL"`,
    api: `architecture()\n  .database("db", "PostgreSQL")\n  .build();`,
  },
  {
    id: "queue",
    title: "Queue",
    description: "A horizontal cylinder for a message queue or stream.",
    dsl: `architecture\n  queue bus "Message Queue"`,
    api: `architecture()\n  .queue("bus", "Message Queue")\n  .build();`,
  },
  {
    id: "rect",
    title: "Rect",
    description: "A plain rectangle for anything that isn't a specific kind.",
    dsl: `architecture\n  rect box "External System"`,
    api: `architecture()\n  .rect("box", "External System")\n  .build();`,
  },
];
