/**
 * Tab Domain Facade — aggregates git, fs, and config service APIs
 * needed by tab-manager.js so the component imports a single module
 * instead of multiple services.
 *
 * Re-export boilerplate removed per issue #462.  Consumers now import
 * tab utilities directly from their source modules.
 */
import gitApi from '../services/git-api.js';
import fsApi from '../services/fs-api.js';
import configApi from '../services/config-api.js';

export const tabViewFacade = {
  // git
  gitBranch:    (...a) => gitApi.branch(...a),
  // fs
  homedir:      (...a) => fsApi.homedir(...a),
  // config
  getDefault:   (...a) => configApi.getDefault(...a),
  loadDefault:  (...a) => configApi.loadDefault(...a),
};
