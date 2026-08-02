import { DocSection } from "@/components/DocSection";
import { elements } from "@/examples/elements";

export default function ElementsPage() {
  return (
    <DocSection
      title="Elements"
      intro="The primitive shapes. Each takes an id and a label; the kind decides how it's drawn."
      examples={elements}
    />
  );
}
