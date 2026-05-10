/**
 * Domain facade for terminal-api, shell-api and fs-api services
 * used by the BoardView component.
 *
 * Exposes a single flat object so the component imports exactly one
 * module instead of three separate service modules.
 */
import ptyApi from '../services/terminal-api.js';
import shellApi from '../services/shell-api.js';
import fsApi from '../services/fs-api.js';

export const boardApi = {
  // pty (terminal-api)
  ptyCheckAgents: (...a) => ptyApi.checkAgents(...a),
  ptyOnData:      (...a) => ptyApi.onData(...a),
  ptyWrite:       (...a) => ptyApi.write(...a),
  // shell
  openExternal:   (...a) => shellApi.openExternal(...a),
  openPath:       (...a) => shellApi.openPath(...a),
  // fs
  homedir:        (...a) => fsApi.homedir(...a),
};
