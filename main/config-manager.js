const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const CONFIG_DIR = path.join(BASE_DIR, 'configs');
const META_FILE = path.join(BASE_DIR, 'meta.json');

function ensureDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '_').substring(0, 64);
}

function configPath(name) {
  return path.join(CONFIG_DIR, `${sanitizeName(name)}.json`);
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
  } catch {
    return { defaultConfig: null };
  }
}

function writeMeta(meta) {
  ensureDir();
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
}

function save(name, data) {
  ensureDir();
  const config = {
    name,
    createdAt: new Date().toISOString(),
    ...data,
    updatedAt: new Date().toISOString(),
  };
  // Preserve original createdAt if updating
  try {
    const existing = JSON.parse(fs.readFileSync(configPath(name), 'utf-8'));
    config.createdAt = existing.createdAt;
  } catch {}
  fs.writeFileSync(configPath(name), JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

function load(name) {
  try {
    return JSON.parse(fs.readFileSync(configPath(name), 'utf-8'));
  } catch {
    return null;
  }
}

function list() {
  ensureDir();
  const meta = readMeta();
  try {
    const files = fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json'));
    return files.map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, f), 'utf-8'));
        // Hide internal autosave from the list
        if (data.name === '__autosave__') return null;
        return {
          name: data.name,
          updatedAt: data.updatedAt,
          tabCount: data.tabs ? data.tabs.length : 0,
          isDefault: meta.defaultConfig === data.name,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function remove(name) {
  try {
    fs.unlinkSync(configPath(name));
    const meta = readMeta();
    if (meta.defaultConfig === name) {
      meta.defaultConfig = null;
      writeMeta(meta);
    }
    return true;
  } catch {
    return false;
  }
}

function setDefault(name) {
  const meta = readMeta();
  meta.defaultConfig = name;
  writeMeta(meta);
}

function getDefault() {
  return readMeta().defaultConfig;
}

function loadDefault() {
  const name = getDefault();
  if (!name) return null;
  return load(name);
}

module.exports = { save, load, list, remove, setDefault, getDefault, loadDefault };
