const path = require('path');

const APP_NAME = 'Pickagent';
const DEV_PROFILE_ROOT = 'Pickagent Dev';
const USER_DATA_ENV = 'PICKAGENT_USER_DATA_DIR';

function sanitizePathSegment(value) {
  return String(value || 'workspace')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'workspace';
}

function getDevUserDataDir(appDataPath, cwd) {
  const checkoutName = sanitizePathSegment(path.basename(cwd || 'workspace'));
  return path.join(appDataPath, DEV_PROFILE_ROOT, checkoutName);
}

function configureAppIdentity(app, cwd = process.cwd(), env = process.env) {
  app.setName(APP_NAME);

  if (env[USER_DATA_ENV]) {
    const userDataDir = path.resolve(env[USER_DATA_ENV]);
    app.setPath('userData', userDataDir);
    return userDataDir;
  }

  if (app.isPackaged) return null;

  const userDataDir = getDevUserDataDir(app.getPath('appData'), cwd);
  app.setPath('userData', userDataDir);
  return userDataDir;
}

module.exports = {
  APP_NAME,
  DEV_PROFILE_ROOT,
  USER_DATA_ENV,
  configureAppIdentity,
  getDevUserDataDir,
  sanitizePathSegment,
};
