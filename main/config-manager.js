const fsp = require('fs/promises');
const path = require('path');
const { CONFIG_DIR, META_FILE } = require('./paths');
const DEFAULT_META = { defaultConfig: null };

let _dirReady = null;
let _metaCache = null;

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '_').substring(0, 64);
}

function configPath(name) {
  return path.join(CONFIG_DIR, `${sanitizeName(name)}.json`);
}

async function ensureDir() {
  if (!_dirReady) {
    _dirReady = fsp.mkdir(CONFIG_DIR, { recursive: true });
  }
  return _dirReady;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function readMeta() {
  if (_metaCache) return _metaCache;
  _metaCache = (await readJson(META_FILE)) || { ...DEFAULT_META };
  return _metaCache;
}

async function writeMeta(meta) {
  await ensureDir();
  _metaCache = meta;
  await fsp.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

async function save(name, data) {
  await ensureDir();
  const existing = await readJson(configPath(name));
  const config = {
    ...data,
    name,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(configPath(name), JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

async function load(name) {
  return readJson(configPath(name));
}

async function list() {
  await ensureDir();
  const meta = await readMeta();
  try {
    const files = (await fsp.readdir(CONFIG_DIR)).filter((f) => f.endsWith('.json'));
    const results = await Promise.all(
      files.map(async (f) => {
        const data = await readJson(path.join(CONFIG_DIR, f));
        if (!data || data.name === '__autosave__') return null;
        return {
          name: data.name,
          updatedAt: data.updatedAt,
          tabCount: data.tabs ? data.tabs.length : 0,
          isDefault: meta.defaultConfig === data.name,
        };
      })
    );
    return results.filter(Boolean);
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

module.exports = { save, load, list, remove, setDefault, getDefault, loadDefault };
