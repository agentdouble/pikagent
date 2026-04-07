const MAX_SESSIONS = 200;
const MS_PER_SEC = 1000;
const FLOW_PREFIX = 'flow-';
const ID_RAND_LEN = 8;

function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 2 + ID_RAND_LEN)}`;
}

function durationSec(startedAt) {
  return Math.round((Date.now() - new Date(startedAt).getTime()) / MS_PER_SEC);
}

function isFlowTerminal(termId) {
  return termId.startsWith(FLOW_PREFIX);
}

function buildEndedRecord(session, status) {
  return {
    ...session,
    endedAt: new Date().toISOString(),
    durationSec: durationSec(session.startedAt),
    status,
  };
}

function buildActiveRecord(session) {
  return {
    ...session,
    durationSec: durationSec(session.startedAt),
    status: 'running',
  };
}

function trimSessions(sessions, max = MAX_SESSIONS) {
  return sessions.length > max ? sessions.slice(-max) : sessions;
}

module.exports = { generateSessionId, durationSec, isFlowTerminal, buildEndedRecord, buildActiveRecord, trimSessions, MAX_SESSIONS };
