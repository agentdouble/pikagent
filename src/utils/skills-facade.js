/**
 * Domain facade for the SkillsView component.
 *
 * Aggregates the skills, shell and dialog API methods needed by skills-view.js
 * so the component imports a single module instead of multiple services.
 */
import skillsApi from '../services/skills-api.js';
import shellApi from '../services/shell-api.js';
import dialogApi from '../services/dialog-api.js';

export const skillsFacade = {
  // skills
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
