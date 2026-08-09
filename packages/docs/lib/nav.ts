export interface NavItem {
  title: string;
  href: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const nav: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Introduction", href: "/" },
      { title: "Playground", href: "/playground" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Elements", href: "/elements" },
      { title: "Arrows", href: "/arrows" },
      { title: "Blocks", href: "/blocks" },
      { title: "Layout", href: "/layout" },
      { title: "Spacing", href: "/spacing" },
      { title: "Styling", href: "/styling" },
      { title: "Icons", href: "/icons" },
      { title: "Links", href: "/links" },
    ],
  },
];
