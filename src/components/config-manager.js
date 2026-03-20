import { contextMenu } from './context-menu.js';

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
    this._saveTimer = setTimeout(() => this.autoSave(), 500);
  }

  async autoSave() {
    try {
      const data = this.tabManager.serialize();
      const name = this.currentConfigName || 'Default';
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
    this.tabManager._disposeBoard();
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
      if (label) label.textContent = this.currentConfigName || 'Default';
    }
  }

  async showConfigMenu(anchorEl) {
    const configs = await window.api.config.list();
    const rect = anchorEl.getBoundingClientRect();

    const items = [];

    for (const config of configs) {
      const isCurrent = config.name === this.currentConfigName;
      items.push({
        label: `${isCurrent ? '\u25cf ' : ''}${config.name}`,
        action: () => this.switchConfig(config.name),
      });
    }

    if (configs.length > 0) {
      items.push({ separator: true });
    }

    items.push({
      label: 'New Config...',
      action: () => this.promptConfigName('New Config', (name) => this.newConfig(name)),
    });

    items.push({
      label: 'Duplicate Current...',
      action: () => {
        const suggested = `${this.currentConfigName || 'Default'} (copy)`;
        this.promptConfigName(suggested, (name) => this.duplicateConfig(name));
      },
    });

    contextMenu.show(rect.left, rect.top - 4, items);
  }

  promptConfigName(defaultValue, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'config-prompt-overlay';

    const box = document.createElement('div');
    box.className = 'config-prompt-box';

    const label = document.createElement('label');
    label.className = 'config-prompt-label';
    label.textContent = 'Config name';

    const input = document.createElement('input');
    input.className = 'config-prompt-input';
    input.type = 'text';
    input.value = defaultValue;

    const btns = document.createElement('div');
    btns.className = 'config-prompt-btns';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'config-prompt-cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'config-prompt-confirm';
    confirmBtn.textContent = 'Create';

    const close = () => overlay.remove();
    const confirm = () => {
      const name = input.value.trim();
      close();
      if (name) callback(name);
    };

    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', confirm);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') close();
    });

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  }
}
