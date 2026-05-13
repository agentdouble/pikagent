/**
 * Domain facade for the BoardView component.
 *
 * Aggregates the terminal, shell and fs API methods needed by board-view.js
 * so the component imports a single module instead of multiple services.
 */
import ptyApi from '../services/terminal-api.js';
import shellApi from '../services/shell-api.js';
import fsApi from '../services/fs-api.js';

export const boardFacade = {
  // shell
  openExternal: (...a) => shellApi.openExternal(...a),
  openPath:     (...a) => shellApi.openPath(...a),
  // fs
  homedir:      (...a) => fsApi.homedir(...a),
  // pty
  ptyWrite:       (...a) => ptyApi.write(...a),
  ptyOnData:      (...a) => ptyApi.onData(...a),
  ptyCheckAgents: (...a) => ptyApi.checkAgents(...a),
};
