const os = require('os');
const { AGENTS } = require('../shared/agent-registry');
const { splitLines, matchFirst } = require('./parse-utils');

const KNOWN_AGENTS = AGENTS.map((a) => [a.id, a.label]);

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
  return splitLines(pgrepOutput, (p) => p.trim());
}

function parseCwdFromLsof(lsofOutput) {
  return matchFirst(lsofOutput, /^n(.+)$/m, 1);
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
};
