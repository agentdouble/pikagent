import { formatCombo, eventToCombo } from '../utils/shortcut-helpers.js';
import { TERMINAL_THEMES, getTerminalThemeName, setTerminalTheme, getTerminalTheme, switchTerminalForMode } from '../utils/terminal-themes.js';
import { getAppTheme, setAppTheme } from '../utils/app-theme.js';
import { _el } from '../utils/dom.js';
import {
  MODAL_CLOSE_TRANSITION_MS, MODIFIER_KEYS, NAV_SECTIONS,
  MODE_BUTTONS, BOTTOM_CONFIG_BUTTONS, THEME_PREVIEW_LINES,
  COLOR_DOT_KEYS, CONFIG_ACTIONS, formatConfigMeta, buildActionBtn,
} from '../utils/settings-helpers.js';

export class SettingsModal {
  constructor(shortcutManager) {
    this.shortcutManager = shortcutManager;
    this.tabManager = null; // Set externally
    this.overlay = null;
    this.recording = null; // { actionId, index, el }
    this.activeSection = 'keybindings';
    this._updateUnsub = null;
    this.sectionRenderers = {
      keybindings: () => this.renderKeybindings(),
      appearance: () => this.renderAppearance(),
      configs: () => this.renderConfigs(),
      update: () => this.renderUpdate(),
    };
    this.build();
  }

  _applyThemeToTerminals() {
    if (!this.tabManager) return;
    const theme = getTerminalTheme();
    for (const [, tab] of this.tabManager.tabs) {
      if (tab.terminalPanel) tab.terminalPanel.applyTheme(theme);
    }
  }

  // ===== Build =====

  build() {
    this.overlay = _el('div', 'settings-overlay');
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.modal = _el('div', 'settings-modal');
    this.modal.appendChild(this._buildHeader());
    this.modal.appendChild(this._buildBody());
    this.overlay.appendChild(this.modal);

    this.keyHandler = (e) => {
      if (!this.recording) return;
      e.preventDefault();
      e.stopPropagation();
      if (MODIFIER_KEYS.includes(e.key)) return;
      this.finishRecording(eventToCombo(e));
    };
  }

  _buildHeader() {
    const header = _el('div', 'settings-header');
    header.appendChild(_el('h2', 'settings-title', 'Settings'));
    const closeBtn = _el('button', 'settings-close-btn', '×');
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    return header;
  }

  _buildBody() {
    const body = _el('div', 'settings-body');
    const nav = _el('div', 'settings-nav');

    this.navItems = {};
    for (const { key, label } of NAV_SECTIONS) {
      const item = _el('div', 'settings-nav-item', label);
      if (key === this.activeSection) item.classList.add('active');
      item.addEventListener('click', () => this.showSection(key));
      nav.appendChild(item);
      this.navItems[key] = item;
    }

    this.content = _el('div', 'settings-content');
    body.appendChild(nav);
    body.appendChild(this.content);
    return body;
  }

  showSection(section) {
    if (this._updateUnsub) { this._updateUnsub(); this._updateUnsub = null; }
    this.activeSection = section;
    for (const [key, el] of Object.entries(this.navItems)) {
      el.classList.toggle('active', key === section);
    }
    this.sectionRenderers[section]?.();
  }

  open() {
    this.showSection(this.activeSection);
    document.body.appendChild(this.overlay);
    requestAnimationFrame(() => this.overlay.classList.add('visible'));
    window.addEventListener('keydown', this.keyHandler, true);
  }

  close() {
    this.cancelRecording();
    window.removeEventListener('keydown', this.keyHandler, true);
    this.overlay.classList.remove('visible');
    setTimeout(() => {
      if (this.overlay.parentElement) this.overlay.remove();
    }, MODAL_CLOSE_TRANSITION_MS);
  }

  _createSectionHeading(title, ...extras) {
    this.content.replaceChildren();
    const heading = _el('div', 'settings-section-header');
    heading.appendChild(_el('h3', null, title));
    for (const el of extras) heading.appendChild(el);
    this.content.appendChild(heading);
    return heading;
  }

  // ===== Appearance Section =====

  _createThemePreviewLine(segments, theme) {
    const line = _el('div', 'theme-preview-line');
    for (const { text, colorKey } of segments) {
      const span = _el('span', null, text);
      span.style.color = theme[colorKey];
      line.appendChild(span);
    }
    return line;
  }

  _createThemeCard(name, theme, isActive) {
    const card = _el('div', 'theme-card');
    if (isActive) card.classList.add('theme-active');

    // Preview block
    const preview = _el('div', 'theme-preview');
    preview.style.background = theme.background;

    for (const segments of THEME_PREVIEW_LINES) {
      preview.appendChild(this._createThemePreviewLine(segments, theme));
    }

    // Color dots
    const dots = _el('div', 'theme-preview-dots');
    for (const key of COLOR_DOT_KEYS) {
      const dot = _el('span', 'theme-dot');
      dot.style.background = theme[key];
      dots.appendChild(dot);
    }
    preview.appendChild(dots);

    card.appendChild(preview);
    card.appendChild(_el('div', 'theme-card-label', name));

    card.addEventListener('click', () => {
      setTerminalTheme(name);
      this._applyThemeToTerminals();
      this.renderAppearance();
    });

    return card;
  }

  renderAppearance() {
    this._createSectionHeading('Appearance');

    // Day/Night mode toggle
    const modeRow = _el('div', 'theme-mode-row');
    modeRow.appendChild(_el('span', 'theme-mode-label', 'Mode'));

    const modeToggle = _el('div', 'theme-mode-toggle');
    const currentMode = getAppTheme();

    for (const { mode, label } of MODE_BUTTONS) {
      const btn = _el('button', 'theme-mode-btn', label);
      if (currentMode === mode) btn.classList.add('active');
      btn.addEventListener('click', () => {
        setAppTheme(mode);
        this._switchTerminalForMode(mode);
        this.renderAppearance();
      });
      modeToggle.appendChild(btn);
    }

    modeRow.appendChild(modeToggle);
    this.content.appendChild(modeRow);

    // Terminal theme grid
    this.content.appendChild(_el('h4', 'theme-sub-heading', 'Terminal Theme'));

    const currentThemeName = getTerminalThemeName();
    const grid = _el('div', 'theme-grid');
    for (const [name, theme] of Object.entries(TERMINAL_THEMES)) {
      grid.appendChild(this._createThemeCard(name, theme, name === currentThemeName));
    }
    this.content.appendChild(grid);
  }

  _switchTerminalForMode(mode) {
    if (switchTerminalForMode(mode)) this._applyThemeToTerminals();
  }

  // ===== Keybindings Section =====

  renderKeybindings() {
    const resetBtn = _el('button', 'settings-reset-btn', 'Reset to defaults');
    resetBtn.addEventListener('click', () => {
      this.shortcutManager.resetToDefaults();
      this.renderKeybindings();
    });
    this._createSectionHeading('Keyboard Shortcuts', resetBtn);

    const list = _el('div', 'keybinding-list');

    for (const binding of this.shortcutManager.getBindingsList()) {
      const row = _el('div', 'keybinding-row');
      row.appendChild(_el('div', 'keybinding-label', binding.label));

      const keysContainer = _el('div', 'keybinding-keys');
      for (let i = 0; i < binding.keys.length; i++) {
        keysContainer.appendChild(this.createKeyBadge(binding, i));
      }

      const addBtn = _el('button', 'keybinding-add-btn', '+');
      addBtn.title = 'Add keybinding';
      addBtn.addEventListener('click', () => {
        binding.keys.push('');
        this.shortcutManager.updateBinding(binding.id, binding.keys);
        this.renderKeybindings();
      });
      keysContainer.appendChild(addBtn);

      row.appendChild(keysContainer);
      list.appendChild(row);
    }

    this.content.appendChild(list);
  }

  createKeyBadge(binding, index) {
    const wrapper = _el('div', 'keybinding-badge-wrapper');

    const badge = _el('span', 'keybinding-badge');
    badge.textContent = binding.keys[index]
      ? formatCombo(binding.keys[index])
      : 'Not set';
    if (!binding.keys[index]) badge.classList.add('unset');

    badge.addEventListener('click', () => {
      this.startRecording(binding.id, index, badge);
    });

    const removeBtn = _el('span', 'keybinding-badge-remove', '×');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      binding.keys.splice(index, 1);
      this.shortcutManager.updateBinding(binding.id, binding.keys);
      this.renderKeybindings();
    });

    wrapper.appendChild(badge);
    if (binding.keys.length > 1) wrapper.appendChild(removeBtn);

    return wrapper;
  }

  startRecording(actionId, index, badgeEl) {
    this.cancelRecording();
    this.recording = { actionId, index, el: badgeEl };
    badgeEl.textContent = 'Press keys...';
    badgeEl.classList.add('recording');
  }

  finishRecording(combo) {
    if (!this.recording) return;

    const { actionId, index, el } = this.recording;
    this.recording = null;

    el.classList.remove('recording');
    el.textContent = formatCombo(combo);

    const bindings = this.shortcutManager.getBindingsList();
    const binding = bindings.find((b) => b.id === actionId);
    if (binding) {
      binding.keys[index] = combo;
      this.shortcutManager.updateBinding(actionId, binding.keys);
    }

    this.renderKeybindings();
  }

  cancelRecording() {
    if (this.recording) {
      this.recording.el.classList.remove('recording');
      this.recording = null;
      this.renderKeybindings();
    }
  }

  // ===== Workspace Configs Section =====

  _createConfigActions(config) {
    const handlers = {
      setDefault: async (e) => { e.stopPropagation(); await window.api.config.setDefault(config.name); this.renderConfigs(); },
      overwrite: async (e) => {
        e.stopPropagation();
        if (!this.tabManager) return;
        await window.api.config.save(config.name, this.tabManager.serialize());
        this.renderConfigs();
      },
      delete: async (e) => { e.stopPropagation(); await window.api.config.delete(config.name); this.renderConfigs(); },
    };

    const actions = _el('div', 'config-actions');
    for (const desc of CONFIG_ACTIONS) {
      if (desc.hideWhen && config[desc.hideWhen]) continue;
      actions.appendChild(buildActionBtn({ ...desc, onClick: handlers[desc.action] }));
    }
    return actions;
  }

  _buildConfigRowLeft(config) {
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

  _createConfigRow(config, currentName) {
    const row = _el('div', 'config-row');
    if (config.name === currentName) row.classList.add('config-active');

    row.addEventListener('click', async () => {
      if (!this.tabManager) return;
      await this.tabManager.configManager.switchConfig(config.name);
      this.renderConfigs();
    });

    row.appendChild(this._buildConfigRowLeft(config));
    row.appendChild(this._createConfigActions(config));
    return row;
  }

  _createBottomActions(currentName) {
    const handlers = {
      new: () => this._newConfig(),
      duplicate: () => this._duplicateConfig(currentName),
    };
    const container = _el('div', 'config-bottom-actions');
    for (const { label, action } of BOTTOM_CONFIG_BUTTONS) {
      container.appendChild(buildActionBtn({ label, cls: 'config-bottom-btn', onClick: handlers[action] }));
    }
    return container;
  }

  async renderConfigs() {
    this._createSectionHeading('Workspace Configs');

    const currentName = this.tabManager?.configManager?.currentConfigName || 'Default';

    // Current loaded config indicator
    const currentBar = _el('div', 'config-current-bar');
    currentBar.appendChild(_el('span', 'config-current-label', 'Config chargée :'));
    currentBar.appendChild(_el('span', 'config-current-value', currentName));
    this.content.appendChild(currentBar);

    // Config list
    const configs = await window.api.config.list();
    const list = _el('div', 'config-list');
    for (const config of configs) {
      list.appendChild(this._createConfigRow(config, currentName));
    }
    this.content.appendChild(list);

    this.content.appendChild(this._createBottomActions(currentName));
  }

  _newConfig() {
    if (!this.tabManager) return;
    this.tabManager.configManager.promptConfigName('', async (name) => {
      await this.tabManager.configManager.newConfig(name);
      this.renderConfigs();
    });
  }

  _duplicateConfig(currentName) {
    if (!this.tabManager) return;
    this.tabManager.configManager.promptConfigName(`${currentName} (copy)`, async (name) => {
      await this.tabManager.configManager.duplicateConfig(name);
      this.renderConfigs();
    });
  }

  // ===== Update Section =====

  async renderUpdate() {
    this._createSectionHeading('Update');

    const version = await window.api.update.version();
    const bar = _el('div', 'update-version-bar');
    bar.appendChild(_el('span', 'update-version-label', 'Version'));
    bar.appendChild(_el('span', 'update-version-value', `v${version}`));
    this.content.appendChild(bar);

    this.updateArea = _el('div', 'update-area');
    this.content.appendChild(this.updateArea);
    this._showUpdateCheck();
  }

  _showUpdateCheck() {
    this.updateArea.replaceChildren();
    const btn = _el('button', 'update-btn', 'Check for updates');
    btn.addEventListener('click', () => this._doUpdateCheck(btn));
    this.updateArea.appendChild(btn);
  }

  async _doUpdateCheck(btn) {
    btn.textContent = 'Checking...';
    btn.disabled = true;
    btn.classList.add('disabled');

    try {
      const result = await window.api.update.check();
      if (result.error) {
        this._showUpdateMessage('error', result.error);
      } else if (!result.available) {
        this._showUpdateMessage('ok', 'Your application is up to date');
      } else {
        this._showUpdateAvailable(result);
      }
    } catch (err) {
      this._showUpdateMessage('error', err.message);
    }
  }

  _showUpdateMessage(type, text) {
    this.updateArea.replaceChildren();
    const msg = _el('div', `update-message update-${type}`);
    msg.textContent = (type === 'ok' ? '\u2713 ' : '') + text;
    this.updateArea.appendChild(msg);

    const btn = _el('button', 'update-btn', type === 'ok' ? 'Check again' : 'Retry');
    btn.addEventListener('click', () => this._doUpdateCheck(btn));
    this.updateArea.appendChild(btn);
  }

  _showUpdateAvailable(result) {
    this.updateArea.replaceChildren();
    this.updateArea.appendChild(
      _el('div', 'update-available-badge', `${result.count} update${result.count > 1 ? 's' : ''} available`)
    );

    const list = _el('div', 'update-commits');
    for (const commit of result.commits.slice(0, 10)) {
      list.appendChild(_el('div', 'update-commit', commit));
    }
    if (result.commits.length > 10) {
      list.appendChild(_el('div', 'update-commit update-commit-more', `+ ${result.commits.length - 10} more...`));
    }
    this.updateArea.appendChild(list);

    const btn = _el('button', 'update-btn update-btn-primary', 'Install & restart');
    btn.addEventListener('click', () => this._doUpdate());
    this.updateArea.appendChild(btn);
  }

  async _doUpdate() {
    this.updateArea.replaceChildren();

    const progress = _el('div', 'update-progress');
    const barTrack = _el('div', 'update-progress-track');
    const barFill = _el('div', 'update-progress-fill');
    barTrack.appendChild(barFill);
    const label = _el('div', 'update-progress-label', 'Starting...');
    progress.appendChild(barTrack);
    progress.appendChild(label);
    this.updateArea.appendChild(progress);

    this._updateUnsub = window.api.update.onProgress((p) => {
      barFill.style.width = `${(p.step / p.total) * 100}%`;
      label.textContent = p.label;
    });

    try {
      await window.api.update.run();
      if (this._updateUnsub) { this._updateUnsub(); this._updateUnsub = null; }

      this.updateArea.replaceChildren();
      this.updateArea.appendChild(_el('div', 'update-message update-ok', '\u2713 Update installed successfully!'));
      const btn = _el('button', 'update-btn update-btn-primary', 'Restart now');
      btn.addEventListener('click', () => window.api.update.relaunch());
      this.updateArea.appendChild(btn);
    } catch (err) {
      if (this._updateUnsub) { this._updateUnsub(); this._updateUnsub = null; }
      this._showUpdateMessage('error', err.message);
    }
  }

}
