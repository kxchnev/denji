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

/** Do two rects share any area? Merely touching edges does not count. */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

/** Rect built from a center point and a size — the friendlier way to place a node. */
export function rectFromCenter(c: Point, s: Size): Rect {
  return { x: c.x - s.width / 2, y: c.y - s.height / 2, width: s.width, height: s.height };
}
