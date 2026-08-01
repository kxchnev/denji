import { DocSection } from "@/components/DocSection";
import { layout } from "@/examples/layout";

export default function LayoutPage() {
  return (
    <DocSection
      title="Layout"
      intro="Positioning is relative-only — no absolute coordinates. Anchor each node to a sibling; a single relation also centers the cross axis (override with align). How far apart the results sit is covered in Spacing, and how big each box is by `width` / `height` in Styling."
      examples={layout}
    />
  );
}
