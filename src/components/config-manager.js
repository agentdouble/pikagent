import { contextMenu } from './context-menu.js';
import { _el } from '../utils/dom.js';
import {
  AUTO_SAVE_DELAY,
  MENU_OFFSET,
  DEFAULT_CONFIG_NAME,
  configLabel,
  suggestedDuplicateName,
} from '../utils/config-manager-helpers.js';

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
      await window.api.config.save(name, data);
      await window.api.config.setDefault(name);
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
    this.tabManager.createTab('Workspace 1');
    await window.api.config.setDefault(name);
    await this.autoSave();
    this.updateConfigBar();
  }

  async duplicateConfig(newName) {
    if (!newName) return;
    const data = this.tabManager.serialize();
    await window.api.config.save(newName, data);
    this.currentConfigName = newName;
    await window.api.config.setDefault(newName);
    this.updateConfigBar();
  }

  async switchConfig(name) {
    if (name === this.currentConfigName) return;
    await this.autoSave();
    const config = await window.api.config.load(name);
    if (config && config.tabs && config.tabs.length > 0) {
      this.currentConfigName = name;
      await window.api.config.setDefault(name);
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
    const configs = await window.api.config.list();
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

  promptConfigName(defaultValue, callback) {
    const overlay = _el('div', 'config-prompt-overlay');
    const close = () => overlay.remove();
    const confirm = () => {
      const name = input.value.trim();
      close();
      if (name) callback(name);
    };

    const input = _el('input', 'config-prompt-input');
    input.type = 'text';
    input.value = defaultValue;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') close();
    });

    const cancelBtn = _el('button', 'config-prompt-cancel', 'Cancel');
    cancelBtn.addEventListener('click', close);

    const confirmBtn = _el('button', 'config-prompt-confirm', 'Create');
    confirmBtn.addEventListener('click', confirm);

    const btns = _el('div', 'config-prompt-btns');
    btns.append(cancelBtn, confirmBtn);

    const box = _el('div', 'config-prompt-box');
    box.append(_el('label', 'config-prompt-label', 'Config name'), input, btns);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  }
}
