import { DocSection } from "@/components/DocSection";
import { blocks } from "@/examples/blocks";

export default function BlocksPage() {
  return (
    <DocSection
      title="Blocks"
      intro="Containers group shapes and size themselves to fit. Use `service` for an accented block or `group` for a plain frame; nest them freely."
      examples={blocks}
    />
  );
}
