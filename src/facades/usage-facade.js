/**
 * Domain facade for the UsageView component.
 *
 * Wraps usage API methods used by usage-view.js so the component
 * imports a single facade module instead of the service directly.
 */
import usageApi from '../services/usage-api.js';
import { composeFacade } from './compose-facade.js';

export const usageFacade = composeFacade([
  [usageApi, ['getMetrics']],
]);
