const { DEFAULT_DAYS } = require('./stats-helpers');
const {
  rankModifiedFiles,
  TOP_FILES_LIMIT,
  GIT_TIMEOUT_MS,
} = require('./usage-helpers');
const { createLogger, trySafe } = require('./logger');
const { runCommand } = require('./command-utils');

const log = createLogger('git-metrics-collector');

async function getMostModifiedFiles(cwds) {
  const results = await Promise.all(
    cwds.map(async (cwd) => {
      const stdout = await runCommand(
        'git',
        ['log', `--since=${DEFAULT_DAYS} days ago`, '--name-only', '--pretty=format:', '--diff-filter=ACMR'],
        { cwd, encoding: 'utf-8', timeout: GIT_TIMEOUT_MS },
        { fallback: '', trySafe, log, label: `git log in ${cwd}` },
      );
      const files = stdout ? stdout.split('\n').map((l) => l.trim()).filter(Boolean) : [];
      return { cwd, files };
    })
  );

  return rankModifiedFiles(results, TOP_FILES_LIMIT);
}

module.exports = { getMostModifiedFiles };
