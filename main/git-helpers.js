const { splitLines } = require('./parse-utils');

const DIFF_MAX_BUFFER = 5 * 1024 * 1024;

function execOpts(cwd, extra) {
  return { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...extra };
}

/** Parse git name-status output into { status, path, staged } entries. */
function parseNameStatus(raw, staged) {
  return splitLines(raw, (line) => {
    const [status, ...p] = line.split('\t');
    return { status, path: p.join('\t'), staged };
  });
}

/** Parse git ls-files output into { status, path, staged } entries. */
function parseUntracked(raw) {
  return splitLines(raw, (p) => ({ status: '?', path: p, staged: false }));
}

module.exports = { DIFF_MAX_BUFFER, execOpts, parseNameStatus, parseUntracked };
