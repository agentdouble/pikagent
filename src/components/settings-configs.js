/**
 * Workspace Configs section renderer for SettingsModal.
 * Extracted from settings-modal.js to reduce component size.
 */
import { _el } from '../utils/dom.js';
import { CONFIG_ACTIONS, BOTTOM_CONFIG_BUTTONS, formatConfigMeta } from '../utils/settings-helpers.js';
import { buildSettingsSection, createActionBar } from '../utils/settings-section-builder.js';
import { registerComponent } from '../utils/component-registry.js';
import { createAsyncHandler } from '../utils/event-helpers.js';

function _createConfigActions(config, tabManager, renderConfigsFn) {
  return createActionBar({
    containerClass: 'config-actions',
    actions: CONFIG_ACTIONS,
    handlerDefs: {
      setDefault: { apiCall: () => window.api.config.setDefault(config.name) },
      overwrite: { apiCall: () => window.api.config.save(config.name, tabManager.serialize()), guard: () => !!tabManager },
      delete: { apiCall: () => window.api.config.delete(config.name) },
    },
    onSuccess: renderConfigsFn,
    filter: (desc) => !(desc.hideWhen && config[desc.hideWhen]),
  });
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

  row.addEventListener('click', createAsyncHandler(
    { stopProp: false, guard: () => !!tabManager, onSuccess: renderConfigsFn },
    () => tabManager.configManager.switchConfig(config.name),
  ));

  row.appendChild(_buildConfigRowLeft(config));
  row.appendChild(_createConfigActions(config, tabManager, renderConfigsFn));
  return row;
}

function _createBottomActions(currentName, tabManager, renderConfigsFn) {
  return createActionBar({
    containerClass: 'config-bottom-actions',
    actions: BOTTOM_CONFIG_BUTTONS.map(({ label, action }) => ({ label, action, cls: 'config-bottom-btn' })),
    handlerDefs: {
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
    },
  });
}

/**
 * Render the Workspace Configs section into the given content element.
 * @param {HTMLElement} contentEl - the settings content container
 * @param {import('../components/tab-manager.js').TabManager|null} tabManager
 * @param {() => void} renderConfigsFn - callback to re-render this section
 */
export async function renderConfigs(contentEl, tabManager, renderConfigsFn) {
  const currentName = tabManager?.configManager?.currentConfigName || 'Default';

  // Current loaded config indicator
  const currentBar = _el('div', 'config-current-bar');
  currentBar.appendChild(_el('span', 'config-current-label', 'Config chargée :'));
  currentBar.appendChild(_el('span', 'config-current-value', currentName));

  // Config list
  const configs = await window.api.config.list();

  buildSettingsSection(contentEl, {
    heading: 'Workspace Configs',
    items: configs,
    renderItem: (config) => _createConfigRow(config, currentName, tabManager, renderConfigsFn),
    listClass: 'config-list',
    before: [currentBar],
    after: [_createBottomActions(currentName, tabManager, renderConfigsFn)],
  });
}

registerComponent('renderConfigs', renderConfigs);
