const { CONFIG_DIR, META_FILE } = require('./paths');
const { readJson, writeJson } = require('./fs-utils');
const { DEFAULT_META, sanitizeName, buildConfigRecord, formatConfigList } = require('./config-helpers');
const { Cache } = require('./cache');
const { trySafe } = require('./logger');
const { JsonStore } = require('./json-store');

const store = new JsonStore(CONFIG_DIR, 'config-manager', {
  idToFile: (name) => `${sanitizeName(name)}.json`,
});
const _metaCache = new Cache();

async function readMeta() {
  const cached = _metaCache.get();
  if (cached) return cached;
  const meta = (await readJson(META_FILE)) || { ...DEFAULT_META };
  _metaCache.set(meta);
  return meta;
}

async function writeMeta(meta) {
  await store.ensureDir();
  _metaCache.set(meta);
  await writeJson(META_FILE, meta);
}

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
  return trySafe(
    async () => formatConfigList(await store.list(), meta.defaultConfig),
    [],
    { log: store.log, label: 'list' },
  );
}

async function remove(name) {
  return trySafe(
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
    { log: store.log, label: 'remove' },
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
