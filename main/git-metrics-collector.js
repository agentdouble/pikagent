const { execFile } = require('child_process');
const { promisify } = require('util');
const { DEFAULT_DAYS } = require('./stats-helpers');
const {
  rankModifiedFiles,
  TOP_FILES_LIMIT,
  GIT_TIMEOUT_MS,
} = require('./usage-helpers');
const { createLogger, trySafe } = require('./logger');

const log = createLogger('git-metrics-collector');
const execFileAsync = promisify(execFile);

async function getMostModifiedFiles(cwds) {
  const results = await Promise.all(
    cwds.map(async (cwd) => {
      return trySafe(
        async () => {
          const { stdout } = await execFileAsync(
            'git',
            ['log', `--since=${DEFAULT_DAYS} days ago`, '--name-only', '--pretty=format:', '--diff-filter=ACMR'],
            { cwd, encoding: 'utf-8', timeout: GIT_TIMEOUT_MS }
          );
          return { cwd, files: stdout.split('\n').map((l) => l.trim()).filter(Boolean) };
        },
        { cwd, files: [] },
        { log, label: `git log in ${cwd}` },
      );
    })
  );

  return rankModifiedFiles(results, TOP_FILES_LIMIT);
}

module.exports = { getMostModifiedFiles };
