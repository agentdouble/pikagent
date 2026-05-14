const fsp = require('fs/promises');
const path = require('path');
const { FLOWS_DIR, CLAUDE_PROJECTS_DIR } = require('./paths');
const { readDirJson, listDirNames } = require('./fs-utils');
const { DEFAULT_DAYS } = require('./stats-helpers');
const { generateDateRange } = require('../shared/date-utils');
const {
  newTokenTotals,
  addTokens,
  parseTokenUsage,
  aggregateTokenData,
  accumulatePerDay,
  getFlowRuns,
  buildFlowMetrics,
  buildAgentMetrics,
  collectUniqueCwds,
} = require('./usage-helpers');
const { createLogger, trySafe } = require('./logger');

const log = createLogger('token-collector');

async function getAllFlows() {
  return readDirJson(FLOWS_DIR);
}

async function readProjectTokens(projDir, cutoffMs) {
  const totals = newTokenTotals();
  const perDayMap = {};

  const files = (await fsp.readdir(projDir)).filter((f) => f.endsWith('.jsonl'));
  for (const file of files) {
    let content;
    try { content = await fsp.readFile(path.join(projDir, file), 'utf-8'); } catch { continue; }

    for (const line of content.split('\n')) {
      const usage = parseTokenUsage(line, cutoffMs);
      if (!usage) continue;

      addTokens(totals, usage);
      accumulatePerDay(perDayMap, usage);
    }
  }

  return { totals, perDayMap };
}

async function collectProjectTokens(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  return trySafe(
    async () => {
      const projects = await listDirNames(CLAUDE_PROJECTS_DIR);
      return Promise.all(
        projects.map(async (proj) => {
          const data = await readProjectTokens(path.join(CLAUDE_PROJECTS_DIR, proj), cutoffMs);
          return { proj, ...data };
        })
      );
    },
    [],
    { log, label: 'collectProjectTokens' },
  );
}

async function getTokenMetrics(days = DEFAULT_DAYS) {
  const labels = generateDateRange(days);
  const projectResults = await collectProjectTokens(days);
  return aggregateTokenData(labels, projectResults);
}

module.exports = {
  getAllFlows,
  getTokenMetrics,
  getFlowRuns,
  buildFlowMetrics,
  buildAgentMetrics,
  collectUniqueCwds,
};
