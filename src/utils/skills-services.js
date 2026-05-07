/**
 * Facade re-exporting skills-api, shell-api and dialog-api services
 * used by the SkillsView component.
 * Reduces direct coupling between UI components and multiple service modules.
 */
export { default as skillsApi } from '../services/skills-api.js';
export { default as shellApi } from '../services/shell-api.js';
export { default as dialogApi } from '../services/dialog-api.js';
