import { DocSection } from "@/components/DocSection";
import { shapes } from "@/examples/shapes";

export const metadata = {
  title: "Shapes and containers",
  description: "The four shapes, the two containers, and how they nest.",
};

export default function ShapesPage() {
  return (
    <DocSection
      title="Shapes and containers"
      intro="Everything you declare is one of six things: four shapes, and two containers that hold them. A declaration is one line — a kind, an id, and an optional label — and the id is how everything else refers to it. Ids are `[A-Za-z0-9_]+`: no hyphens, no dots, and never a keyword like `app` or `service`, which are read as the start of a declaration."
      examples={shapes}
    />
  );
}
