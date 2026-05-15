/**
 * Domain facade for the TerminalPanel component.
 *
 * Aggregates the shell, fs and pty API methods needed by terminal-panel.js
 * so the component imports a single module instead of multiple services.
 */
import ptyApi from '../services/terminal-api.js';
import shellApi from '../services/shell-api.js';
import fsApi from '../services/fs-api.js';
import { composeFacade } from './compose-facade.js';

export const terminalPanelFacade = composeFacade([
  [shellApi, ['openExternal', 'openPath']],
  [fsApi, ['homedir']],
  [ptyApi, {
    ptyWrite: 'write',
    ptyOnData: 'onData',
    ptyOnExit: 'onExit',
    ptyCreate: 'create',
    ptyGetCwd: 'getCwd',
    ptyResize: 'resize',
    ptyKill: 'kill',
  }],
]);
