/** Basic geometric primitives shared across the layout and render layers. */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function center(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Rect built from a center point and a size — the friendlier way to place a node. */
export function rectFromCenter(c: Point, s: Size): Rect {
  return { x: c.x - s.width / 2, y: c.y - s.height / 2, width: s.width, height: s.height };
}
