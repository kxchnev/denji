export interface NavItem {
  title: string;
  href: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Three groups, in the order someone meets them: get it running, learn the
 * language by example, then look things up.
 *
 * "Guide" rather than "Reference" for the middle group — those pages teach with
 * pictures and read top to bottom. The reference is the thing you arrive at
 * from a search box knowing what you want, which is why it is one page of
 * tables rather than eight pages of examples.
 */
export const nav: NavSection[] = [
  {
    title: "Getting started",
    items: [
      { title: "Introduction", href: "/" },
      { title: "Installation", href: "/installation" },
      { title: "Playground", href: "/playground" },
    ],
  },
  {
    title: "Guide",
    items: [
      { title: "Shapes and containers", href: "/shapes" },
      { title: "Connections", href: "/connections" },
      { title: "Layout", href: "/layout" },
      { title: "Spacing", href: "/spacing" },
      { title: "Styling", href: "/styling" },
      { title: "Icons", href: "/icons" },
      { title: "Links", href: "/links" },
      { title: "How it works", href: "/how-it-works" },
      { title: "Writing with an agent", href: "/agents" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Language", href: "/reference" },
      { title: "Diagnostics", href: "/diagnostics" },
      { title: "Library API", href: "/api" },
      { title: "CLI", href: "/cli" },
      { title: "VS Code", href: "/editor" },
    ],
  },
];
