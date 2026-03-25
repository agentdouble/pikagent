const fsp = require('fs/promises');
const path = require('path');

async function readJson(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function ensureDirOnce(dirPath) {
  let _ready = null;
  return () => {
    if (!_ready) _ready = fsp.mkdir(dirPath, { recursive: true });
    return _ready;
  };
}

async function readDirJson(dirPath) {
  try {
    const files = (await fsp.readdir(dirPath)).filter((f) => f.endsWith('.json'));
    const results = await Promise.all(
      files.map((f) => readJson(path.join(dirPath, f)))
    );
    return results.filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = { readJson, ensureDirOnce, readDirJson };
