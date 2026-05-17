/**
 * Domain facade for the FlowView component.
 *
 * Aggregates flow API methods used by flow-view.js so the component
 * imports a single facade module instead of the service directly.
 */
import flowApi from '../services/flow-api.js';
import { composeFacade } from './compose-facade.js';

export const flowFacade = composeFacade([
  [flowApi, ['onRunStarted', 'onRunComplete', 'getRunning', 'list', 'getCategories', 'saveCategories', 'runNow', 'toggle', 'save', 'deleteFlow']],
]);
