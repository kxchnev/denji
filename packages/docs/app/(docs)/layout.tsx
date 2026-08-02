import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Header and sidebar for the reference pages. The playground opts out by living
 *  outside this route group. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-6 place-items-center rounded bg-primary text-xs text-primary-foreground">
              P
            </span>
            power
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-4">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 md:block">
          <Sidebar />
        </aside>
        <main className="min-w-0 flex-1 py-8">{children}</main>
      </div>
    </>
  );
}
