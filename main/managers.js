/**
 * Consolidated manager barrel — single entry-point for all manager singletons.
 *
 * Replaces the individual barrel files (data-managers.js, infra-managers.js,
 * io-managers.js, workflow-managers.js).
 *
 * Domain groups (also exported as named collections for domain-aware consumers):
 *   IO        — ptyManager, fsManager
 *   Data      — sessionManager, usageManager
 *   Workflow  — flowManager, skillsManager
 *   Infra     — gitManager, configManager, updateManager
 */

// ── IO managers ─────────────────────────────────────────────────────
const PtyManager = require('./pty-manager');
const fsManager = require('./fs-manager');

const ptyManager = new PtyManager();

const io = { ptyManager, fsManager };

// ── Data managers ───────────────────────────────────────────────────
const sessionManager = require('./session-manager');
const usageManager = require('./usage-manager');

const data = { sessionManager, usageManager };

// ── Workflow managers ───────────────────────────────────────────────
const flowManager = require('./flow-manager');
const skillsManager = require('./skills-manager');

const workflow = { flowManager, skillsManager };

// ── Infra managers ──────────────────────────────────────────────────
const gitManager = require('./git-manager');
const configManager = require('./config-manager');
const updateManager = require('./update-manager');

const infra = { gitManager, configManager, updateManager };

// Domain groups — for consumers that want to import by domain
module.exports.io = io;
module.exports.data = data;
module.exports.workflow = workflow;
module.exports.infra = infra;

// Flat exports — backward-compatible individual access
module.exports.ptyManager = ptyManager;
module.exports.fsManager = fsManager;
module.exports.sessionManager = sessionManager;
module.exports.usageManager = usageManager;
module.exports.flowManager = flowManager;
module.exports.skillsManager = skillsManager;
module.exports.gitManager = gitManager;
module.exports.configManager = configManager;
module.exports.updateManager = updateManager;
