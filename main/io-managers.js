/**
 * IO managers — filesystem and terminal (PTY) access.
 *
 * Groups managers that deal with low-level I/O so that manager-init.js
 * can import a single module instead of two separate ones.
 */

const PtyManager = require('./pty-manager');
const fsManager = require('./fs-manager');

const ptyManager = new PtyManager();

module.exports = { ptyManager, fsManager };
