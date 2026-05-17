/**
 * Tab Facade — domain service facade for tab-manager.js.
 *
 * Wraps git, fs, and config service APIs behind a single object so
 * tab-manager.js does not couple directly to three service modules.
 *
 * Re-exports that previously lived here have been inlined into consumers
 * (see issue #462).
 */

import gitApi from '../services/git-api.js';
import fsApi from '../services/fs-api.js';
import configApi from '../services/config-api.js';
import { composeFacade } from './compose-facade.js';

export const tabViewFacade = composeFacade([
  [gitApi, { gitBranch: 'branch', gitLocalChanges: 'localChanges', gitFileDiff: 'fileDiff' }],
  [fsApi, ['homedir', 'readfile', 'writefile']],
  [configApi, ['getDefault', 'loadDefault']],
]);
