/**
 * Service layer for window.api.fs — file-system operations.
 * Components should import from here instead of calling window.api.fs directly.
 */

export const readdir    = (...args) => window.api.fs.readdir(...args);
export const readfile   = (...args) => window.api.fs.readfile(...args);
export const writefile  = (...args) => window.api.fs.writefile(...args);
export const copy       = (...args) => window.api.fs.copy(...args);
export const copyTo     = (...args) => window.api.fs.copyTo(...args);
export const rename     = (...args) => window.api.fs.rename(...args);
export const mkdir      = (...args) => window.api.fs.mkdir(...args);
export const trash      = (...args) => window.api.fs.trash(...args);
export const watch      = (...args) => window.api.fs.watch(...args);
export const unwatch    = (...args) => window.api.fs.unwatch(...args);
export const onChanged  = (...args) => window.api.fs.onChanged(...args);
export const homedir    = (...args) => window.api.fs.homedir(...args);
