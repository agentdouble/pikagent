const { spawn } = require('child_process');
const { MAX_FILE_SIZE, dirFirstCompare } = require('./fs-manager-helpers');
const {
  buildSshPath,
  joinRemotePath,
  parseSshPath,
} = require('./ssh-path-utils');

const SSH_CONNECT_ARGS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5'];
const SSH_TIMEOUT_MS = 8000;
const SSH_MAX_BUFFER = 5 * 1024 * 1024;

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function createRemoteCommand(remotePath, script) {
  return `PICKAGENT_PATH=${shellQuote(remotePath)}; ${script}`;
}

function runSshCommand(destination, command, { input = null, timeout = SSH_TIMEOUT_MS, maxBuffer = SSH_MAX_BUFFER } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [...SSH_CONNECT_ARGS, destination, command], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(Object.assign(new Error(`ssh ${destination} timed out`), { code: 'ETIMEDOUT' }));
    }, timeout);

    function collect(chunks, counterName, chunk) {
      chunks.push(chunk);
      if (counterName === 'stdout') stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (stdoutBytes + stderrBytes > maxBuffer && !settled) {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGTERM');
        reject(Object.assign(new Error(`ssh ${destination} output exceeded buffer`), { code: 'EMAXBUFFER' }));
      }
    }

    child.stdout.on('data', (chunk) => collect(stdout, 'stdout', chunk));
    child.stderr.on('data', (chunk) => collect(stderr, 'stderr', chunk));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      if (code === 0) {
        resolve({ stdout: out, stderr: err });
        return;
      }
      reject(Object.assign(new Error(err.toString('utf8').trim() || `ssh exited with code ${code}`), {
        code,
        stdout: out,
        stderr: err,
      }));
    });

    if (input === null || input === undefined) child.stdin.end();
    else child.stdin.end(input);
  });
}

async function resolveRemotePwd(destination) {
  const { stdout } = await runSshCommand(destination, 'pwd -P', { timeout: 5000, maxBuffer: 64 * 1024 });
  return stdout.toString('utf8').trim().split(/\r?\n/).pop() || '/';
}

async function readdir(sshPath) {
  const parsed = parseSshPath(sshPath);
  if (!parsed) return [];
  const script = `
if [ ! -d "$PICKAGENT_PATH" ]; then exit 2; fi
for entry in "$PICKAGENT_PATH"/* "$PICKAGENT_PATH"/.[!.]* "$PICKAGENT_PATH"/..?*; do
  [ -e "$entry" ] || continue
  name=\${entry##*/}
  [ "$name" = "." ] && continue
  [ "$name" = ".." ] && continue
  if [ -d "$entry" ]; then type=d; else type=f; fi
  printf '%s\t%s\n' "$type" "$name"
done
`;
  const { stdout } = await runSshCommand(
    parsed.destination,
    createRemoteCommand(parsed.path, script),
  );
  return stdout.toString('utf8').split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const tabIndex = line.indexOf('\t');
      if (tabIndex === -1) return null;
      const type = line.slice(0, tabIndex);
      const name = line.slice(tabIndex + 1);
      return {
        name,
        path: buildSshPath(parsed.destination, joinRemotePath(parsed.path, name)),
        isDirectory: type === 'd',
      };
    })
    .filter(Boolean)
    .sort(dirFirstCompare);
}

async function readfile(sshPath) {
  const parsed = parseSshPath(sshPath);
  if (!parsed) return { error: 'Invalid SSH path' };
  const script = `
if [ ! -f "$PICKAGENT_PATH" ]; then exit 2; fi
size=$(wc -c < "$PICKAGENT_PATH" | tr -d '[:space:]')
case "$size" in ''|*[!0-9]*) size=0 ;; esac
if [ "$size" -gt ${MAX_FILE_SIZE} ]; then
  printf 'FILE_TOO_LARGE:%s\n' "$size" >&2
  exit 3
fi
cat -- "$PICKAGENT_PATH"
`;
  try {
    const { stdout } = await runSshCommand(
      parsed.destination,
      createRemoteCommand(parsed.path, script),
      { maxBuffer: MAX_FILE_SIZE + 1024 },
    );
    return { content: stdout.toString('utf8'), size: stdout.length };
  } catch (err) {
    if (err?.code === 3) return { error: 'File too large (>2MB)' };
    throw err;
  }
}

async function writefile(sshPath, content) {
  const parsed = parseSshPath(sshPath);
  if (!parsed) return { error: 'Invalid SSH path' };
  await runSshCommand(
    parsed.destination,
    `cat > ${shellQuote(parsed.path)}`,
    { input: String(content ?? '') },
  );
  return { success: true };
}

async function mkdir(sshPath) {
  const parsed = parseSshPath(sshPath);
  if (!parsed) return { error: 'Invalid SSH path' };
  await runSshCommand(parsed.destination, `mkdir -p -- ${shellQuote(parsed.path)}`);
  return { success: true };
}

async function rename(oldSshPath, newName) {
  const parsed = parseSshPath(oldSshPath);
  if (!parsed) return { error: 'Invalid SSH path' };
  if (!newName || String(newName).includes('/')) return { error: 'Invalid remote name' };
  const parent = parsed.path.split('/').filter(Boolean).slice(0, -1);
  const newRemotePath = joinRemotePath(parent.length ? `/${parent.join('/')}` : '/', newName);
  await runSshCommand(
    parsed.destination,
    `mv -- ${shellQuote(parsed.path)} ${shellQuote(newRemotePath)}`,
  );
  return { success: true, newPath: buildSshPath(parsed.destination, newRemotePath) };
}

function unsupported(operation) {
  return { error: `${operation} is not supported for SSH paths yet` };
}

module.exports = {
  resolveRemotePwd,
  readdir,
  readfile,
  writefile,
  mkdir,
  rename,
  copy: () => unsupported('Duplicate'),
  copyTo: () => unsupported('Drop copy'),
  trash: () => unsupported('Delete'),
  _internals: {
    shellQuote,
    createRemoteCommand,
    runSshCommand,
  },
};
