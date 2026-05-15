/**
 * Domain facade for the SkillsView component.
 *
 * Aggregates the skills, shell and dialog API methods needed by skills-view.js
 * so the component imports a single module instead of multiple services.
 */
import skillsApi from '../services/skills-api.js';
import shellApi from '../services/shell-api.js';
import dialogApi from '../services/dialog-api.js';
import { composeFacade } from './compose-facade.js';

export const skillsViewFacade = composeFacade([
  [skillsApi, ['list', 'getRoot', 'read', 'write', 'importSkill', 'create', 'deleteSkill', 'setRoot']],
  [shellApi, ['openPath']],
  [dialogApi, ['openFolder']],
]);
