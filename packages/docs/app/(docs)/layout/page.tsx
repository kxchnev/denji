import { DocSection } from "@/components/DocSection";
import { layout } from "@/examples/layout";

export default function LayoutPage() {
  return (
    <DocSection
      title="Layout"
      intro="You do not place anything — the connections do. Each scope is drawn in layers along its own flow, and long connections get a corridor reserved through the layers they cross, so nothing runs over a box it has nothing to do with. Hints like rightOf and below are constraints on that, not coordinates: they say same layer, in this order, or a layer later. `@at(x, y)` still pins a node exactly, for a picture whose shape is not in the graph. How far apart things sit is covered in Spacing, and how big each box is by `width` / `height` in Styling."
      examples={layout}
    />
  );
}
