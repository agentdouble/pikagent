/**
 * Split raw text into lines, filter empty, optionally map.
 * @param {string} raw
 * @param {((line: string) => *)?} [mapFn]
 * @returns {Array}
 */
function splitLines(raw, mapFn) {
  if (!raw) return [];
  const lines = raw.trim().split('\n').filter(Boolean);
  return mapFn ? lines.map(mapFn) : lines;
}

/**
 * Match a regex and return a specific group, or null.
 * @param {string} text
 * @param {RegExp} pattern
 * @param {number} [group=0]
 * @returns {string|null}
 */
function matchFirst(text, pattern, group = 0) {
  const m = text.match(pattern);
  return m ? m[group] : null;
}

module.exports = { splitLines, matchFirst };
