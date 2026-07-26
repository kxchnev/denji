export * from "./model/geometry.js";
export * from "./model/types.js";
export * from "./model/builder.js";
export { layoutFlowchart, type LayoutOptions } from "./layout/layered/index.js";
export { renderFlowchart, type RenderOptions } from "./render/svg.js";

import type { Flowchart } from "./model/types.js";
import { layoutFlowchart, type LayoutOptions } from "./layout/layered/index.js";
import { renderFlowchart, type RenderOptions } from "./render/svg.js";

/** Convenience: lay out a flowchart and render it to SVG in one call. */
export function toSvg(
  chart: Flowchart,
  opts: { layout?: LayoutOptions; render?: RenderOptions } = {},
): string {
  layoutFlowchart(chart, opts.layout);
  return renderFlowchart(chart, opts.render);
}
