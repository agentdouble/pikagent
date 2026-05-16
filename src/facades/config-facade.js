/**
 * Domain facade for config-related components.
 *
 * Aggregates config API methods used by config-settings-panel.js and
 * settings-configs.js so both components import a single facade module.
 */
import configApi from '../services/config-api.js';
import { composeFacade } from './compose-facade.js';

export const configFacade = composeFacade([
  [configApi, ['save', 'load', 'list', 'setDefault', 'getDefault', 'loadDefault', 'deleteConfig']],
]);
