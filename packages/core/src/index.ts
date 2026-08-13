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
export {
  layoutArchitecture,
  DEFAULT_HEADER_H,
  type ArchLayoutOptions,
} from "./layout/arch/index.js";
export { type LayoutWarning } from "./layout/arch/auto.js";
export { GRID, HALF_GRID, ceilToGrid, snapHalf } from "./layout/arch/grid.js";
export {
  checkDiagram,
  type CheckResult,
  type Diagnostic,
  type DiagnosticCode,
  type DiagnosticSeverity,
} from "./check.js";
export { renderArchitecture, type ArchRenderOptions, type ThemeMode } from "./render/arch-svg.js";
export { lightTheme, darkTheme, themes, resolveTheme, type Theme } from "./render/theme.js";
export {
  ICONS,
  ICON_ALIASES,
  ICON_NAMES,
  ICONSET_VERSION,
  resolveIcon,
  isKnownIcon,
  canonicalIconName,
  fromSimpleIcon,
  validateIcon,
  IconError,
  type Icon,
  type SimpleIconLike,
} from "./model/icon.js";
export { POPULAR_ICONS } from "./model/icon.popular.js";
export { LINK_SCHEMES, LinkError, validateLink } from "./model/link.js";
export {
  parseArchitecture,
  SHAPE_KIND_NAMES,
  CONTAINER_KIND_NAMES,
  ARCH_OPERATORS,
  DIRECTIVE_NAMES,
  ICON_PROP_NAMES,
} from "./dsl/arch-parse.js";
export {
  setNodeRelation,
  findDeclaration,
  findHeaderLine,
  type Declaration,
} from "./dsl/arch-edit.js";
export { DiagramParseError } from "./dsl/error.js";
export {
  snapToGrid,
  relationFor,
  dropEdgeRect,
  DROP_EDGE,
  type Relation,
  nodeDepths,
  nodeAt,
  linkAt,
  linkBadgeRect,
  pickAt,
  isBoxed,
  LINK_BADGE,
  type LinkHit,
} from "./interact.js";

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
