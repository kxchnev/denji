import { DocSection } from "@/components/DocSection";
import { links } from "@/examples/links";

export default function LinksPage() {
  return (
    <DocSection
      title="Links"
      intro="A diagram is usually the index to something else — a runbook, a dashboard, the repo. `@link(url)` puts a small button in an element's top-right corner that opens it. Only `http`, `https` and `mailto` are accepted, and the URL is unquoted, so it ends at the first `)` — percent-encode one as `%29`. The button is an overlay: it never changes a box's size or where it sits, which does mean a long label passes underneath it. Connections cannot carry a link."
      examples={links}
    />
  );
}
