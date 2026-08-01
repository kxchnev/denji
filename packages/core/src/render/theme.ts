import type { StyleProps, StyleSlot, ThemeName } from "../model/arch.js";

/**
 * A theme is the bottom layer of the cascade: one complete style bag per slot,
 * plus the two document-wide values. Everything the renderer paints has a
 * theme value behind it, so a `style` block only ever needs to override.
 */
export interface Theme {
  name: string;
  /**
   * Whether this palette sits on a dark surface. Brand marks consult it to pick
   * `Icon.darkColor`, so a near-black logo stays visible.
   */
  dark: boolean;
  /** Backdrop behind the whole drawing. `transparent` lets the host surface show. */
  background: string;
  /**
   * Opaque stand-in for `background`, used where transparency is impossible —
   * flattening to JPEG. Without it a dark diagram lands on white.
   */
  surface: string;
  fontFamily: string;
  slots: Record<StyleSlot, StyleProps>;
}

const FONT_FAMILY = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

/**
 * The palette the library shipped before themes existed, unchanged — an
 * existing diagram renders identically.
 */
export const lightTheme: Theme = {
  name: "light",
  dark: false,
  background: "transparent",
  surface: "#ffffff",
  fontFamily: FONT_FAMILY,
  slots: {
    app: { fill: "#eef2ff", stroke: "#6366f1", strokeWidth: 1.5, text: "#1e293b", radius: 10 },
    database: { fill: "#ecfdf5", stroke: "#10b981", strokeWidth: 1.5, text: "#1e293b" },
    queue: { fill: "#fef3c7", stroke: "#d97706", strokeWidth: 1.5, text: "#1e293b" },
    rect: { fill: "#f1f5f9", stroke: "#94a3b8", strokeWidth: 1.5, text: "#1e293b", radius: 0 },
    service: {
      fill: "#f5f6ff",
      stroke: "#6366f1",
      strokeWidth: 1.5,
      radius: 10,
      headerFill: "#6366f1",
      headerText: "#ffffff",
      fontWeight: "600",
    },
    group: {
      fill: "#f8fafc",
      stroke: "#94a3b8",
      strokeWidth: 1.5,
      radius: 8,
      dash: "6 4",
      text: "#475569",
      fontWeight: "600",
    },
    edge: {
      stroke: "#334155",
      strokeWidth: 1.5,
      text: "#475569",
      fill: "#ffffff",
      opacity: 0.9,
      dash: "6 4",
    },
  },
};

/**
 * The dark counterpart. Each shape keeps its hue identity — indigo for apps,
 * emerald for databases, amber for queues — but as a deep, low-chroma surface
 * with a bright rim and a tinted label, so the four kinds stay tellable apart
 * and every label clears 4.5:1 against its own fill. Containers sit *below*
 * their children in lightness, mirroring how the light theme puts them above.
 */
export const darkTheme: Theme = {
  name: "dark",
  dark: true,
  background: "transparent",
  surface: "#0b1220",
  fontFamily: FONT_FAMILY,
  slots: {
    app: { fill: "#1e1b4b", stroke: "#818cf8", strokeWidth: 1.5, text: "#e0e7ff", radius: 10 },
    database: { fill: "#022c22", stroke: "#34d399", strokeWidth: 1.5, text: "#d1fae5" },
    queue: { fill: "#451a03", stroke: "#fbbf24", strokeWidth: 1.5, text: "#fef3c7" },
    rect: { fill: "#1e293b", stroke: "#64748b", strokeWidth: 1.5, text: "#e2e8f0", radius: 0 },
    service: {
      fill: "#15142b",
      stroke: "#4f46e5",
      strokeWidth: 1.5,
      radius: 10,
      headerFill: "#4f46e5",
      headerText: "#eef2ff",
      fontWeight: "600",
    },
    group: {
      fill: "#0f172a",
      stroke: "#475569",
      strokeWidth: 1.5,
      radius: 8,
      dash: "6 4",
      text: "#94a3b8",
      fontWeight: "600",
    },
    edge: {
      stroke: "#94a3b8",
      strokeWidth: 1.5,
      text: "#cbd5e1",
      fill: "#0f172a",
      opacity: 0.9,
      dash: "6 4",
    },
  },
};

export const themes: Record<ThemeName, Theme> = { light: lightTheme, dark: darkTheme };

export function resolveTheme(theme: ThemeName | Theme | undefined): Theme {
  if (!theme) return lightTheme;
  return typeof theme === "string" ? themes[theme] : theme;
}
