import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "power — architecture diagrams",
  description: "Free-form architecture diagrams with controllable, relative layout.",
};

// Set the theme before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
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
      </body>
    </html>
  );
}
