const os = require('os');

const KNOWN_AGENTS = [
  ['claude', 'Claude'],
  ['codex', 'Codex'],
  ['opencode', 'OpenCode'],
];

const EXEC_TIMEOUT_MS = 1000;
const CWD_TIMEOUT_MS = 2000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const TERM = 'xterm-256color';
const DEFAULT_SHELL =
  process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');

function matchAgent(psOutput) {
  const lower = psOutput.toLowerCase();
  for (const [pattern, name] of KNOWN_AGENTS) {
    if (lower.includes(pattern)) return name;
  }
  return null;
}

function parseChildPids(pgrepOutput) {
  return pgrepOutput.trim().split('\n').filter(Boolean).map((p) => p.trim());
}

function parseCwdFromLsof(lsofOutput) {
  const match = lsofOutput.match(/^n(.+)$/m);
  return match ? match[1] : null;
}

function parseCwdFromPwdx(pwdxOutput) {
  const match = pwdxOutput.match(/:\s*(.+)/);
  return match ? match[1].trim() : null;
}

/**
 * Build the ordered list of cwd-detection strategies for the current platform.
 * Each strategy is `{ name, args(pid), parse(stdout) }`.
 */
function buildCwdStrategies() {
  const strategies = [
    {
      name: 'lsof',
      args: (pid) => ['lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']],
      parse: parseCwdFromLsof,
    },
  ];

  if (os.platform() === 'linux') {
    strategies.push({
      name: 'proc',
      args: (pid) => ['readlink', [`/proc/${pid}/cwd`]],
      parse: (out) => out.trim() || null,
    });
  }

  strategies.push({
    name: 'pwdx',
    args: (pid) => ['pwdx', [String(pid)]],
    parse: parseCwdFromPwdx,
  });

  return strategies;
}

module.exports = {
  EXEC_TIMEOUT_MS,
  CWD_TIMEOUT_MS,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  TERM,
  DEFAULT_SHELL,
  matchAgent,
  parseChildPids,
  parseCwdFromLsof,
  parseCwdFromPwdx,
  buildCwdStrategies,
};
