/**
 * Facade re-exporting terminal-api, shell-api and fs-api services
 * used by TerminalPanel and BoardView components.
 * Reduces direct coupling between UI components and multiple service modules.
 */
export { default as ptyApi } from '../services/terminal-api.js';
export { default as shellApi } from '../services/shell-api.js';
export { default as fsApi } from '../services/fs-api.js';
