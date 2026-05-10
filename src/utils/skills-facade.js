/**
 * Domain facade for skills-api, shell-api and dialog-api services
 * used by the SkillsView component.
 *
 * Exposes a single flat object so the component imports exactly one
 * module instead of three separate service modules.
 */
import skillsApiSvc from '../services/skills-api.js';
import shellApi from '../services/shell-api.js';
import dialogApi from '../services/dialog-api.js';

export const skillsViewApi = {
  // skills
  list:         (...a) => skillsApiSvc.list(...a),
  getRoot:      (...a) => skillsApiSvc.getRoot(...a),
  read:         (...a) => skillsApiSvc.read(...a),
  write:        (...a) => skillsApiSvc.write(...a),
  importSkill:  (...a) => skillsApiSvc.importSkill(...a),
  create:       (...a) => skillsApiSvc.create(...a),
  deleteSkill:  (...a) => skillsApiSvc.deleteSkill(...a),
  setRoot:      (...a) => skillsApiSvc.setRoot(...a),
  // shell
  openPath:     (...a) => shellApi.openPath(...a),
  // dialog
  openFolder:   (...a) => dialogApi.openFolder(...a),
};
