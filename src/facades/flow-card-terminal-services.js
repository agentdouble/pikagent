/**
 * Facade re-exporting terminal-api and flow-api services
 * used by the FlowCardTerminalManager component.
 * Reduces direct coupling between UI components and multiple service modules.
 */
export { default as ptyApi } from '../services/terminal-api.js';
export { default as flowApi } from '../services/flow-api.js';
