const os = require('os');
const { splitLines, matchFirst } = require('./parse-utils');
const { getDefaultShell } = require('./platform-helpers');

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
const DEFAULT_SHELL = getDefaultShell({ platform: os.platform(), env: process.env });

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
