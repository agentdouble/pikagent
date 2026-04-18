/**
 * Pure helpers for config-manager.
 * No I/O — deterministic functions that can be tested in isolation.
 */

const { buildRecord } = require('./record-helpers');

const DEFAULT_META = { defaultConfig: null };

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '_').substring(0, 64);
}

function buildConfigRecord(name, data, existing, now = new Date().toISOString()) {
  return buildRecord({ ...data, name }, { createdAt: existing?.createdAt || now, updatedAt: now });
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
