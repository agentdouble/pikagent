/**
 * Declarative facade registry.
 *
 * Every domain facade that was previously defined in its own file is now
 * declared here as a plain data entry and generated in a single pass via
 * `composeFacade`.  The individual per-domain files (board-facade.js, etc.)
 * still exist but simply re-export from this module, so no consumer import
 * paths need to change.
 *
 * @see compose-facade.js  — the runtime helper that turns entries into facades
 * @see https://github.com/agentdouble/pikagent/issues/613
 */

import { composeFacade } from './compose-facade.js';

// ── services ────────────────────────────────────────────────────────────────
import clipboardApi from '../services/clipboard-api.js';
import configApi   from '../services/config-api.js';
import dialogApi   from '../services/dialog-api.js';
import flowApi     from '../services/flow-api.js';
import fsApi       from '../services/fs-api.js';
import gitApi      from '../services/git-api.js';
import loopApi     from '../services/loop-api.js';
import ptyApi      from '../services/terminal-api.js';
import shellApi    from '../services/shell-api.js';
import skillsApi   from '../services/skills-api.js';
import updateApi   from '../services/update-api.js';
import usageApi    from '../services/usage-api.js';

// ── registry ────────────────────────────────────────────────────────────────
// Each entry is  [exportedName, [...composeFacade entries]]
// so every facade is a pure data declaration.

/** @type {Array<[string, Array<[object, string[] | Record<string, string>]>]>} */
const definitions = [
  ['boardFacade', [
    [shellApi, ['openExternal', 'openPath']],
    [fsApi, ['homedir']],
    [ptyApi, { ptyWrite: 'write', ptyOnData: 'onData', ptyCheckAgents: 'checkAgents', ptyKill: 'kill' }],
  ]],

  ['tabViewFacade', [
    [gitApi, { gitBranch: 'branch', gitLocalChanges: 'localChanges', gitFileDiff: 'fileDiff' }],
    [fsApi, ['homedir', 'readfile', 'writefile']],
    [configApi, ['getDefault', 'loadDefault']],
    [ptyApi, { ptyOnData: 'onData', ptyCheckAgents: 'checkAgents' }],
  ]],

  ['fileTreeViewFacade', [
    [fsApi, ['copy', 'copyTo', 'rename', 'mkdir', 'writefile', 'readdir', 'watch', 'unwatch', 'onChanged', 'trash']],
    [shellApi, ['showInFolder']],
    [clipboardApi, { clipboardWrite: 'write' }],
  ]],

  ['flowFacade', [
    [flowApi, ['onRunStarted', 'onRunComplete', 'getRunning', 'list', 'getCategories', 'saveCategories', 'runNow', 'toggle', 'save', 'deleteFlow']],
  ]],

  ['loopFacade', [
    [loopApi, ['list', 'get', 'save', 'create', 'delete', 'runNode', 'runPipeline', 'stopNode', 'stopPipeline', 'snapshot', 'getNodeLog']],
    [shellApi, ['openPath']],
  ]],

  ['skillsViewFacade', [
    [skillsApi, ['list', 'getRoot', 'read', 'write', 'importSkill', 'create', 'deleteSkill', 'setRoot']],
    [shellApi, ['openPath']],
    [dialogApi, ['openFolder']],
  ]],

  ['configFacade', [
    [configApi, ['save', 'load', 'list', 'setDefault', 'getDefault', 'loadDefault', 'deleteConfig']],
  ]],

  ['dialogFacade', [
    [dialogApi, ['openFolder']],
  ]],

  ['usageFacade', [
    [usageApi, ['getMetrics']],
  ]],

  ['updateFacade', [
    [updateApi, ['info', 'version', 'check', 'run', 'relaunch', 'onProgress']],
  ]],

  ['terminalPanelFacade', [
    [ptyApi, {
      ptyWrite: 'write',
      ptyOnData: 'onData',
      ptyOnExit: 'onExit',
      ptyCreate: 'create',
      ptyGetCwd: 'getCwd',
      ptyResize: 'resize',
      ptyKill: 'kill',
    }],
    [shellApi, ['openExternal', 'openPath']],
    [fsApi, ['homedir']],
  ]],
];

// ── build & export ──────────────────────────────────────────────────────────
/** @type {Record<string, Record<string, (...a: unknown[]) => unknown>>} */
const registry = {};
for (const [name, entries] of definitions) {
  registry[name] = composeFacade(entries);
}

export const {
  boardFacade,
  tabViewFacade,
  fileTreeViewFacade,
  flowFacade,
  loopFacade,
  skillsViewFacade,
  configFacade,
  dialogFacade,
  usageFacade,
  updateFacade,
  terminalPanelFacade,
} = registry;
