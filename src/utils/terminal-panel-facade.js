/**
 * Domain facade for terminal-api, shell-api and fs-api services
 * used by the TerminalPanel component.
 *
 * Exposes a single flat object so the component imports exactly one
 * module instead of three separate service modules.
 */
import ptyApi from '../services/terminal-api.js';
import shellApi from '../services/shell-api.js';
import fsApi from '../services/fs-api.js';

export const terminalPanelApi = {
  // shell
  openExternal: (...a) => shellApi.openExternal(...a),
  openPath:     (...a) => shellApi.openPath(...a),
  // fs
  homedir:      (...a) => fsApi.homedir(...a),
  // pty (terminal-api)
  ptyWrite:     (...a) => ptyApi.write(...a),
  ptyOnData:    (...a) => ptyApi.onData(...a),
  ptyOnExit:    (...a) => ptyApi.onExit(...a),
  ptyCreate:    (...a) => ptyApi.create(...a),
  ptyGetCwd:    (...a) => ptyApi.getCwd(...a),
  ptyResize:    (...a) => ptyApi.resize(...a),
  ptyKill:      (...a) => ptyApi.kill(...a),
};
