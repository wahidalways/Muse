/**
 * The hold ring around a cover: a rounded square that follows the cover's own
 * corners, `offset` points outside it (negative: inside), starting at the top
 * middle and running clockwise. Coordinates are inside a box that reaches
 * `extent` past every edge of the cover.
 */
export function ringPath(size: number, radius: number, offset: number, stroke: number) {
  const extent = Math.max(offset, 0) + stroke;
  const box = size + 2 * extent;
  const a = extent - offset;
  const b = box - a;
  const side = b - a;
  const r = Math.min(Math.max(radius + offset, 0), side / 2);
  const mid = box / 2;
  const d =
    `M${mid} ${a}H${b - r}A${r} ${r} 0 0 1 ${b} ${a + r}V${b - r}A${r} ${r} 0 0 1 ${b - r} ${b}` +
    `H${a + r}A${r} ${r} 0 0 1 ${a} ${b - r}V${a + r}A${r} ${r} 0 0 1 ${a + r} ${a}Z`;
  return { d, length: 4 * (side - 2 * r) + 2 * Math.PI * r, extent, box };
}
