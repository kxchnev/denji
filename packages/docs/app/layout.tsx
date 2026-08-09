import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "power — architecture diagrams",
  description: "Free-form architecture diagrams that lay themselves out.",
};

// Set the theme before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;

/**
 * The root layout owns only what every route shares: the document, the theme
 * script and the stylesheet. Chrome lives one level down — `(docs)` wraps the
 * reference pages in the header and sidebar, while the playground fills the
 * viewport on its own.
 *
 * `min-h-dvh` rather than `min-h-screen`: the playground is exactly `h-dvh`, and
 * on mobile Safari `100vh` is taller than the visible viewport, which would leave
 * a strip of scrollable page under a supposedly full-screen editor.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
