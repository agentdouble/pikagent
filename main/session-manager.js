const os = require('os');
const { BASE_DIR, SESSIONS_FILE } = require('./paths');
const { readJson, writeJson, ensureDirOnce } = require('./fs-utils');
const { generateSessionId, durationSec, isFlowTerminal, buildEndedRecord, buildActiveRecord, trimSessions } = require('./session-helpers');

const POLL_INTERVAL_MS = 5000;

const ensureDir = ensureDirOnce(BASE_DIR);

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
    if (isFlowTerminal(termId)) return;

    let cwd = null;
    try {
      cwd = await this._ptyManager.getCwd(termId);
    } catch (err) {
      console.warn('session-manager: getCwd failed:', err.message);
    }

    this._activeSessions[termId] = {
      id: generateSessionId(),
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
    this._saveRecord(buildEndedRecord(session, status));
  }

  onTerminalExit(termId) {
    if (this._activeSessions[termId]) {
      this._endSession(termId, 'exited');
    }
    delete this._previousAgents[termId];
  }

  async _saveRecord(record) {
    await ensureDir();

    this._sessionsCache = trimSessions([...(this._sessionsCache || []), record]);

    writeJson(SESSIONS_FILE, this._sessionsCache)
      .catch((err) => console.warn('session-manager: write failed:', err.message));
  }

  async _loadAll() {
    this._sessionsCache = (await readJson(SESSIONS_FILE)) || [];
  }

  getSessions() {
    return this._sessionsCache || [];
  }

  getActiveSessions() {
    return Object.values(this._activeSessions).map(buildActiveRecord);
  }

  registerHandlers(_ipcMain, { ptyManager }) {
    this.start(ptyManager);
  }
}

module.exports = new SessionManager();
