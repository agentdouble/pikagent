/**
 * Domain facade for the BoardView component.
 *
 * Aggregates the terminal, shell and fs API methods needed by board-view.js
 * so the component imports a single module instead of multiple services.
 */
import ptyApi from '../services/terminal-api.js';
import shellApi from '../services/shell-api.js';
import fsApi from '../services/fs-api.js';
import { composeFacade } from './compose-facade.js';

export const boardFacade = composeFacade([
  [shellApi, ['openExternal', 'openPath']],
  [fsApi, ['homedir']],
  [ptyApi, { ptyWrite: 'write', ptyOnData: 'onData', ptyCheckAgents: 'checkAgents' }],
]);
