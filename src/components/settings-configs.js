/**
 * Workspace Configs section renderer for SettingsModal.
 * Extracted from settings-modal.js to reduce component size.
 */
import { _el } from '../utils/dom.js';
import { CONFIG_ACTIONS, BOTTOM_CONFIG_BUTTONS, formatConfigMeta, buildActionBtn } from '../utils/settings-helpers.js';
import { createSettingsSection } from '../utils/settings-section-builder.js';
import { registerComponent } from '../utils/component-registry.js';

function _createConfigActions(config, tabManager, renderConfigsFn) {
  const handlers = {
    setDefault: async (e) => { e.stopPropagation(); await window.api.config.setDefault(config.name); renderConfigsFn(); },
    overwrite: async (e) => {
      e.stopPropagation();
      if (!tabManager) return;
      await window.api.config.save(config.name, tabManager.serialize());
      renderConfigsFn();
    },
    delete: async (e) => { e.stopPropagation(); await window.api.config.delete(config.name); renderConfigsFn(); },
  };

  const actions = _el('div', 'config-actions');
  for (const desc of CONFIG_ACTIONS) {
    if (desc.hideWhen && config[desc.hideWhen]) continue;
    actions.appendChild(buildActionBtn({ ...desc, onClick: handlers[desc.action] }));
  }
  return actions;
}

function _buildConfigRowLeft(config) {
  const left = _el('div', 'config-row-left');

  const radio = _el('span', 'config-radio');
  if (config.isDefault) radio.classList.add('config-radio-default');
  left.appendChild(radio);

  const info = _el('div', 'config-info');
  const nameEl = _el('span', 'config-name', config.name);
  if (config.isDefault) {
    nameEl.appendChild(_el('span', 'config-default-tag', 'default'));
  }
  info.appendChild(nameEl);
  info.appendChild(_el('span', 'config-meta', formatConfigMeta(config.tabCount || 0, config.updatedAt)));
  left.appendChild(info);

  return left;
}

function _createConfigRow(config, currentName, tabManager, renderConfigsFn) {
  const row = _el('div', 'config-row');
  if (config.name === currentName) row.classList.add('config-active');

  row.addEventListener('click', async () => {
    if (!tabManager) return;
    await tabManager.configManager.switchConfig(config.name);
    renderConfigsFn();
  });

  row.appendChild(_buildConfigRowLeft(config));
  row.appendChild(_createConfigActions(config, tabManager, renderConfigsFn));
  return row;
}

function _createBottomActions(currentName, tabManager, renderConfigsFn) {
  const handlers = {
    new: () => {
      if (!tabManager) return;
      tabManager.configManager.promptConfigName('', async (name) => {
        await tabManager.configManager.newConfig(name);
        renderConfigsFn();
      });
    },
    duplicate: () => {
      if (!tabManager) return;
      tabManager.configManager.promptConfigName(`${currentName} (copy)`, async (name) => {
        await tabManager.configManager.duplicateConfig(name);
        renderConfigsFn();
      });
    },
  };
  const container = _el('div', 'config-bottom-actions');
  for (const { label, action } of BOTTOM_CONFIG_BUTTONS) {
    container.appendChild(buildActionBtn({ label, cls: 'config-bottom-btn', onClick: handlers[action] }));
  }
  return container;
}

/**
 * Render the Workspace Configs section into the given content element.
 * @param {HTMLElement} contentEl - the settings content container
 * @param {Object|null} tabManager
 * @param {function} renderConfigsFn - callback to re-render this section
 */
export async function renderConfigs(contentEl, tabManager, renderConfigsFn) {
  const currentName = tabManager?.configManager?.currentConfigName || 'Default';

  // Current loaded config indicator
  const currentBar = _el('div', 'config-current-bar');
  currentBar.appendChild(_el('span', 'config-current-label', 'Config chargée :'));
  currentBar.appendChild(_el('span', 'config-current-value', currentName));

  // Config list
  const configs = await window.api.config.list();
  const list = _el('div', 'config-list');
  for (const config of configs) {
    list.appendChild(_createConfigRow(config, currentName, tabManager, renderConfigsFn));
  }

  createSettingsSection(contentEl, {
    heading: 'Workspace Configs',
    content: [currentBar, list, _createBottomActions(currentName, tabManager, renderConfigsFn)],
  });
}

registerComponent('renderConfigs', renderConfigs);
