/**
 * Infrastructure managers — git operations, configuration, and app updates.
 *
 * Groups managers that deal with developer tooling (git), user preferences
 * (config), and self-update logic so that manager-init.js can import a
 * single module instead of three separate ones.
 */

const gitManager = require('./git-manager');
const configManager = require('./config-manager');
const updateManager = require('./update-manager');

module.exports = { gitManager, configManager, updateManager };
