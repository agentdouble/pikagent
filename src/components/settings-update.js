/**
 * Update section renderer for SettingsModal.
 * Handles version display, update check, diff preview, install, and relaunch.
 */
import { _el } from '../utils/dom.js';
import { createSettingsSection } from '../utils/settings-section-builder.js';
import { registerComponent } from '../utils/component-registry.js';

function _showCheckButton(area, onCheck) {
  area.replaceChildren();
  const btn = _el('button', 'update-btn', 'Check for updates');
  btn.addEventListener('click', () => onCheck(btn));
  area.appendChild(btn);
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
    _el('div', 'update-available-badge', `${result.count} update${result.count > 1 ? 's' : ''} available`),
  );

  const list = _el('div', 'update-commits');
  for (const commit of result.commits.slice(0, 10)) {
    list.appendChild(_el('div', 'update-commit', commit));
  }
  if (result.commits.length > 10) {
    list.appendChild(_el('div', 'update-commit update-commit-more', `+ ${result.commits.length - 10} more...`));
  }
  area.appendChild(list);

  const btn = _el('button', 'update-btn update-btn-primary', 'Install & restart');
  btn.addEventListener('click', onInstall);
  area.appendChild(btn);
}

/**
 * Render the Update section into the given content element.
 * @param {HTMLElement} contentEl
 */
export async function renderUpdate(contentEl) {
  createSettingsSection(contentEl, { heading: 'Update' });

  const version = await window.api.update.version();
  const bar = _el('div', 'update-version-bar');
  bar.appendChild(_el('span', 'update-version-label', 'Version'));
  bar.appendChild(_el('span', 'update-version-value', `v${version}`));
  contentEl.appendChild(bar);

  const area = _el('div', 'update-area');
  contentEl.appendChild(area);

  async function runCheck(btn) {
    btn.textContent = 'Checking...';
    btn.disabled = true;
    btn.classList.add('disabled');
    try {
      const result = await window.api.update.check();
      if (result.error) _showMessage(area, 'error', result.error, runCheck);
      else if (!result.available) _showMessage(area, 'ok', 'Your application is up to date', runCheck);
      else _showAvailable(area, result, runInstall);
    } catch (err) {
      _showMessage(area, 'error', err.message, runCheck);
    }
  }

  async function runInstall() {
    area.replaceChildren();

    const progress = _el('div', 'update-progress');
    const barTrack = _el('div', 'update-progress-track');
    const barFill = _el('div', 'update-progress-fill');
    barTrack.appendChild(barFill);
    const label = _el('div', 'update-progress-label', 'Starting...');
    progress.appendChild(barTrack);
    progress.appendChild(label);
    area.appendChild(progress);

    const unsub = window.api.update.onProgress((p) => {
      barFill.style.width = `${(p.step / p.total) * 100}%`;
      label.textContent = p.label;
    });

    try {
      await window.api.update.run();
      unsub?.();
      area.replaceChildren();
      area.appendChild(_el('div', 'update-message update-ok', '\u2713 Update installed successfully!'));
      const btn = _el('button', 'update-btn update-btn-primary', 'Restart now');
      btn.addEventListener('click', () => window.api.update.relaunch());
      area.appendChild(btn);
    } catch (err) {
      unsub?.();
      _showMessage(area, 'error', err.message, runCheck);
    }
  }

  _showCheckButton(area, runCheck);
}

registerComponent('renderUpdate', renderUpdate);
