/**
 * Service layer for window.api.pty — pseudo-terminal operations.
 * Components should import from here instead of calling window.api.pty directly.
 */

export const create      = (...args) => window.api.pty.create(...args);
export const write       = (...args) => window.api.pty.write(...args);
export const resize      = (...args) => window.api.pty.resize(...args);
export const kill        = (...args) => window.api.pty.kill(...args);
export const getCwd      = (...args) => window.api.pty.getCwd(...args);
export const onData      = (...args) => window.api.pty.onData(...args);
export const onExit      = (...args) => window.api.pty.onExit(...args);
export const checkAgents = (...args) => window.api.pty.checkAgents(...args);
