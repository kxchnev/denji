import { DocSection } from "@/components/DocSection";
import { styling } from "@/examples/styling";

export const metadata = {
  title: "Styling",
  description: "Themes, style blocks, named styles and inline properties — and how they cascade.",
};

export default function StylingPage() {
  return (
    <DocSection
      title="Styling"
      intro="Every element is painted by a theme — light and dark ship built in — and you override it with CSS on the smallest possible scale. A `style` block named after a kind restyles all of them; a block with any other name is a reusable style you attach with `@style(name)`; a bare `@fill(...)` on one element beats both. On screen a diagram follows the page's light/dark setting; an export bakes whichever palette you are looking at. Most of it is paint only; `width` and `height` are the exception — they are read by the layout."
      examples={styling}
    />
  );
}
