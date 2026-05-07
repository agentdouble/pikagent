/**
 * Pure helpers for config-manager.
 * No I/O — deterministic functions that can be tested in isolation.
 */

const { buildTimestampedRecord } = require('./record-helpers');
const { sanitizeName } = require('../shared/string-utils');

const DEFAULT_META = { defaultConfig: null };

function buildConfigRecord(name, data, existing, now = new Date().toISOString()) {
  return buildTimestampedRecord({ ...data, name }, existing, now);
}

function formatConfigList(configs, defaultConfigName) {
  return configs
    .filter((data) => data.name !== '__autosave__')
    .map((data) => ({
      name: data.name,
      updatedAt: data.updatedAt,
      tabCount: data.tabs ? data.tabs.length : 0,
      isDefault: defaultConfigName === data.name,
    }));
}

module.exports = { DEFAULT_META, sanitizeName, buildConfigRecord, formatConfigList };
