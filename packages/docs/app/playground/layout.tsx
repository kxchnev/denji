import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Playground",
  description: "Write .pwr and watch the diagram render as you type.",
};

/**
 * The playground fills the viewport exactly, so nothing here may scroll: the
 * panes below manage their own overflow. `overscroll-none` stops the rubber-band
 * bounce that would otherwise reveal blank page behind a full-screen editor.
 *
 * This is a server component only so it can declare `metadata` — the page itself
 * is a client component and cannot.
 */
export default function PlaygroundLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden overscroll-none">{children}</div>
  );
}
