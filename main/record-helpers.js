/**
 * Utility for building immutable record objects with automatic timestamp.
 */

/**
 * Merges base and overrides into a new record, automatically setting updatedAt
 * to the current ISO timestamp.
 * @param {Record<string, unknown>} base - The base object to spread
 * @param {Record<string, unknown>} overrides - Additional fields to apply on top (may include createdAt, etc.)
 * @returns {Record<string, unknown> & { updatedAt: string }} merged record with updatedAt set to now
 */
function buildRecord(base, overrides) {
  return { ...base, updatedAt: new Date().toISOString(), ...overrides };
}

/**
 * Builds a record preserving `createdAt` from an existing record and setting
 * `updatedAt` to `now`.  Extracts the repeated createdAt/updatedAt pattern
 * shared by config-helpers and flow-manager.
 *
 * @param {Record<string, unknown>} base - The base object to spread
 * @param {Record<string, unknown> | null | undefined} existing - Existing record (may have createdAt)
 * @param {string} [now=new Date().toISOString()] - ISO timestamp; injectable for tests
 * @returns {Record<string, unknown> & { createdAt: string, updatedAt: string }}
 */
function buildTimestampedRecord(base, existing, now = new Date().toISOString()) {
  return buildRecord(base, { createdAt: existing?.createdAt || now, updatedAt: now });
}

module.exports = { buildRecord, buildTimestampedRecord };
