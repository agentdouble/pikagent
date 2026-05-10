/**
 * Domain facade for git-api, fs-api and config-api services
 * used by the TabManager component.
 *
 * Exposes a single flat object so the component imports exactly one
 * module instead of three separate service modules.
 */
import gitApi from '../services/git-api.js';
import fsApi from '../services/fs-api.js';
import configApi from '../services/config-api.js';

export const tabManagerApi = {
  // git
  gitBranch:  (...a) => gitApi.branch(...a),
  // fs
  homedir:    (...a) => fsApi.homedir(...a),
  // config
  getDefault:  (...a) => configApi.getDefault(...a),
  loadDefault: (...a) => configApi.loadDefault(...a),
};
