/**
 * Service layer for file-system operations.
 * Components should import from here instead of calling window.api.fs directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('fs');

export const readdir   = api.readdir;
export const readfile  = api.readfile;
export const writefile = api.writefile;
export const copy      = api.copy;
export const copyTo    = api.copyTo;
export const rename    = api.rename;
export const mkdir     = api.mkdir;
export const trash     = api.trash;
export const watch     = api.watch;
export const unwatch   = api.unwatch;
export const onChanged = api.onChanged;
export const homedir   = api.homedir;
