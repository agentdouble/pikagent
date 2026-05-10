const { exec } = require('child_process');
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { BASE_DIR } = require('./paths');

const SOURCE_CONFIG_FILE = path.join(BASE_DIR, 'source-config.json');
const REPO_URL = 'https://github.com/agentdouble/pikagent.git';
const DEFAULT_SOURCE_DIR = path.join(BASE_DIR, 'source');

// Fallback PATH covering common locations for git/node/npm on macOS,
// used when the app is launched from Finder (process.env.PATH is minimal).
const PATH_FALLBACKS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

// --- Config persistence ---

function init() {
  if (!app.isPackaged) {
    _saveConfig({ root: app.getAppPath(), shellPath: process.env.PATH });
  }
}

function _saveConfig(config) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(SOURCE_CONFIG_FILE, JSON.stringify(config), 'utf8');
}

function _loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(SOURCE_CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// --- Source resolution ---

function _hasGitCheckout(dir) {
  return !!dir && fs.existsSync(path.join(dir, '.git'));
}

function _resolveExistingRoot() {
  if (!app.isPackaged) return app.getAppPath();
  const config = _loadConfig();
  if (_hasGitCheckout(config?.root)) return config.root;
  if (_hasGitCheckout(DEFAULT_SOURCE_DIR)) {
    _saveConfig({ root: DEFAULT_SOURCE_DIR, shellPath: _composeShellPath() });
    return DEFAULT_SOURCE_DIR;
  }
  return null;
}

function _composeShellPath() {
  const saved = _loadConfig()?.shellPath;
  const parts = [saved, process.env.PATH, ...PATH_FALLBACKS].filter(Boolean);
  return [...new Set(parts.join(':').split(':').filter(Boolean))].join(':');
}

function _getShellPath() {
  if (!app.isPackaged) return process.env.PATH;
  return _composeShellPath();
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

// --- Cloning ---

async function _cloneSource() {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  if (fs.existsSync(DEFAULT_SOURCE_DIR)) {
    await _run(`rm -rf "${DEFAULT_SOURCE_DIR}"`, BASE_DIR);
  }
  await _run(`git clone ${REPO_URL} "${DEFAULT_SOURCE_DIR}"`, BASE_DIR);
  _saveConfig({ root: DEFAULT_SOURCE_DIR, shellPath: _composeShellPath() });
  return DEFAULT_SOURCE_DIR;
}

// --- Public API ---

function getVersion() {
  return app.getVersion();
}

async function checkForUpdates() {
  const root = _resolveExistingRoot();
  if (!root) {
    return {
      available: true,
      count: 1,
      commits: ['First-time setup: source repository will be cloned'],
    };
  }
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
  let root = _resolveExistingRoot();
  const willClone = !root;

  const steps = [
    willClone
      ? {
          label: 'Cloning source repository (first run, ~1-2 min)...',
          action: async () => { root = await _cloneSource(); },
        }
      : {
          label: 'Pulling latest changes...',
          action: async () => {
            const branch = await _run('git rev-parse --abbrev-ref HEAD', root);
            await _run(`git pull origin ${branch}`, root);
          },
        },
    { label: 'Installing dependencies...', action: () => _run('npm install', root) },
    { label: 'Packaging application...', action: () => _run('npm run package', root) },
    {
      label: 'Installing to Applications...',
      action: async () => {
        const src = path.join(root, 'release', 'mac-arm64', 'Pickagent.app');
        const dest = '/Applications/Pickagent.app';
        await _run(`rm -rf "${dest}" && cp -R "${src}" "${dest}"`, root);
      },
    },
  ];

  for (let i = 0; i < steps.length; i++) {
    sendProgress({ step: i + 1, total: steps.length, label: steps[i].label });
    await steps[i].action();
  }

  return { success: true };
}

function relaunch() {
  app.relaunch();
  setTimeout(() => app.exit(0), 300);
}

module.exports = { init, getVersion, checkForUpdates, performUpdate, relaunch };
