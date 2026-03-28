import { formatCombo, eventToCombo } from '../utils/shortcut-helpers.js';
import { TERMINAL_THEMES, getTerminalThemeName, setTerminalTheme, getTerminalTheme, switchTerminalForMode } from '../utils/terminal-themes.js';
import { getAppTheme, setAppTheme } from '../utils/app-theme.js';
import { _el } from '../utils/dom.js';
import {
  MODAL_CLOSE_TRANSITION_MS, MODIFIER_KEYS, NAV_SECTIONS,
  MODE_BUTTONS, BOTTOM_CONFIG_BUTTONS, THEME_PREVIEW_LINES,
  COLOR_DOT_KEYS, formatConfigMeta,
} from '../utils/settings-helpers.js';

export class SettingsModal {
  constructor(shortcutManager) {
    this.shortcutManager = shortcutManager;
    this.tabManager = null; // Set externally
    this.overlay = null;
    this.recording = null; // { actionId, index, el }
    this.activeSection = 'keybindings';
    this.sectionRenderers = {
      keybindings: () => this.renderKeybindings(),
      appearance: () => this.renderAppearance(),
      configs: () => this.renderConfigs(),
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

    // Header
    const header = _el('div', 'settings-header');
    header.appendChild(_el('h2', 'settings-title', 'Settings'));
    const closeBtn = _el('button', 'settings-close-btn', '×');
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    this.modal.appendChild(header);

    // Nav (sidebar)
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

    // Content
    this.content = _el('div', 'settings-content');

    body.appendChild(nav);
    body.appendChild(this.content);
    this.modal.appendChild(body);
    this.overlay.appendChild(this.modal);

    // Keyboard listener for recording
    this.keyHandler = (e) => {
      if (!this.recording) return;
      e.preventDefault();
      e.stopPropagation();

      if (MODIFIER_KEYS.includes(e.key)) return;

      this.finishRecording(eventToCombo(e));
    };
  }

  showSection(section) {
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
    const actions = _el('div', 'config-actions');

    const descriptors = [
      ...(!config.isDefault ? [{
        label: 'Set Default', title: 'Charger au démarrage',
        handler: async () => { await window.api.config.setDefault(config.name); this.renderConfigs(); },
      }] : []),
      {
        label: 'Overwrite', title: 'Écraser avec le workspace actuel',
        handler: async () => {
          if (!this.tabManager) return;
          await window.api.config.save(config.name, this.tabManager.serialize());
          this.renderConfigs();
        },
      },
      {
        label: '✕', title: '', cls: 'config-action-btn config-delete-btn',
        handler: async () => { await window.api.config.delete(config.name); this.renderConfigs(); },
      },
    ];

    for (const { label, title, cls, handler } of descriptors) {
      const btn = _el('button', cls || 'config-action-btn', label);
      if (title) btn.title = title;
      btn.addEventListener('click', (e) => { e.stopPropagation(); handler(); });
      actions.appendChild(btn);
    }

    return actions;
  }

  _createConfigRow(config, currentName) {
    const row = _el('div', 'config-row');
    if (config.name === currentName) row.classList.add('config-active');

    // Left: radio + info
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

    row.addEventListener('click', async () => {
      if (!this.tabManager) return;
      await this.tabManager.configManager.switchConfig(config.name);
      this.renderConfigs();
    });

    row.appendChild(left);
    row.appendChild(this._createConfigActions(config));
    return row;
  }

  _createBottomActions(currentName) {
    const container = _el('div', 'config-bottom-actions');
    for (const { label, action } of BOTTOM_CONFIG_BUTTONS) {
      const btn = _el('button', 'config-bottom-btn', label);
      if (action === 'new') {
        btn.addEventListener('click', () => this._newConfig());
      } else {
        btn.addEventListener('click', () => this._duplicateConfig(currentName));
      }
      container.appendChild(btn);
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

}
