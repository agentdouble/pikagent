const { execFileAsync } = require('./command-utils');
const { isWindows } = require('./platform-helpers');

const PROCESS_LIST_TIMEOUT_MS = 5000;
const PROCESS_LIST_MAX_BUFFER = 10 * 1024 * 1024;

const WINDOWS_PROCESS_LIST_SCRIPT = `
Get-CimInstance Win32_Process |
  ForEach-Object {
    [pscustomobject]@{
      pid = [int]$_.ProcessId
      ppid = [int]$_.ParentProcessId
      startedAt = if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString("o") } else { $null }
      command = if ($_.CommandLine) { $_.CommandLine } else { $_.Name }
    }
  } |
  ConvertTo-Json -Compress
`;

async function listProcesses({ platform = process.platform, execFile = execFileAsync } = {}) {
  if (isWindows(platform)) {
    const { stdout } = await execFile('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      WINDOWS_PROCESS_LIST_SCRIPT,
    ], {
      encoding: 'utf8',
      timeout: PROCESS_LIST_TIMEOUT_MS,
      maxBuffer: PROCESS_LIST_MAX_BUFFER,
      windowsHide: true,
    });
    return parseWindowsProcessList(stdout);
  }

  const { stdout } = await execFile('ps', [
    '-axo',
    'pid=,ppid=,lstart=,command=',
  ], {
    encoding: 'utf8',
    timeout: PROCESS_LIST_TIMEOUT_MS,
    maxBuffer: PROCESS_LIST_MAX_BUFFER,
  });
  return parsePosixPsOutput(stdout);
}

function parsePosixPsOutput(output) {
  const rows = [];
  for (const line of String(output || '').split('\n')) {
    const match = line.match(
      /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/,
    );
    if (!match) continue;
    const parsedDate = new Date(match[3]);
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      startedAt: Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate.toISOString(),
      command: match[4],
    });
  }
  return rows;
}

function parseWindowsProcessList(output) {
  const raw = String(output || '').trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map(normalizeWindowsProcess).filter(Boolean);
}

function normalizeWindowsProcess(item) {
  const pid = Number(item?.pid ?? item?.ProcessId);
  const ppid = Number(item?.ppid ?? item?.ParentProcessId);
  if (!Number.isInteger(pid) || !Number.isInteger(ppid)) return null;
  const startedAt = normalizeDate(item?.startedAt ?? item?.CreationDate);
  return {
    pid,
    ppid,
    startedAt,
    command: String(item?.command ?? item?.CommandLine ?? item?.Name ?? ''),
  };
}

function normalizeDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function getDirectChildProcesses(pid, opts = {}) {
  const parentPid = Number(pid);
  if (!Number.isInteger(parentPid) || parentPid <= 0) return [];
  const rows = await listProcesses(opts);
  return rows.filter((row) => row.ppid === parentPid);
}

async function readProcessCwd(pid, { platform = process.platform, execFile = execFileAsync } = {}) {
  if (!pid || isWindows(platform)) return undefined;
  const { stdout } = await execFile('lsof', [
    '-a',
    '-p',
    String(pid),
    '-d',
    'cwd',
    '-Fn',
  ], {
    encoding: 'utf8',
    timeout: 2000,
  });
  const match = stdout.match(/^n(.+)$/m);
  return match?.[1];
}

async function terminateProcessTree(pid, { platform = process.platform, execFile = execFileAsync, signal = 'SIGTERM' } = {}) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return null;

  if (isWindows(platform)) {
    try {
      await execFile('taskkill', ['/PID', String(value), '/T', '/F'], {
        timeout: 5000,
        windowsHide: true,
      });
      return null;
    } catch (err) {
      const message = String(err?.message || err || '');
      if (err?.code === 128 || /not found|not running|introuvable/i.test(message)) return null;
      return `taskkill ${value} failed: ${message}`;
    }
  }

  try {
    process.kill(-value, signal);
    return null;
  } catch (err) {
    if (err?.code === 'ESRCH') return null;
    try {
      process.kill(value, signal);
      return null;
    } catch (fallbackErr) {
      if (fallbackErr?.code === 'ESRCH') return null;
      return `kill ${signal} ${value} failed: ${fallbackErr.message}`;
    }
  }
}

module.exports = {
  getDirectChildProcesses,
  listProcesses,
  parsePosixPsOutput,
  parseWindowsProcessList,
  readProcessCwd,
  terminateProcessTree,
};
