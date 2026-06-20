const { CONFIG_DIR, META_FILE } = require('./paths');
const { DEFAULT_META, buildConfigRecord, formatConfigList } = require('./config-helpers');
// sanitizeName: config-oriented sanitization — keeps spaces, replaces
// special chars with underscores, truncates at 64 chars.  This differs from
// sanitizeSegment (git-ref-safe, hyphen-based) by design; see string-utils.js.
const { sanitizeName } = require('../shared/string-utils');
const { createManagerSafe } = require('./logger');
const { JsonStore } = require('./json-store');
const { CachedJsonFile } = require('./cached-json-file');

const store = new JsonStore(CONFIG_DIR, 'config-manager', {
  idToFile: (name) => `${sanitizeName(name)}.json`,
});
const _meta = new CachedJsonFile(META_FILE, () => store.ensureDir(), DEFAULT_META);
const _safe = createManagerSafe(store.log, 'config-manager');

const readMeta = () => _meta.read();
const writeMeta = (meta) => _meta.write(meta);

async function save(name, data) {
  await store.ensureDir();
  const existing = await store.get(name);
  const config = buildConfigRecord(name, data, existing);
  await store.save(name, config);
  return config;
}

async function load(name) {
  return store.get(name);
}

async function list() {
  const meta = await readMeta();
  return _safe(
    async () => formatConfigList(await store.list(), meta.defaultConfig),
    [],
  );
}

async function remove(name) {
  return _safe(
    async () => {
      await store.removeOrThrow(name);
      const meta = await readMeta();
      if (meta.defaultConfig === name) {
        meta.defaultConfig = null;
        await writeMeta(meta);
      }
      return true;
    },
    false,
  );
}

async function setDefault(name) {
  const meta = await readMeta();
  meta.defaultConfig = name;
  await writeMeta(meta);
}

async function getDefault() {
  const meta = await readMeta();
  return meta.defaultConfig;
}

async function loadDefault() {
  const name = await getDefault();
  if (!name) return null;
  return load(name);
}

module.exports = {
  save, load, list, remove, setDefault, getDefault, loadDefault,
  // Alias matching channel suffix (config:delete → delete)
  delete: remove,
};
