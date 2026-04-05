/**
 * Utility for building immutable record objects with automatic timestamp.
 */

/**
 * Merges base and overrides into a new record, automatically setting updatedAt
 * to the current ISO timestamp.
 * @param {Object} base - The base object to spread
 * @param {Object} overrides - Additional fields to apply on top (may include createdAt, etc.)
 * @returns {Object} merged record with updatedAt set to now
 */
function buildRecord(base, overrides) {
  return { ...base, updatedAt: new Date().toISOString(), ...overrides };
}

module.exports = { buildRecord };
