const os = require('os');
const { splitLines, matchFirst } = require('./parse-utils');

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

const CWD_OSC_PATTERN = /\x1b\]1337;CurrentDir=([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const MAX_CWD_OSC_BUFFER = 32 * 1024;

const POWERSHELL_CWD_SCRIPT = [
  '$global:__pickagentOriginalPrompt = $function:prompt;',
  'function global:prompt {',
  '  [Console]::Write("`e]1337;CurrentDir=$((Get-Location).Path)`a");',
  '  if ($global:__pickagentOriginalPrompt) { & $global:__pickagentOriginalPrompt }',
  '  else { "PS $((Get-Location).Path)> " }',
  '}',
].join(' ');

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

function isPowerShell(shell) {
  const executable = String(shell || '').split(/[\\/]/).pop().toLowerCase();
  return executable === 'powershell' || executable === 'powershell.exe'
    || executable === 'pwsh' || executable === 'pwsh.exe';
}

/**
 * Add a prompt hook on Windows so PowerShell reports its current directory
 * through an invisible OSC sequence after every completed command.
 */
function getShellArgs(shell, platform = process.platform) {
  if (platform !== 'win32' || !isPowerShell(shell)) return [];
  return ['-NoExit', '-Command', POWERSHELL_CWD_SCRIPT];
}

/**
 * Consume PTY output and return the latest cwd reported by the shell. The
 * unconsumed tail is retained because an OSC sequence may span data chunks.
 */
function consumeCwdOsc(previousBuffer, data) {
  const combined = `${previousBuffer || ''}${data || ''}`;
  let latestCwd = null;
  let consumedUntil = 0;
  CWD_OSC_PATTERN.lastIndex = 0;

  for (const match of combined.matchAll(CWD_OSC_PATTERN)) {
    latestCwd = match[1];
    consumedUntil = match.index + match[0].length;
  }

  const tail = consumedUntil > 0 ? combined.slice(consumedUntil) : combined;
  return {
    cwd: latestCwd,
    buffer: tail.slice(-MAX_CWD_OSC_BUFFER),
  };
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
  getShellArgs,
  consumeCwdOsc,
};
