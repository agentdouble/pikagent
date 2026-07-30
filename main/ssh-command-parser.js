const SSH_OPTIONS_WITH_VALUES = new Set([
  '-B', '-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J', '-L',
  '-l', '-m', '-O', '-o', '-p', '-Q', '-R', '-S', '-W', '-w',
]);

function splitCommandLine(command) {
  const args = [];
  let current = '';
  let quote = null;
  let escaping = false;

  for (const char of String(command || '')) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escaping = true;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote === char ? null : char;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (escaping) current += '\\';
  if (current) args.push(current);
  return args;
}

function commandBaseName(commandPath) {
  return String(commandPath || '').split(/[\\/]/).pop().toLowerCase();
}

function isSshBinary(commandPath) {
  const base = commandBaseName(commandPath);
  return base === 'ssh' || base === 'ssh.exe';
}

function optionConsumesNext(arg) {
  if (SSH_OPTIONS_WITH_VALUES.has(arg)) return true;
  if (/^-[bcDEeFIiJlLmOoQRSTUVWw]$/.test(arg)) return true;
  return false;
}

function isAttachedValueOption(arg) {
  return /^-[bcDEeFIiJlLmOoQRSTUVWw].+/.test(arg) || arg.startsWith('-o');
}

function parseSshCommand(command) {
  const argv = splitCommandLine(command);
  if (!argv.length || !isSshBinary(argv[0])) return null;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      return argv[index + 1] ? { destination: argv[index + 1], argv } : null;
    }
    if (!arg.startsWith('-')) {
      return { destination: arg, argv };
    }
    if (optionConsumesNext(arg)) {
      index += 1;
      continue;
    }
    if (isAttachedValueOption(arg)) continue;
  }
  return null;
}

module.exports = {
  splitCommandLine,
  parseSshCommand,
  _internals: { commandBaseName, isSshBinary, optionConsumesNext },
};
