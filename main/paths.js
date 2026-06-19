const path = require('path');
const os = require('os');

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const CONFIG_DIR = path.join(BASE_DIR, 'configs');
const FLOWS_DIR = path.join(BASE_DIR, 'flows');
const LOGS_DIR = path.join(FLOWS_DIR, 'logs');
const LOOPS_DIR = path.join(BASE_DIR, 'loops');
const LOOP_FILE = path.join(LOOPS_DIR, 'main.json');
const LOOP_LOGS_DIR = path.join(LOOPS_DIR, 'logs');
const HOOK_STATE_FILE = path.join(BASE_DIR, 'hook-state.json');
const SESSIONS_FILE = path.join(BASE_DIR, 'sessions.json');
const META_FILE = path.join(BASE_DIR, 'meta.json');
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

function loopNodeLogPath(nodeId) {
  return path.join(LOOP_LOGS_DIR, `${nodeId}.log`);
}

module.exports = {
  BASE_DIR,
  CONFIG_DIR,
  FLOWS_DIR,
  LOGS_DIR,
  LOOPS_DIR,
  LOOP_FILE,
  LOOP_LOGS_DIR,
  HOOK_STATE_FILE,
  SESSIONS_FILE,
  META_FILE,
  CLAUDE_PROJECTS_DIR,
  loopNodeLogPath,
};
