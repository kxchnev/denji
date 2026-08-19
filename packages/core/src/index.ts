/**
 * The package entry — and the one module with a side effect.
 *
 * Importing `@kxchnev/denji` registers the bundled artwork, so `toSvg` draws
 * brand marks with nothing else asked of the caller. That is not the cheap way to
 * do it — it puts 4.8 MB of path data into whatever bundles this entry — it is
 * the **compatible** way: every release before this one carried the marks by
 * import, and code written against it must keep working. A browser cannot read a
 * file at import time and `resolveIcon` is synchronous, so for that promise to
 * hold in a bundle, the artwork has to be a module.
 *
 * The lighter road is still here and is what this repository's own products take
 * where they can: import the submodules you need, register the marks from
 * `assets/icons.json` (see `@kxchnev/denji/assets-node` or `registerIcons`), and
 * pay for the artwork once, as a file, instead of once per bundle.
 *
 * See NEXT-MAJOR.md — dropping this side effect is the first thing 2.0 does.
 */
import { ICONS } from "./model/icon.data.js";
import { registerIcons } from "./resources.js";

registerIcons(ICONS);

/**
 * Every bundled brand mark, by slug.
 *
 * @deprecated Prefer `registeredIcons()`, which answers with whatever artwork
 * this installation actually loaded — the file, the document's own `icon`
 * blocks, or this table. Reading the table directly is what forces it into every
 * bundle that touches the package entry.
 */
export { ICONS } from "./model/icon.data.js";

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
  ICON_ALIASES,
  ICON_NAMES,
  ICON_TITLES,
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
export {
  toSvgFile,
  toPng,
  toJpeg,
  type ExportOptions,
} from "./export.js";
export {
  registerIcons,
  registeredIcons,
  registerFont,
  registeredFonts,
  registerRasterizer,
  registeredRasterizer,
  type FontAsset,
} from "./resources.js";
export { LINK_SCHEMES, LinkError, validateLink } from "./model/link.js";
export {
  parseArchitecture,
  SHAPE_KIND_NAMES,
  CONTAINER_KIND_NAMES,
  ARCH_OPERATORS,
  DIRECTIVE_NAMES,
  DIRECTIVES,
  STYLABLE,
  ICON_PROP_NAMES,
  type DirectiveCtx,
  type DirectiveSpec,
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

/** Convenience alias: parse `.denji` architecture DSL into a diagram model. */
export const parse = parseArchitecture;
