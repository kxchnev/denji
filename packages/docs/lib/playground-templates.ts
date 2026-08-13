import { intro, shapes, layout, type ExampleData } from "@/examples";

/**
 * Starting points offered when a new diagram is still empty.
 *
 * Templates reuse the documentation examples by **id** rather than by index:
 * reordering `examples/blocks.ts` now fails loudly at build time instead of
 * silently swapping one template for another.
 *
 * Keep this file free of Tailwind classes — `tailwind.config.ts` only scans
 * `app/` and `components/`, so anything written here would be purged.
 */
function byId(list: ExampleData[], id: string): ExampleData {
  const found = list.find((e) => e.id === id);
  if (!found) throw new Error(`playground template references a missing example: ${id}`);
  return found;
}

export interface Template {
  id: string;
  label: string;
  description: string;
  dsl: string;
}

export const templates: Template[] = [
  {
    id: "empty",
    label: "Empty",
    description: "Start from a blank document.",
    dsl: "architecture\n  ",
  },
  {
    id: "system",
    label: "System",
    description: "A gateway, two services and a shared event bus.",
    dsl: intro.dsl,
  },
  {
    id: "service",
    label: "Service",
    description: "One service box grouping the parts that belong together.",
    dsl: byId(shapes, "service").dsl,
  },
  {
    id: "nested",
    label: "Nested",
    description: "A group holding services, nested as deep as you like.",
    dsl: byId(shapes, "nested").dsl,
  },
  {
    id: "layout",
    label: "Layout",
    description: "Relative hints placing elements around each other.",
    dsl: byId(layout, "relative").dsl,
  },
];
