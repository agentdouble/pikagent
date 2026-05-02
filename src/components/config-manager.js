import { contextMenu } from '../utils/context-menu.js';
import { showPromptDialog } from '../utils/dom-dialogs.js';
import {
  AUTO_SAVE_DELAY,
  MENU_OFFSET,
  DEFAULT_CONFIG_NAME,
  configLabel,
  suggestedDuplicateName,
} from '../utils/config-manager-helpers.js';
import { registerComponent } from '../utils/component-registry.js';
import configApi from '../services/config-api.js';

export class ConfigManager {
  constructor(tabManager) {
    this.tabManager = tabManager;
    this.currentConfigName = null;
    this._configBarEl = null;
    this._saveTimer = null;
    this._restoringConfig = false;
  }

  get isRestoring() {
    return this._restoringConfig;
  }

  set isRestoring(val) {
    this._restoringConfig = val;
  }

  // ===== Auto Save =====

  scheduleAutoSave() {
    if (this._restoringConfig) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.autoSave(), AUTO_SAVE_DELAY);
  }

  async autoSave() {
    try {
      const data = this.tabManager.serialize();
      const name = this.currentConfigName || DEFAULT_CONFIG_NAME;
      await configApi.save(name, data);
      await configApi.setDefault(name);
      this.currentConfigName = name;
      this.updateConfigBar();
    } catch (e) {
      console.warn('Auto-save failed:', e);
    }
  }

  // ===== Config Operations =====

  async newConfig(name) {
    if (!name) return;
    await this.autoSave();
    this.currentConfigName = name;
    this.tabManager._disposeSideView('board');
    this.tabManager._disposeAllTabs();
    this.tabManager.createTab();
    await configApi.setDefault(name);
    await this.autoSave();
    this.updateConfigBar();
  }

  async duplicateConfig(newName) {
    if (!newName) return;
    const data = this.tabManager.serialize();
    await configApi.save(newName, data);
    this.currentConfigName = newName;
    await configApi.setDefault(newName);
    this.updateConfigBar();
  }

  async switchConfig(name) {
    if (name === this.currentConfigName) return;
    await this.autoSave();
    const config = await configApi.load(name);
    if (config && config.tabs && config.tabs.length > 0) {
      this.currentConfigName = name;
      await configApi.setDefault(name);
      await this.tabManager.restoreConfig(config);
      this.updateConfigBar();
    }
  }

  // ===== Config Bar UI =====

  updateConfigBar() {
    if (this._configBarEl) {
      const label = this._configBarEl.querySelector('.config-bar-name');
      if (label) label.textContent = this.currentConfigName || DEFAULT_CONFIG_NAME;
    }
  }

  async showConfigMenu(anchorEl) {
    const configs = await configApi.list();
    const rect = anchorEl.getBoundingClientRect();

    const items = configs.map((config) => ({
      label: configLabel(config.name, this.currentConfigName),
      action: () => this.switchConfig(config.name),
    }));

    if (configs.length > 0) {
      items.push({ separator: true });
    }

    items.push(
      {
        label: 'New Config...',
        action: () => this.promptConfigName('New Config', (name) => this.newConfig(name)),
      },
      {
        label: 'Duplicate Current...',
        action: () => {
          this.promptConfigName(suggestedDuplicateName(this.currentConfigName), (name) => this.duplicateConfig(name));
        },
      },
    );

    contextMenu.show(rect.left, rect.top - MENU_OFFSET, items);
  }

  async promptConfigName(defaultValue, callback) {
    const name = await showPromptDialog({ title: 'Config name', defaultValue });
    if (name) callback(name);
  }
}

registerComponent('ConfigManager', ConfigManager);
