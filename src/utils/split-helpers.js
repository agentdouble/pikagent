/* Pure geometry helpers for split-panel layout calculations.
 * No DOM access — only math on numbers / plain objects. */

const EDGE_THRESHOLD = 0.3;
const INDICATOR_PAD = 2;
const MIN_RESIZE_RATIO = 0.1;
const MAX_RESIZE_RATIO = 0.9;

/** Maps each side to an indicator-rect builder: (rect, pad) → {left, top, width, height}. */
const SIDE_RECT_BUILDERS = {
  center: (r, p) => ({ left: r.left + p, top: r.top + p, width: r.width - p * 2, height: r.height - p * 2 }),
  left:   (r, p) => ({ left: r.left, top: r.top + p, width: r.width / 2, height: r.height - p * 2 }),
  right:  (r, p) => ({ left: r.left + r.width / 2, top: r.top + p, width: r.width / 2, height: r.height - p * 2 }),
  top:    (r, p) => ({ left: r.left + p, top: r.top, width: r.width - p * 2, height: r.height / 2 }),
  bottom: (r, p) => ({ left: r.left + p, top: r.top + r.height / 2, width: r.width - p * 2, height: r.height / 2 }),
};

/** Maps each direction to a predicate: (candidate, activeCenter) → boolean. */
const DIRECTION_PREDICATES = {
  left:  (c, a) => c.cx < a.cx,
  right: (c, a) => c.cx > a.cx,
  up:    (c, a) => c.cy < a.cy,
  down:  (c, a) => c.cy > a.cy,
};

/** Determine which side of a panel the cursor is closest to. */
export function detectDropSide(relX, relY) {
  const distances = { left: relX, right: 1 - relX, top: relY, bottom: 1 - relY };
  const minDist = Math.min(...Object.values(distances));
  if (minDist > EDGE_THRESHOLD) return 'center';
  return Object.keys(distances).find(side => distances[side] === minDist);
}

/** Compute indicator bounds {left, top, width, height} for a given side. */
export function computeIndicatorRect(rect, side) {
  return SIDE_RECT_BUILDERS[side](rect, INDICATOR_PAD);
}

/**
 * Compute the clamped flex ratio when resizing two adjacent panels.
 * @param {number} mousePos  – current mouse position (clientX or clientY)
 * @param {number} startPos  – start edge of the first panel
 * @param {number} totalSize – combined size of both panels
 * @returns {number} clamped ratio in [MIN_RESIZE_RATIO, MAX_RESIZE_RATIO]
 */
export function computeResizeRatio(mousePos, startPos, totalSize) {
  return Math.max(MIN_RESIZE_RATIO, Math.min(MAX_RESIZE_RATIO, (mousePos - startPos) / totalSize));
}

/**
 * Given a list of candidate rectangles and a direction, find the closest one
 * in that direction from the center of the active rectangle.
 *
 * @param {{ cx: number, cy: number }} activeCenter – center of the active panel
 * @param {{ id: string, cx: number, cy: number }[]} candidates
 * @param {'left'|'right'|'up'|'down'} dir
 * @returns {string|null} id of the closest candidate, or null
 */
export function findClosestInDirection(activeCenter, candidates, dir) {
  const inDir = DIRECTION_PREDICATES[dir];
  let bestId = null;
  let bestDist = Infinity;

  for (const { id, cx, cy } of candidates) {
    if (!inDir({ cx, cy }, activeCenter)) continue;
    const dist = Math.hypot(cx - activeCenter.cx, cy - activeCenter.cy);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = id;
    }
  }

  return bestId;
}

/**
 * Derive the split direction from a drop side string.
 * @param {'left'|'right'|'top'|'bottom'|'center'} side
 * @returns {'horizontal'|'vertical'}
 */
export function directionFromSide(side) {
  return (side === 'left' || side === 'right') ? 'horizontal' : 'vertical';
}

/**
 * Whether the element should be inserted before the target for the given side.
 * @param {'left'|'right'|'top'|'bottom'} side
 * @returns {boolean}
 */
export function isInsertBefore(side) {
  return side === 'left' || side === 'top';
}
