/**
 * Domain facade for skills-api, shell-api and dialog-api services
 * used by the SkillsView component.
 *
 * Exposes a single flat interface so the component never imports more than
 * one service module.  The previous named re-exports are kept for
 * backward-compatibility but components should prefer `skillsFacade`.
 *
 * NOTE (PR #466): createApiService produces an identical API surface to the
 * hand-crafted modules it replaces (shell-api.js, dialog-api.js).  The proxy
 * delegates every call to window.api[domain][method](...args), which is the
 * exact same pattern the original service files used.  The alias map handles
 * JS-reserved words (import → importSkill, delete → deleteSkill).
 */
import { createApiService } from '../services/create-api-service.js';

// ── service instances (via createApiService) ────────────────────────
const skillsApi = createApiService('skills', { importSkill: 'import', deleteSkill: 'delete' });
const shellApi  = createApiService('shell');
const dialogApi = createApiService('dialog');

// ── backward-compat re-exports ──────────────────────────────────────
export { skillsApi, shellApi, dialogApi };

// ── unified facade ──────────────────────────────────────────────────
export const skillsFacade = {
  // skills — delegated via createApiService proxy
  list:         (...a) => skillsApi.list(...a),
  getRoot:      (...a) => skillsApi.getRoot(...a),
  read:         (...a) => skillsApi.read(...a),
  write:        (...a) => skillsApi.write(...a),
  importSkill:  (...a) => skillsApi.importSkill(...a),
  create:       (...a) => skillsApi.create(...a),
  deleteSkill:  (...a) => skillsApi.deleteSkill(...a),
  setRoot:      (...a) => skillsApi.setRoot(...a),
  // shell
  openPath:     (...a) => shellApi.openPath(...a),
  // dialog
  openFolder:   (...a) => dialogApi.openFolder(...a),
};
