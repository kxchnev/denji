import { DocSection } from "@/components/DocSection";
import { IconGallery } from "@/components/IconGallery";
import { icons } from "@/examples/icons";

export default function IconsPage() {
  return (
    <DocSection
      title="Icons"
      intro="A logo is read faster than a word. `@icon(name)` puts a brand mark in a shape or a container title, in that brand's own colour, and the mark switches to a lighter variant on a dark palette when the brand colour would disappear. Icons change a shape's width but nothing else about the layout."
      examples={icons}
    >
      <IconGallery />
      <p className="mt-2 text-sm text-muted-foreground">
        Marks come from <a className="underline" href="https://simpleicons.org">Simple Icons</a> (CC0);
        the logos remain trademarks of their owners. AWS, Azure and the Oracle Java logo are absent
        from that set at those companies&apos; request — <code>openjdk</code> stands in for Java.
        Anything not bundled here can be declared with an <code>icon</code> block; running{" "}
        <code>power icon &lt;slug&gt;</code> prints one ready to paste.
      </p>
    </DocSection>
  );
}
