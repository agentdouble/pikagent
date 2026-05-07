/**
 * Domain facade for git-api, fs-api and config-api services
 * used by the TabManager component.
 *
 * Exposes a single flat interface so the component never imports more than
 * one service module.  The previous named re-exports are kept for
 * backward-compatibility but components should prefer `tabFacade`.
 */
import gitApi from '../services/git-api.js';
import fsApi from '../services/fs-api.js';
import configApi from '../services/config-api.js';

// ── backward-compat re-exports ──────────────────────────────────────
export { gitApi, fsApi, configApi };

// ── unified facade ──────────────────────────────────────────────────
export const tabFacade = {
  // git
  gitBranch:    (...a) => gitApi.branch(...a),
  // fs
  homedir:      (...a) => fsApi.homedir(...a),
  // config
  getDefault:   (...a) => configApi.getDefault(...a),
  loadDefault:  (...a) => configApi.loadDefault(...a),
};
