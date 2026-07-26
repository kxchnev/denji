import { DocSection } from "@/components/DocSection";
import { arrows } from "@/examples/arrows";

export default function ArrowsPage() {
  return (
    <DocSection
      title="Arrows"
      intro="Connections between nodes. The operator picks the direction and style; an optional label annotates it."
      examples={arrows}
    />
  );
}
