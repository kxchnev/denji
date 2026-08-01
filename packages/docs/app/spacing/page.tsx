import { DocSection } from "@/components/DocSection";
import { spacing } from "@/examples/spacing";

export default function SpacingPage() {
  return (
    <DocSection
      title="Spacing"
      intro="Two levels of control, and the difference matters: `@gap` sits on a node and sets the distance to its own anchor, while `@spacing` sits on a scope — the `architecture` line or a container — and sets the default gap between that scope's children. Scope settings flow inward until a container overrides them. This is all about the space *between* boxes; the size of a box itself is `width` / `height` in Styling."
      examples={spacing}
    />
  );
}
