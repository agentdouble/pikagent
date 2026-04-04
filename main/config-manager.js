const fsp = require('fs/promises');
const path = require('path');
const { CONFIG_DIR, META_FILE } = require('./paths');
const { readJson, writeJson, ensureDirOnce, readDirJson } = require('./fs-utils');
const { DEFAULT_META, sanitizeName, buildConfigRecord, formatConfigList } = require('./config-helpers');

const ensureDir = ensureDirOnce(CONFIG_DIR);
let _metaCache = null;

function configPath(name) {
  return path.join(CONFIG_DIR, `${sanitizeName(name)}.json`);
}

async function readMeta() {
  if (_metaCache) return _metaCache;
  _metaCache = (await readJson(META_FILE)) || { ...DEFAULT_META };
  return _metaCache;
}

async function writeMeta(meta) {
  await ensureDir();
  _metaCache = meta;
  await writeJson(META_FILE, meta);
}

async function save(name, data) {
  await ensureDir();
  const existing = await readJson(configPath(name));
  const config = buildConfigRecord(name, data, existing, new Date().toISOString());
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
    console.warn('config-manager: list failed:', err.message);
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
    console.warn('config-manager: remove failed:', err.message);
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

function registerHandlers(ipcMain) {
  const { registerForward, registerSpread } = require('./ipc-helpers');

  registerForward(ipcMain, { load, list, remove, setDefault, getDefault, loadDefault }, [
    ['config:load',        'load'],
    ['config:list',        'list'],
    ['config:delete',      'remove'],
    ['config:setDefault',  'setDefault'],
    ['config:getDefault',  'getDefault'],
    ['config:loadDefault', 'loadDefault'],
  ]);

  registerSpread(ipcMain, { save }, [
    ['config:save', 'save', ['name', 'data']],
  ]);
}

module.exports = { save, load, list, remove, setDefault, getDefault, loadDefault, registerHandlers };
