const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const SESSIONS_FILE = path.join(BASE_DIR, 'sessions.json');

class SessionManager {
  constructor() {
    this._timer = null;
    this._ptyManager = null;
    this._previousAgents = {}; // { termId: agentName }
    this._activeSessions = {}; // { termId: { id, agent, startedAt, cwd } }
    this._polling = false; // guard against overlapping polls
  }

  start(ptyManager) {
    this._ptyManager = ptyManager;
    // Poll every 5 seconds to detect agent starts/stops
    this._timer = setInterval(() => this._poll(), 5000);
    this._poll();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    // Close all active sessions
    for (const termId of Object.keys(this._activeSessions)) {
      this._endSession(termId, 'interrupted');
    }
  }

  async _poll() {
    if (!this._ptyManager) return;
    if (this._polling) return; // skip if previous poll still running
    this._polling = true;

    let currentAgents;
    try {
      currentAgents = await this._ptyManager.checkAgents();
    } catch {
      this._polling = false;
      return;
    }

    // Detect new agent sessions
    for (const [termId, agentName] of Object.entries(currentAgents)) {
      if (!this._previousAgents[termId]) {
        // Agent just appeared in this terminal
        await this._startSession(termId, agentName);
      }
    }

    // Detect ended agent sessions
    for (const termId of Object.keys(this._previousAgents)) {
      if (!currentAgents[termId]) {
        // Agent disappeared from this terminal
        this._endSession(termId, 'completed');
      }
    }

    this._previousAgents = { ...currentAgents };
    this._polling = false;
  }

  async _startSession(termId, agentName) {
    // Skip flow terminals
    if (termId.startsWith('flow-')) return;

    let cwd = null;
    try {
      cwd = await this._ptyManager.getCwd(termId);
    } catch {}

    const session = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      termId,
      agent: agentName,
      cwd: cwd || os.homedir(),
      startedAt: new Date().toISOString(),
    };

    this._activeSessions[termId] = session;
  }

  _endSession(termId, status) {
    const session = this._activeSessions[termId];
    if (!session) return;

    delete this._activeSessions[termId];

    const record = {
      ...session,
      endedAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000),
      status,
    };

    this._saveRecord(record);
  }

  // Called when a terminal exits — ensures session is closed
  onTerminalExit(termId) {
    if (this._activeSessions[termId]) {
      this._endSession(termId, 'exited');
    }
    delete this._previousAgents[termId];
  }

  _saveRecord(record) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
    let sessions = this._loadAll();
    sessions.push(record);
    // Keep last 200 sessions
    if (sessions.length > 200) {
      sessions = sessions.slice(-200);
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
  }

  _loadAll() {
    try {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    } catch {
      return [];
    }
  }

  getSessions() {
    return this._loadAll();
  }

  getActiveSessions() {
    return Object.values(this._activeSessions).map((s) => ({
      ...s,
      durationSec: Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000),
      status: 'running',
    }));
  }
}

module.exports = new SessionManager();
