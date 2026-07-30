#!/usr/bin/env node

const { spawn } = require('child_process');

const script = process.platform === 'win32' ? 'package:win' : 'package:mac';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npmCommand, ['run', script], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`[package-current] failed to run ${script}:`, error);
  process.exit(1);
});
