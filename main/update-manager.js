const { exec } = require('child_process');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { BASE_DIR } = require('./paths');

const SOURCE_CONFIG_FILE = path.join(BASE_DIR, 'source-config.json');

// --- Config persistence (saves project root + shell PATH from dev mode) ---

function init() {
  if (!app.isPackaged) {
    const config = { root: app.getAppPath(), shellPath: process.env.PATH };
    fs.mkdirSync(BASE_DIR, { recursive: true });
    fs.writeFileSync(SOURCE_CONFIG_FILE, JSON.stringify(config), 'utf8');
  }
}

function _loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(SOURCE_CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function _getProjectRoot() {
  if (!app.isPackaged) return app.getAppPath();
  return _loadConfig()?.root || null;
}

function _getShellPath() {
  if (!app.isPackaged) return process.env.PATH;
  return _loadConfig()?.shellPath || process.env.PATH;
}

// --- Shell execution ---

function _run(cmd, cwd) {
  const shellPath = _getShellPath();
  return new Promise((resolve, reject) => {
    exec(cmd, {
      cwd,
      env: { ...process.env, PATH: shellPath },
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).slice(0, 500)));
      else resolve(stdout.trim());
    });
  });
}

// --- Public API ---

function getVersion() {
  return app.getVersion();
}

async function checkForUpdates() {
  const root = _getProjectRoot();
  if (!root) return { available: false, error: 'Source directory not configured. Run the app in dev mode first.' };

  try {
    await _run('git fetch origin', root);
    const branch = await _run('git rev-parse --abbrev-ref HEAD', root);
    const log = await _run(`git log HEAD..origin/${branch} --oneline`, root);
    const commits = log ? log.split('\n').filter(Boolean) : [];
    return { available: commits.length > 0, commits, count: commits.length };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

async function performUpdate(sendProgress) {
  const root = _getProjectRoot();
  if (!root) throw new Error('Source directory not configured');

  const branch = await _run('git rev-parse --abbrev-ref HEAD', root);

  const steps = [
    { label: 'Pulling latest changes...', cmd: `git pull origin ${branch}` },
    { label: 'Installing dependencies...', cmd: 'npm install' },
    { label: 'Packaging application...', cmd: 'npm run package' },
  ];

  for (let i = 0; i < steps.length; i++) {
    sendProgress({ step: i + 1, total: steps.length + 1, label: steps[i].label });
    await _run(steps[i].cmd, root);
  }

  // Copy to /Applications
  sendProgress({ step: steps.length + 1, total: steps.length + 1, label: 'Installing to Applications...' });
  const src = path.join(root, 'release', 'mac-arm64', 'Pickagent.app');
  const dest = '/Applications/Pickagent.app';
  await _run(`rm -rf "${dest}" && cp -R "${src}" "${dest}"`, root);

  return { success: true };
}

function relaunch() {
  app.relaunch();
  setTimeout(() => app.exit(0), 300);
}

module.exports = { init, getVersion, checkForUpdates, performUpdate, relaunch };
