const RELEASE_UPDATE = {
  provider: 'github',
  providerLabel: 'GitHub Releases',
  repository: 'agentdouble/pikagent',
  channel: 'latest',
  artifacts: 'dmg + zip + latest-mac.yml',
};

function _stringifyNote(note) {
  if (!note) return null;
  if (typeof note === 'string') return note.trim();
  if (typeof note === 'object' && typeof note.note === 'string') return note.note.trim();
  return String(note).trim();
}

function normalizeReleaseNotes(releaseNotes) {
  const notes = Array.isArray(releaseNotes) ? releaseNotes : [releaseNotes];
  return notes.map(_stringifyNote).filter(Boolean).slice(0, 10);
}

function buildUpdateInfo(app, state = {}) {
  return {
    strategy: 'release-artifacts',
    provider: RELEASE_UPDATE.provider,
    providerLabel: RELEASE_UPDATE.providerLabel,
    repository: RELEASE_UPDATE.repository,
    channel: RELEASE_UPDATE.channel,
    artifacts: RELEASE_UPDATE.artifacts,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    updateDownloaded: Boolean(state.updateDownloaded),
    updateVersion: state.updateInfo?.version || null,
    requiresRestart: true,
  };
}

function buildAvailableResult(updateInfo, info) {
  const notes = normalizeReleaseNotes(updateInfo?.releaseNotes);
  const details = [
    `Version ${updateInfo.version}`,
    updateInfo.releaseName,
    ...notes,
  ].filter(Boolean);

  return {
    available: true,
    version: updateInfo.version,
    releaseName: updateInfo.releaseName || null,
    releaseDate: updateInfo.releaseDate || null,
    count: Math.max(1, details.length),
    commits: details.length ? details : [`Version ${updateInfo.version}`],
    info,
  };
}

function buildNotAvailableResult(info) {
  return {
    available: false,
    commits: [],
    count: 0,
    info,
  };
}

function toErrorMessage(err) {
  if (!err) return 'Unknown update error';
  return err.message || String(err);
}

module.exports = {
  RELEASE_UPDATE,
  normalizeReleaseNotes,
  buildUpdateInfo,
  buildAvailableResult,
  buildNotAvailableResult,
  toErrorMessage,
};
