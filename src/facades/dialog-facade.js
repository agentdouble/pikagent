/**
 * Domain facade for dialog-related components.
 *
 * Wraps dialog API methods used by flow-modal.js so the component
 * imports a single facade module instead of the service directly.
 */
import dialogApi from '../services/dialog-api.js';
import { composeFacade } from './compose-facade.js';

export const dialogFacade = composeFacade([
  [dialogApi, ['openFolder']],
]);
