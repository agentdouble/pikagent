/**
 * Update section renderer for SettingsModal.
 * Handles version display, update check, diff preview, install, and relaunch.
 */
import { _el } from '../utils/dom-api.js';
import { createSettingsSection } from '../utils/settings-section-builder.js';
import { registerComponent } from '../utils/component-registry.js';
import { updateFacade as updateApi } from '../facades/update-facade.js';

function _showCheckButton(area, onCheck) {
  area.replaceChildren();
  const btn = _el('button', 'update-btn', 'Check for updates');
  btn.addEventListener('click', () => onCheck(btn));
  area.appendChild(btn);
}

function _formatValue(value, fallback = 'Not configured') {
  return value ? String(value) : fallback;
}

function _targetRows(info) {
  return [
    ['Provider', _formatValue(info?.providerLabel || info?.provider)],
    ['Repository', _formatValue(info?.repository)],
    ['Channel', _formatValue(info?.channel)],
    ['Current version', _formatValue(info?.currentVersion, 'Unknown')],
    ['Artifacts', _formatValue(info?.artifacts)],
    ['Packaged app', info?.packaged ? 'Yes' : 'No'],
  ];
}

function _showUpdateTarget(container, info) {
  const target = _el('div', 'update-target');
  target.appendChild(_el('div', 'update-target-title', 'Update target'));

  const rows = _el('div', 'update-target-rows');
  for (const [label, value] of _targetRows(info)) {
    rows.appendChild(
      _el('div', 'update-target-row',
        _el('span', 'update-target-label', label),
        _el('span', 'update-target-value', value),
      ),
    );
  }
  target.appendChild(rows);

  target.appendChild(_el(
    'div',
    'update-target-note',
    'Checks published release artifacts, downloads the update, then installs it on restart.',
  ));
  container.appendChild(target);
}

function _showMessage(area, type, text, onRetry) {
  area.replaceChildren();
  const msg = _el('div', `update-message update-${type}`);
  msg.textContent = (type === 'ok' ? '\u2713 ' : '') + text;
  area.appendChild(msg);

  const btn = _el('button', 'update-btn', type === 'ok' ? 'Check again' : 'Retry');
  btn.addEventListener('click', () => onRetry(btn));
  area.appendChild(btn);
}

function _showAvailable(area, result, onInstall) {
  area.replaceChildren();
  area.appendChild(
    _el('div', 'update-available-badge', result.version ? `Version ${result.version} available` : `${result.count} update${result.count > 1 ? 's' : ''} available`),
  );

  const list = _el('div', 'update-commits');
  for (const commit of result.commits.slice(0, 10)) {
    list.appendChild(_el('div', 'update-commit', commit));
  }
  if (result.commits.length > 10) {
    list.appendChild(_el('div', 'update-commit update-commit-more', `+ ${result.commits.length - 10} more...`));
  }
  area.appendChild(list);

  const btn = _el('button', 'update-btn update-btn-primary', 'Download update');
  btn.addEventListener('click', onInstall);
  area.appendChild(btn);
}

/**
 * Build the version bar and update area, appending them to contentEl.
 * @returns {{ area: HTMLElement }}
 */
function renderUpdateUI(contentEl, version, info) {
  const bar = _el('div', 'update-version-bar');
  bar.appendChild(_el('span', 'update-version-label', 'Version'));
  bar.appendChild(_el('span', 'update-version-value', `v${version}`));
  contentEl.appendChild(bar);

  _showUpdateTarget(contentEl, info);

  const area = _el('div', 'update-area');
  contentEl.appendChild(area);
  return { area };
}

/**
 * Build progress DOM elements and bind the onProgress event.
 * @returns {{ unsub: (() => void)|undefined }}
 */
function handleProgress(area) {
  const progress = _el('div', 'update-progress');
  const barTrack = _el('div', 'update-progress-track');
  const barFill = _el('div', 'update-progress-fill');
  barTrack.appendChild(barFill);
  const label = _el('div', 'update-progress-label', 'Starting...');
  progress.appendChild(barTrack);
  progress.appendChild(label);
  area.appendChild(progress);

  const unsub = updateApi.onProgress((p) => {
    barFill.style.width = `${(p.step / p.total) * 100}%`;
    label.textContent = p.label;
  });
  return { unsub };
}

/**
 * Run the download/install flow: show progress, then success or error.
 */
async function handleDownload(area, runCheck) {
  area.replaceChildren();
  const { unsub } = handleProgress(area);

  try {
    await updateApi.run();
    unsub?.();
    area.replaceChildren();
    area.appendChild(_el('div', 'update-message update-ok', '\u2713 Update downloaded. Restart to install.'));
    const btn = _el('button', 'update-btn update-btn-primary', 'Restart and install');
    btn.addEventListener('click', () => updateApi.relaunch());
    area.appendChild(btn);
  } catch (err) {
    unsub?.();
    _showMessage(area, 'error', err.message, runCheck);
  }
}

/**
 * Handle the check-for-updates button click: disable the button, run the check, show result.
 * @param {HTMLElement} area
 * @param {HTMLButtonElement} btn
 */
async function runCheck(area, btn) {
  btn.textContent = 'Checking...';
  btn.disabled = true;
  btn.classList.add('disabled');
  try {
    const result = await updateApi.check();
    if (result.error) _showMessage(area, 'error', result.error, (b) => runCheck(area, b));
    else if (!result.available) _showMessage(area, 'ok', 'Your application is up to date', (b) => runCheck(area, b));
    else _showAvailable(area, result, () => handleDownload(area, (b) => runCheck(area, b)));
  } catch (err) {
    _showMessage(area, 'error', err.message, (b) => runCheck(area, b));
  }
}

/**
 * Render the Update section into the given content element.
 * @param {HTMLElement} contentEl
 */
async function renderUpdate(contentEl) {
  createSettingsSection(contentEl, { heading: 'Update' });
  const [version, info] = await Promise.all([
    updateApi.version(),
    updateApi.info(),
  ]);
  const { area } = renderUpdateUI(contentEl, version, info);
  _showCheckButton(area, (btn) => runCheck(area, btn));
}

registerComponent('renderUpdate', renderUpdate);
