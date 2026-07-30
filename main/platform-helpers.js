const os = require('os');
const path = require('path');

function isWindows(platform = process.platform) {
  return platform === 'win32';
}

function getDefaultShell({ platform = process.platform, env = process.env } = {}) {
  if (env.PICKAGENT_SHELL) return env.PICKAGENT_SHELL;
  if (isWindows(platform)) return 'powershell.exe';
  return env.SHELL || '/bin/zsh';
}

function shellQuote(value, platform = process.platform) {
  const text = String(value ?? '');
  if (isWindows(platform)) return `'${text.replace(/'/g, "''")}'`;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function buildShellInputLine(command, platform = process.platform) {
  return `${String(command || '').trim()}; exit${isWindows(platform) ? '\r\n' : '\n'}`;
}

function buildShellSpawn(command, options = {}, { platform = process.platform, env = process.env } = {}) {
  const baseOptions = {
    ...options,
    env: options.env || env,
  };

  if (!isWindows(platform)) {
    return {
      command,
      args: [],
      options: {
        ...baseOptions,
        shell: true,
      },
    };
  }

  return {
    command: getDefaultShell({ platform, env }),
    args: [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      String(command || ''),
    ],
    options: {
      ...baseOptions,
      shell: false,
      detached: false,
      windowsHide: true,
    },
  };
}

function shouldDetachChild(platform = process.platform) {
  return !isWindows(platform);
}

function buildPathEnv({ platform = process.platform, env = process.env, homeDir = os.homedir() } = {}) {
  const windows = isWindows(platform);
  const additions = windows
    ? [
        path.join(homeDir, 'AppData', 'Local', 'Programs'),
        path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'WindowsApps'),
      ]
    : [
        path.join(homeDir, '.local', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
      ];

  return [
    ...additions,
    windows ? (env.Path || env.PATH || '') : (env.PATH || env.Path || ''),
  ].filter(Boolean).join(windows ? ';' : path.delimiter);
}

function buildEnvWithPath({ platform = process.platform, env = process.env, homeDir = os.homedir() } = {}) {
  const next = { ...env };
  const pathValue = buildPathEnv({ platform, env, homeDir });
  if (isWindows(platform)) {
    delete next.PATH;
    next.Path = pathValue;
  } else {
    next.PATH = pathValue;
  }
  return next;
}

module.exports = {
  buildPathEnv,
  buildEnvWithPath,
  buildShellInputLine,
  buildShellSpawn,
  getDefaultShell,
  isWindows,
  shellQuote,
  shouldDetachChild,
};
