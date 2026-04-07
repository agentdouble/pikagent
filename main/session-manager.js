const os = require('os');
const { BASE_DIR, SESSIONS_FILE } = require('./paths');
const { readJson, writeJson, ensureDirOnce } = require('./fs-utils');
const { generateSessionId, durationSec, isFlowTerminal, buildEndedRecord, buildActiveRecord, trimSessions } = require('./session-helpers');
const { PollingTimer } = require('./polling-timer');
const { Cache } = require('./cache');
const { createLogger, trySafe } = require('./logger');

const log = createLogger('session-manager');
const POLL_INTERVAL_MS = 5000;

const ensureDir = ensureDirOnce(BASE_DIR);

class SessionManager {
  constructor() {
    this._poller = new PollingTimer(POLL_INTERVAL_MS, () => this._poll());
    this._ptyManager = null;
    this._previousAgents = {};
    this._activeSessions = {};
    this._polling = false;
    this._sessionsCache = new Cache();
  }

  async start(ptyManager) {
    this._ptyManager = ptyManager;
    await this._loadAll();
    this._poller.start();
  }

  stop() {
    this._poller.stop();
    for (const termId of Object.keys(this._activeSessions)) {
      this._endSession(termId, 'interrupted');
    }
  }

  async _poll() {
    if (!this._ptyManager || this._polling) return;
    this._polling = true;
    try {
      await trySafe(async () => {
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
      }, undefined, { log, label: 'poll' });
    } finally {
      this._polling = false;
    }
  }

  async _startSession(termId, agentName) {
    if (isFlowTerminal(termId)) return;

    const cwd = await trySafe(
      () => this._ptyManager.getCwd(termId),
      null,
      { log, label: 'getCwd' },
    );

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

    const sessions = trimSessions([...(this._sessionsCache.get() || []), record]);
    this._sessionsCache.set(sessions);

    trySafe(
      () => writeJson(SESSIONS_FILE, sessions),
      undefined,
      { log, label: 'write' },
    );
  }

  async _loadAll() {
    this._sessionsCache.set((await readJson(SESSIONS_FILE)) || []);
  }

  getSessions() {
    return this._sessionsCache.get() || [];
  }

  getActiveSessions() {
    return Object.values(this._activeSessions).map(buildActiveRecord);
  }

  cleanup() {
    this.stop();
  }
}

module.exports = new SessionManager();
