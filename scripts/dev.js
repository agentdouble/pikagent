#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BIN_EXT = process.platform === 'win32' ? '.cmd' : '';
const ELECTRON_BIN = path.join(ROOT, 'node_modules', '.bin', `electron${BIN_EXT}`);

const children = new Set();
let shuttingDown = false;
let shutdownTimer = null;
let requestedExitCode = 0;

function spawnChild(label, command, args) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) {
      maybeExitAfterShutdown();
      return;
    }

    shuttingDown = true;
    stopChildren();
    const exitCode = code ?? (signal ? 1 : 0);
    process.exit(exitCode);
  });

  child.on('error', (error) => {
    console.error(`[dev] ${label} failed:`, error);
    if (!shuttingDown) {
      shuttingDown = true;
      stopChildren();
      process.exit(1);
    }
  });

  return child;
}

function stopChildren(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

function maybeExitAfterShutdown() {
  if (!shuttingDown || children.size > 0) return;
  if (shutdownTimer) clearTimeout(shutdownTimer);
  process.exit(requestedExitCode);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  requestedExitCode = signal === 'SIGINT' ? 130 : 143;
  stopChildren(signal);
  shutdownTimer = setTimeout(() => {
    stopChildren('SIGKILL');
    process.exit(requestedExitCode);
  }, 1500);
  maybeExitAfterShutdown();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => stopChildren());

spawnChild('build watcher', process.execPath, ['build.js', '--watch']);
spawnChild('electron', ELECTRON_BIN, ['.']);
