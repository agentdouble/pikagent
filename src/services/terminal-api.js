/**
 * Service layer for pseudo-terminal operations.
 * Components should import from here instead of calling window.api.pty directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('pty');

export const create      = api.create;
export const write       = api.write;
export const resize      = api.resize;
export const kill        = api.kill;
export const getCwd      = api.getCwd;
export const onData      = api.onData;
export const onExit      = api.onExit;
export const checkAgents = api.checkAgents;
