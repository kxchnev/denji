export * from "./model/geometry.js";
export * from "./model/arch.js";
export * from "./model/arch-builder.js";
export {
  STYLE_PROPS,
  lookupProp,
  isStyleSlot,
  normalizePropName,
  type StylePropSpec,
  type StyleValueKind,
} from "./model/style.js";
export { layoutArchitecture, type ArchLayoutOptions } from "./layout/arch/index.js";
export { renderArchitecture, type ArchRenderOptions, type ThemeMode } from "./render/arch-svg.js";
export { lightTheme, darkTheme, themes, resolveTheme, type Theme } from "./render/theme.js";
export {
  ICONS,
  ICON_ALIASES,
  ICON_NAMES,
  resolveIcon,
  isKnownIcon,
  canonicalIconName,
  fromSimpleIcon,
  validateIcon,
  IconError,
  type Icon,
  type SimpleIconLike,
} from "./model/icon.js";
export { parseArchitecture } from "./dsl/arch-parse.js";
export { DiagramParseError } from "./dsl/error.js";

import type { ArchDiagram } from "./model/arch.js";
import { layoutArchitecture, type ArchLayoutOptions } from "./layout/arch/index.js";
import { renderArchitecture, type ArchRenderOptions } from "./render/arch-svg.js";
import { parseArchitecture } from "./dsl/arch-parse.js";

/** Convenience: lay out an architecture diagram and render it to SVG. */
export function toSvg(
  diagram: ArchDiagram,
  opts: { layout?: ArchLayoutOptions; render?: ArchRenderOptions } = {},
): string {
  layoutArchitecture(diagram, opts.layout);
  return renderArchitecture(diagram, opts.render);
}

/** Convenience alias: parse `.pwr` architecture DSL into a diagram model. */
export const parse = parseArchitecture;
