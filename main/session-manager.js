const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const SESSIONS_FILE = path.join(BASE_DIR, 'sessions.json');
const MAX_SESSIONS = 200;
const POLL_INTERVAL_MS = 5000;
const MS_PER_SEC = 1000;
const FLOW_PREFIX = 'flow-';
const ID_RAND_LEN = 8;

let _dirReady = null;

async function ensureDir() {
  if (!_dirReady) {
    _dirReady = fsp.mkdir(BASE_DIR, { recursive: true });
  }
  return _dirReady;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function _generateId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 2 + ID_RAND_LEN)}`;
}

function _durationSec(startedAt) {
  return Math.round((Date.now() - new Date(startedAt).getTime()) / MS_PER_SEC);
}

class SessionManager {
  constructor() {
    this._timer = null;
    this._ptyManager = null;
    this._previousAgents = {};
    this._activeSessions = {};
    this._polling = false;
    this._sessionsCache = null;
  }

  async start(ptyManager) {
    this._ptyManager = ptyManager;
    await this._loadAll();
    this._timer = setInterval(() => this._poll(), POLL_INTERVAL_MS);
    this._poll();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    for (const termId of Object.keys(this._activeSessions)) {
      this._endSession(termId, 'interrupted');
    }
  }

  async _poll() {
    if (!this._ptyManager || this._polling) return;
    this._polling = true;
    try {
      const currentAgents = await this._ptyManager.checkAgents();

      for (const [termId, agentName] of Object.entries(currentAgents)) {
        if (!this._previousAgents[termId]) {
          await this._startSession(termId, agentName);
        }
      }

      for (const termId of Object.keys(this._previousAgents)) {
        if (!currentAgents[termId]) {
          this._endSession(termId, 'completed');
        }
      }

      this._previousAgents = { ...currentAgents };
    } catch (err) {
      console.warn('session-manager: poll failed:', err.message);
    } finally {
      this._polling = false;
    }
  }

  async _startSession(termId, agentName) {
    if (termId.startsWith(FLOW_PREFIX)) return;

    let cwd = null;
    try {
      cwd = await this._ptyManager.getCwd(termId);
    } catch (err) {
      console.warn('session-manager: getCwd failed:', err.message);
    }

    this._activeSessions[termId] = {
      id: _generateId(),
      termId,
      agent: agentName,
      cwd: cwd || os.homedir(),
      startedAt: new Date().toISOString(),
    };
  }

  _endSession(termId, status) {
    const session = this._activeSessions[termId];
    if (!session) return;

    delete this._activeSessions[termId];

    this._saveRecord({
      ...session,
      endedAt: new Date().toISOString(),
      durationSec: _durationSec(session.startedAt),
      status,
    });
  }

  onTerminalExit(termId) {
    if (this._activeSessions[termId]) {
      this._endSession(termId, 'exited');
    }
    delete this._previousAgents[termId];
  }

  async _saveRecord(record) {
    await ensureDir();

    let sessions = this._sessionsCache || [];
    sessions.push(record);
    if (sessions.length > MAX_SESSIONS) {
      sessions = sessions.slice(-MAX_SESSIONS);
    }
    this._sessionsCache = sessions;

    fsp.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8')
      .catch((err) => console.warn('session-manager: write failed:', err.message));
  }

  async _loadAll() {
    this._sessionsCache = (await readJson(SESSIONS_FILE)) || [];
  }

  getSessions() {
    return this._sessionsCache || [];
  }

  getActiveSessions() {
    return Object.values(this._activeSessions).map((s) => ({
      ...s,
      durationSec: _durationSec(s.startedAt),
      status: 'running',
    }));
  }
}

module.exports = new SessionManager();
