/**
 * Facade re-exporting git-api, fs-api and config-api services
 * used by the TabManager component.
 * Reduces direct coupling between UI components and multiple service modules.
 */
export { default as gitApi } from '../services/git-api.js';
export { default as fsApi } from '../services/fs-api.js';
export { default as configApi } from '../services/config-api.js';
