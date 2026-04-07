const fsp = require('fs/promises');
const path = require('path');
const { CONFIG_DIR, META_FILE } = require('./paths');
const { readJson, writeJson, ensureDirOnce, readDirJson } = require('./fs-utils');
const { DEFAULT_META, sanitizeName, buildConfigRecord, formatConfigList } = require('./config-helpers');
const { Cache } = require('./cache');
const { createLogger } = require('./logger');

const log = createLogger('config-manager');
const ensureDir = ensureDirOnce(CONFIG_DIR);
const _metaCache = new Cache();

function configPath(name) {
  return path.join(CONFIG_DIR, `${sanitizeName(name)}.json`);
}

async function readMeta() {
  const cached = _metaCache.get();
  if (cached) return cached;
  const meta = (await readJson(META_FILE)) || { ...DEFAULT_META };
  _metaCache.set(meta);
  return meta;
}

async function writeMeta(meta) {
  await ensureDir();
  _metaCache.set(meta);
  await writeJson(META_FILE, meta);
}

async function save(name, data) {
  await ensureDir();
  const existing = await readJson(configPath(name));
  const config = buildConfigRecord(name, data, existing);
  await writeJson(configPath(name), config);
  return config;
}

async function load(name) {
  return readJson(configPath(name));
}

async function list() {
  await ensureDir();
  const meta = await readMeta();
  try {
    const configs = await readDirJson(CONFIG_DIR);
    return formatConfigList(configs, meta.defaultConfig);
  } catch (err) {
    log.warn('list failed', err);
    return [];
  }
}

async function remove(name) {
  try {
    await fsp.unlink(configPath(name));
    const meta = await readMeta();
    if (meta.defaultConfig === name) {
      meta.defaultConfig = null;
      await writeMeta(meta);
    }
    return true;
  } catch (err) {
    log.warn('remove failed', err);
    return false;
  }
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

module.exports = { save, load, list, remove, setDefault, getDefault, loadDefault };
