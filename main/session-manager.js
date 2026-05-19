const os = require('os');
const { BASE_DIR, SESSIONS_FILE } = require('./paths');
const { ensureDirOnce } = require('./fs-utils');
const { generateSessionId, isFlowTerminal, buildEndedRecord, buildActiveRecord, trimSessions } = require('./session-helpers');
const { nowISO } = require('../shared/date-utils');
const { createPollingManager } = require('../shared/polling-manager');
const { CachedJsonFile } = require('./cached-json-file');
const { createLogger, createManagerSafe } = require('./logger');

const log = createLogger('session-manager');
const _safe = createManagerSafe(log, 'session-manager');
const POLL_INTERVAL_MS = 5000;

const ensureDir = ensureDirOnce(BASE_DIR);

class SessionManager {
  constructor() {
    this._pollingMgr = createPollingManager(() => this._poll(), {
      intervalMs: POLL_INTERVAL_MS,
      onStop: () => {
        for (const termId of Object.keys(this._activeSessions)) {
          this._endSession(termId, 'interrupted');
        }
      },
    });
    this._ptyManager = null;
    this._previousAgents = {};
    this._activeSessions = {};
    this._polling = false;
    this._sessionsFile = new CachedJsonFile(SESSIONS_FILE, ensureDir, []);
  }

  async start(ptyManager) {
    this._ptyManager = ptyManager;
    await this._loadAll();
    this._pollingMgr.start();
  }

  stop() {
    this._pollingMgr.stop();
  }

  async _poll() {
    if (!this._ptyManager || this._polling) return;
    this._polling = true;
    try {
      await _safe(async () => {
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
      }, undefined);
    } finally {
      this._polling = false;
    }
  }

  async _startSession(termId, agentName) {
    if (isFlowTerminal(termId)) return;

    const cwd = await _safe(
      () => this._ptyManager.getCwd(termId),
      null,
    );

    this._activeSessions[termId] = {
      id: generateSessionId(),
      termId,
      agent: agentName,
      cwd: cwd || os.homedir(),
      startedAt: nowISO(),
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
    const current = this._sessionsFile.get() || [];
    const sessions = trimSessions([...current, record]);

    _safe(
      () => this._sessionsFile.write(sessions),
      undefined,
    );
  }

  async _loadAll() {
    await this._sessionsFile.read();
  }

  getSessions() {
    return this._sessionsFile.get() || [];
  }

  getActiveSessions() {
    return Object.values(this._activeSessions).map(buildActiveRecord);
  }

  cleanup() {
    this.stop();
  }
}

module.exports = new SessionManager();
