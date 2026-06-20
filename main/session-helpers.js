const { buildRecord } = require('./record-helpers');
const { nowISO } = require('../shared/date-utils');

const MAX_SESSIONS = 200;
const MS_PER_SEC = 1000;
const FLOW_PREFIX = 'flow-';

function durationSec(startedAt) {
  return Math.round((Date.now() - new Date(startedAt).getTime()) / MS_PER_SEC);
}

function isFlowTerminal(termId) {
  return termId.startsWith(FLOW_PREFIX);
}

function buildEndedRecord(session, status) {
  return buildRecord(session, {
    endedAt: nowISO(),
    durationSec: durationSec(session.startedAt),
    status,
  });
}

function buildActiveRecord(session) {
  return buildRecord(session, {
    durationSec: durationSec(session.startedAt),
    status: 'running',
  });
}

function trimSessions(sessions, max = MAX_SESSIONS) {
  return sessions.length > max ? sessions.slice(-max) : sessions;
}

module.exports = { isFlowTerminal, buildEndedRecord, buildActiveRecord, trimSessions };
