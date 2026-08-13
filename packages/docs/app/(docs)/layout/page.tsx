import { DocSection } from "@/components/DocSection";
import { layout } from "@/examples/layout";

export default function LayoutPage() {
  return (
    <DocSection
      title="Layout"
      intro="You do not place anything — the connections do. Each scope is drawn in layers along its own flow, and long connections get a corridor reserved through the layers they cross, so nothing runs over a box it has nothing to do with. Hints like rightOf and below are constraints on that, never coordinates: they say same layer, in this order, or a layer later. There is no way to write a position, which is what lets a diagram survive having something added to it. How far apart things sit is covered in Spacing, and how big each box is by `width` / `height` in Styling."
      examples={layout}
    />
  );
}
