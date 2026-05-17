/**
 * Domain facade for the settings-update component.
 *
 * Wraps update API methods used by settings-update.js so the component
 * imports a single facade module instead of the service directly.
 */
import updateApi from '../services/update-api.js';
import { composeFacade } from './compose-facade.js';

export const updateFacade = composeFacade([
  [updateApi, ['version', 'check', 'run', 'relaunch', 'onProgress']],
]);
