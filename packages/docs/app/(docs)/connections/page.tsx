import { DocSection } from "@/components/DocSection";
import { connections } from "@/examples/connections";

export const metadata = {
  title: "Connections",
  description: "Operators, labels, and how a connector finds its way around the boxes.",
};

export default function ConnectionsPage() {
  return (
    <DocSection
      title="Connections"
      intro="`from -> to`, with the operator picking the direction and the line style, and an optional `: label` running to the end of the line. Connections are also the layout: a connector is not decoration on top of an arrangement, it is the reason the arrangement came out that way — see [How it works](/how-it-works). Directives go **before** the colon, since the label swallows everything after it."
      examples={connections}
    />
  );
}
