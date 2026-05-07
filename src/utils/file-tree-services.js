/**
 * Facade re-exporting fs-api, shell-api and clipboard-api services
 * used by the FileTree component.
 * Reduces direct coupling between UI components and multiple service modules.
 */
export { default as fsApi } from '../services/fs-api.js';
export { default as shellApi } from '../services/shell-api.js';
export { default as clipboardApi } from '../services/clipboard-api.js';
