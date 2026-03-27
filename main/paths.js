const path = require('path');
const os = require('os');

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const CONFIG_DIR = path.join(BASE_DIR, 'configs');
const FLOWS_DIR = path.join(BASE_DIR, 'flows');
const LOGS_DIR = path.join(FLOWS_DIR, 'logs');
const SESSIONS_FILE = path.join(BASE_DIR, 'sessions.json');
const META_FILE = path.join(BASE_DIR, 'meta.json');
const FLOW_CATEGORIES_FILE = path.join(FLOWS_DIR, 'categories.json');
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

module.exports = { BASE_DIR, CONFIG_DIR, FLOWS_DIR, LOGS_DIR, FLOW_CATEGORIES_FILE, SESSIONS_FILE, META_FILE, CLAUDE_PROJECTS_DIR };
