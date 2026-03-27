/* Pure geometry helpers for split-panel layout calculations.
 * No DOM access — only math on numbers / plain objects. */

const EDGE_THRESHOLD = 0.3;
const INDICATOR_PAD = 2;
const MIN_RESIZE_RATIO = 0.1;
const MAX_RESIZE_RATIO = 0.9;

/** Determine which side of a panel the cursor is closest to. */
export function detectDropSide(relX, relY) {
  const distLeft = relX;
  const distRight = 1 - relX;
  const distTop = relY;
  const distBottom = 1 - relY;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist > EDGE_THRESHOLD) return 'center';
  if (minDist === distLeft) return 'left';
  if (minDist === distRight) return 'right';
  if (minDist === distTop) return 'top';
  return 'bottom';
}

/** Compute indicator bounds {left, top, width, height} for a given side. */
export function computeIndicatorRect(rect, side) {
  const pad = INDICATOR_PAD;
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;

  if (side === 'center') {
    return { left: rect.left + pad, top: rect.top + pad, width: rect.width - pad * 2, height: rect.height - pad * 2 };
  }
  if (side === 'left' || side === 'right') {
    return { left: rect.left + (side === 'right' ? halfW : 0), top: rect.top + pad, width: halfW, height: rect.height - pad * 2 };
  }
  return { left: rect.left + pad, top: rect.top + (side === 'bottom' ? halfH : 0), width: rect.width - pad * 2, height: halfH };
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
  let bestId = null;
  let bestDist = Infinity;

  for (const { id, cx, cy } of candidates) {
    let inDirection = false;
    if (dir === 'left' && cx < activeCenter.cx) inDirection = true;
    if (dir === 'right' && cx > activeCenter.cx) inDirection = true;
    if (dir === 'up' && cy < activeCenter.cy) inDirection = true;
    if (dir === 'down' && cy > activeCenter.cy) inDirection = true;
    if (!inDirection) continue;

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
