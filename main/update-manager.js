const { app } = require('electron');
const {
  buildAvailableResult,
  buildNotAvailableResult,
  buildUpdateInfo,
  toErrorMessage,
} = require('./update-result-helpers');

let autoUpdater = null;
let updaterConfigured = false;
let progressReporter = null;
let pendingCheck = null;
let pendingDownload = null;
let lastUpdateInfo = null;
let updateDownloaded = false;

function _getAutoUpdater() {
  if (!autoUpdater) {
    ({ autoUpdater } = require('electron-updater'));
  }
  return autoUpdater;
}

function _sendProgress(label, percent = 0) {
  if (typeof progressReporter !== 'function') return;
  progressReporter({
    step: Math.max(1, Math.min(100, Math.round(percent))),
    total: 100,
    label,
  });
}

function _configureUpdater() {
  if (updaterConfigured) return _getAutoUpdater();

  const updater = _getAutoUpdater();
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;

  updater.on('download-progress', (progress = {}) => {
    const percent = Number.isFinite(progress.percent) ? progress.percent : 0;
    _sendProgress(`Downloading update (${Math.round(percent)}%)...`, percent);
  });

  updaterConfigured = true;
  return updater;
}

function init() {
  if (app.isPackaged) _configureUpdater();
}

function getVersion() {
  return app.getVersion();
}

function getUpdateInfo() {
  return buildUpdateInfo(app, { updateInfo: lastUpdateInfo, updateDownloaded });
}

function _releaseUpdatesUnavailable() {
  return {
    available: false,
    error: 'Release updates are only available from the packaged app.',
    info: getUpdateInfo(),
  };
}

function _finishCheck(resolve, cleanup, result) {
  cleanup();
  resolve(result);
}

async function _checkForUpdates() {
  if (!app.isPackaged) return _releaseUpdatesUnavailable();

  const updater = _configureUpdater();
  const info = getUpdateInfo();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      _finishCheck(resolve, cleanup, result);
    };
    const onAvailable = (updateInfo) => {
      lastUpdateInfo = updateInfo;
      updateDownloaded = false;
      finish(buildAvailableResult(updateInfo, getUpdateInfo()));
    };
    const onNotAvailable = () => {
      lastUpdateInfo = null;
      updateDownloaded = false;
      finish(buildNotAvailableResult(getUpdateInfo()));
    };
    const onError = (err) => {
      finish({ available: false, error: toErrorMessage(err), info });
    };
    const cleanup = () => {
      updater.removeListener('update-available', onAvailable);
      updater.removeListener('update-not-available', onNotAvailable);
      updater.removeListener('error', onError);
    };

    updater.once('update-available', onAvailable);
    updater.once('update-not-available', onNotAvailable);
    updater.once('error', onError);

    _sendProgress('Checking published releases...', 5);
    updater.checkForUpdates().catch(onError);
  });
}

function checkForUpdates() {
  if (!pendingCheck) {
    pendingCheck = _checkForUpdates().finally(() => {
      pendingCheck = null;
    });
  }
  return pendingCheck;
}

function _downloadUpdate(updater) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let downloadedFiles = [];
    const finishSuccess = (updateInfo = lastUpdateInfo) => {
      lastUpdateInfo = updateInfo || lastUpdateInfo;
      updateDownloaded = true;
      _sendProgress('Update downloaded. Restart to install.', 100);
      finish(resolve, {
        success: true,
        version: lastUpdateInfo?.version || null,
        files: downloadedFiles,
        info: getUpdateInfo(),
      });
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onDownloaded = (updateInfo) => {
      finishSuccess(updateInfo);
    };
    const onError = (err) => {
      finish(reject, new Error(toErrorMessage(err)));
    };
    const cleanup = () => {
      updater.removeListener('update-downloaded', onDownloaded);
      updater.removeListener('error', onError);
    };

    updater.once('update-downloaded', onDownloaded);
    updater.once('error', onError);

    _sendProgress('Downloading update...', 10);
    updater.downloadUpdate()
      .then((files) => {
        downloadedFiles = files || [];
        finishSuccess();
      })
      .catch(onError);
  });
}

async function performUpdate(sendProgress) {
  progressReporter = sendProgress;
  if (!app.isPackaged) throw new Error(_releaseUpdatesUnavailable().error);

  const updater = _configureUpdater();
  if (!lastUpdateInfo) {
    const check = await checkForUpdates();
    if (check.error) throw new Error(check.error);
    if (!check.available) throw new Error('No update available.');
  }

  if (!pendingDownload) {
    pendingDownload = _downloadUpdate(updater).finally(() => {
      pendingDownload = null;
    });
  }
  return pendingDownload;
}

function relaunch() {
  if (app.isPackaged && updateDownloaded) {
    _configureUpdater().quitAndInstall(false, true);
    return;
  }

  app.relaunch();
  setTimeout(() => app.exit(0), 300);
}

module.exports = { init, getVersion, getUpdateInfo, checkForUpdates, performUpdate, relaunch };
