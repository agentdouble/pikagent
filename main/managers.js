/**
 * Consolidated manager barrel — single entry-point for all manager singletons.
 *
 * Replaces the individual barrel files (data-managers.js, infra-managers.js,
 * io-managers.js, workflow-managers.js).
 *
 * Groups:
 *   IO        — ptyManager, fsManager
 *   Data      — sessionManager, usageManager
 *   Workflow  — flowManager, skillsManager
 *   Infra     — gitManager, configManager, updateManager
 *
 * @see https://github.com/agentdouble/pikagent/issues/462
 */

// ── IO managers ─────────────────────────────────────────────────────
const PtyManager = require('./pty-manager');
const fsManager = require('./fs-manager');

const ptyManager = new PtyManager();

// ── Data managers ───────────────────────────────────────────────────
const sessionManager = require('./session-manager');
const usageManager = require('./usage-manager');

// ── Workflow managers ───────────────────────────────────────────────
const flowManager = require('./flow-manager');
const skillsManager = require('./skills-manager');

// ── Infra managers ──────────────────────────────────────────────────
const gitManager = require('./git-manager');
const configManager = require('./config-manager');
const updateManager = require('./update-manager');

module.exports = {
  ptyManager,
  fsManager,
  sessionManager,
  usageManager,
  flowManager,
  skillsManager,
  gitManager,
  configManager,
  updateManager,
};
