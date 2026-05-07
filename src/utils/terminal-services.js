/**
 * Domain facade for terminal-api, shell-api and fs-api services
 * used by TerminalPanel and BoardView components.
 *
 * Exposes a single flat interface so components never import more than
 * one service module.  The previous named re-exports are kept for
 * backward-compatibility but components should prefer `terminalFacade`.
 */
import ptyApi from '../services/terminal-api.js';
import shellApi from '../services/shell-api.js';
import fsApi from '../services/fs-api.js';

// ── backward-compat re-exports ──────────────────────────────────────
export { ptyApi, shellApi, fsApi };

// ── unified facade ──────────────────────────────────────────────────
export const terminalFacade = {
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
  ptyCheckAgents: (...a) => ptyApi.checkAgents(...a),
};
