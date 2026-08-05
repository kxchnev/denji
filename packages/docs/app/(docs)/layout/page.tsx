import { DocSection } from "@/components/DocSection";
import { layout } from "@/examples/layout";

export default function LayoutPage() {
  return (
    <DocSection
      title="Layout"
      intro="Positioning is relative by default: anchor each node to a sibling, and a single relation also centers the cross axis (override with align). Where that is not what you want, `@at(x, y)` places a node exactly — and dragging a node in the playground writes that directive for you, so the picture and the code are never out of step. How far apart the results sit is covered in Spacing, and how big each box is by `width` / `height` in Styling."
      examples={layout}
    />
  );
}
