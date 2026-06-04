const { exec } = require('child_process');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { BASE_DIR } = require('./paths');
const { readJsonSync } = require('./fs-utils');
const { splitLines } = require('./parse-utils');

const SOURCE_CONFIG_FILE = path.join(BASE_DIR, 'source-config.json');
const UPDATE_BRANCH = 'main';
const UPDATE_REMOTE = 'origin';
const INSTALL_PATH = '/Applications/Pickagent.app';

// --- Config persistence (saves project root + shell PATH from dev mode) ---

function init() {
  if (!app.isPackaged) {
    const config = { root: app.getAppPath(), shellPath: process.env.PATH };
    fs.mkdirSync(BASE_DIR, { recursive: true });
    fs.writeFileSync(SOURCE_CONFIG_FILE, JSON.stringify(config), 'utf8');
  }
}

function _getProjectRoot() {
  if (!app.isPackaged) return app.getAppPath();
  return readJsonSync(SOURCE_CONFIG_FILE)?.root || null;
}

function _getShellPath() {
  if (!app.isPackaged) return process.env.PATH;
  return readJsonSync(SOURCE_CONFIG_FILE)?.shellPath || process.env.PATH;
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

async function _runOptional(cmd, cwd, fallback = null) {
  if (!cwd) return fallback;
  try {
    return await _run(cmd, cwd);
  } catch {
    return fallback;
  }
}

// --- Public API ---

function getVersion() {
  return app.getVersion();
}

async function getUpdateInfo() {
  const root = _getProjectRoot();
  const remoteUrl = await _runOptional(`git remote get-url ${UPDATE_REMOTE}`, root, null);
  const currentBranch = await _runOptional('git rev-parse --abbrev-ref HEAD', root, null);

  return {
    sourceConfigured: Boolean(root),
    sourceRoot: root,
    currentBranch,
    remote: UPDATE_REMOTE,
    remoteUrl,
    targetBranch: UPDATE_BRANCH,
    targetRef: `${UPDATE_REMOTE}/${UPDATE_BRANCH}`,
    installPath: INSTALL_PATH,
    packaged: app.isPackaged,
  };
}

async function checkForUpdates() {
  const root = _getProjectRoot();
  if (!root) return { available: false, error: 'Source directory not configured. Run the app in dev mode first.' };

  try {
    await _run(`git fetch ${UPDATE_REMOTE}`, root);
    const log = await _run(`git log HEAD..${UPDATE_REMOTE}/${UPDATE_BRANCH} --oneline`, root);
    const commits = log ? splitLines(log) : [];
    return { available: commits.length > 0, commits, count: commits.length, info: await getUpdateInfo() };
  } catch (err) {
    return { available: false, error: err.message, info: await getUpdateInfo() };
  }
}

async function performUpdate(sendProgress) {
  const root = _getProjectRoot();
  if (!root) throw new Error('Source directory not configured');

  const steps = [
    { label: `Checking out ${UPDATE_BRANCH}...`, cmd: `git checkout ${UPDATE_BRANCH}` },
    { label: `Pulling latest changes from ${UPDATE_REMOTE}/${UPDATE_BRANCH}...`, cmd: `git pull ${UPDATE_REMOTE} ${UPDATE_BRANCH}` },
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
  const dest = INSTALL_PATH;
  await _run(`rm -rf "${dest}" && cp -R "${src}" "${dest}"`, root);

  return { success: true };
}

function relaunch() {
  app.relaunch();
  setTimeout(() => app.exit(0), 300);
}

module.exports = { init, getVersion, getUpdateInfo, checkForUpdates, performUpdate, relaunch };
