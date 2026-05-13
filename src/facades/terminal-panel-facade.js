/**
 * Domain facade for the TerminalPanel component.
 *
 * Aggregates the shell, fs and pty API methods needed by terminal-panel.js
 * so the component imports a single module instead of multiple services.
 */
import ptyApi from '../services/terminal-api.js';
import shellApi from '../services/shell-api.js';
import fsApi from '../services/fs-api.js';

export const terminalPanelFacade = {
  // shell
  openExternal: (...a) => shellApi.openExternal(...a),
  openPath:     (...a) => shellApi.openPath(...a),
  // fs
  homedir:      (...a) => fsApi.homedir(...a),
  // pty
  ptyWrite:     (...a) => ptyApi.write(...a),
  ptyOnData:    (...a) => ptyApi.onData(...a),
  ptyOnExit:    (...a) => ptyApi.onExit(...a),
  ptyCreate:    (...a) => ptyApi.create(...a),
  ptyGetCwd:    (...a) => ptyApi.getCwd(...a),
  ptyResize:    (...a) => ptyApi.resize(...a),
  ptyKill:      (...a) => ptyApi.kill(...a),
};
