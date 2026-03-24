import { ShortcutManager } from './shortcuts.js';
import { TERMINAL_THEMES, getTerminalThemeName, setTerminalTheme, getTerminalTheme, switchTerminalForMode } from '../utils/terminal-themes.js';
import { getAppTheme, setAppTheme } from '../utils/app-theme.js';

const MODAL_CLOSE_TRANSITION_MS = 200;
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta'];

const NAV_SECTIONS = [
  { key: 'keybindings', label: 'Keyboard Shortcuts' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'configs', label: 'Workspace Configs' },
];

const MODE_BUTTONS = [
  { mode: 'dark', label: 'Night' },
  { mode: 'light', label: 'Day' },
];

const BOTTOM_CONFIG_BUTTONS = [
  { label: 'New Config...', action: 'new' },
  { label: 'Duplicate Current...', action: 'duplicate' },
];

const THEME_PREVIEW_LINES = [
  [{ text: '$ ', colorKey: 'green' }, { text: 'npm start', colorKey: 'foreground' }],
  [{ text: '> ', colorKey: 'cyan' }, { text: 'ready', colorKey: 'green' }],
];

const COLOR_DOT_KEYS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];

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

  // ===== DOM Helpers =====

  _el(tag, className, textContent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== undefined) el.textContent = textContent;
    return el;
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
    this.overlay = this._el('div', 'settings-overlay');
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.modal = this._el('div', 'settings-modal');

    // Header
    const header = this._el('div', 'settings-header');
    header.appendChild(this._el('h2', 'settings-title', 'Settings'));
    const closeBtn = this._el('button', 'settings-close-btn', '×');
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    this.modal.appendChild(header);

    // Nav (sidebar)
    const body = this._el('div', 'settings-body');
    const nav = this._el('div', 'settings-nav');

    this.navItems = {};
    for (const { key, label } of NAV_SECTIONS) {
      const item = this._el('div', 'settings-nav-item', label);
      if (key === this.activeSection) item.classList.add('active');
      item.addEventListener('click', () => this.showSection(key));
      nav.appendChild(item);
      this.navItems[key] = item;
    }

    // Content
    this.content = this._el('div', 'settings-content');

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

      const parts = [];
      if (e.shiftKey) parts.push('shift');
      if (e.ctrlKey) parts.push('control');
      if (e.altKey) parts.push('alt');
      if (e.metaKey) parts.push('meta');
      parts.push(e.key.toLowerCase());
      const combo = parts.join('+');

      this.finishRecording(combo);
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
    const heading = this._el('div', 'settings-section-header');
    heading.appendChild(this._el('h3', null, title));
    for (const el of extras) heading.appendChild(el);
    this.content.appendChild(heading);
    return heading;
  }

  // ===== Appearance Section =====

  _createThemePreviewLine(segments, theme) {
    const line = this._el('div', 'theme-preview-line');
    for (const { text, colorKey } of segments) {
      const span = this._el('span', null, text);
      span.style.color = theme[colorKey];
      line.appendChild(span);
    }
    return line;
  }

  _createThemeCard(name, theme, isActive) {
    const card = this._el('div', 'theme-card');
    if (isActive) card.classList.add('theme-active');

    // Preview block
    const preview = this._el('div', 'theme-preview');
    preview.style.background = theme.background;

    for (const segments of THEME_PREVIEW_LINES) {
      preview.appendChild(this._createThemePreviewLine(segments, theme));
    }

    // Color dots
    const dots = this._el('div', 'theme-preview-dots');
    for (const key of COLOR_DOT_KEYS) {
      const dot = this._el('span', 'theme-dot');
      dot.style.background = theme[key];
      dots.appendChild(dot);
    }
    preview.appendChild(dots);

    card.appendChild(preview);
    card.appendChild(this._el('div', 'theme-card-label', name));

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
    const modeRow = this._el('div', 'theme-mode-row');
    modeRow.appendChild(this._el('span', 'theme-mode-label', 'Mode'));

    const modeToggle = this._el('div', 'theme-mode-toggle');
    const currentMode = getAppTheme();

    for (const { mode, label } of MODE_BUTTONS) {
      const btn = this._el('button', 'theme-mode-btn', label);
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
    this.content.appendChild(this._el('h4', 'theme-sub-heading', 'Terminal Theme'));

    const currentThemeName = getTerminalThemeName();
    const grid = this._el('div', 'theme-grid');
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
    const resetBtn = this._el('button', 'settings-reset-btn', 'Reset to defaults');
    resetBtn.addEventListener('click', () => {
      this.shortcutManager.resetToDefaults();
      this.renderKeybindings();
    });
    this._createSectionHeading('Keyboard Shortcuts', resetBtn);

    const list = this._el('div', 'keybinding-list');

    for (const binding of this.shortcutManager.getBindingsList()) {
      const row = this._el('div', 'keybinding-row');
      row.appendChild(this._el('div', 'keybinding-label', binding.label));

      const keysContainer = this._el('div', 'keybinding-keys');
      for (let i = 0; i < binding.keys.length; i++) {
        keysContainer.appendChild(this.createKeyBadge(binding, i));
      }

      const addBtn = this._el('button', 'keybinding-add-btn', '+');
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
    const wrapper = this._el('div', 'keybinding-badge-wrapper');

    const badge = this._el('span', 'keybinding-badge');
    badge.textContent = binding.keys[index]
      ? ShortcutManager.formatCombo(binding.keys[index])
      : 'Not set';
    if (!binding.keys[index]) badge.classList.add('unset');

    badge.addEventListener('click', () => {
      this.startRecording(binding.id, index, badge);
    });

    const removeBtn = this._el('span', 'keybinding-badge-remove', '×');
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
    el.textContent = ShortcutManager.formatCombo(combo);

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
    const actions = this._el('div', 'config-actions');

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
      const btn = this._el('button', cls || 'config-action-btn', label);
      if (title) btn.title = title;
      btn.addEventListener('click', (e) => { e.stopPropagation(); handler(); });
      actions.appendChild(btn);
    }

    return actions;
  }

  _createConfigRow(config, currentName) {
    const row = this._el('div', 'config-row');
    if (config.name === currentName) row.classList.add('config-active');

    // Left: radio + info
    const left = this._el('div', 'config-row-left');

    const radio = this._el('span', 'config-radio');
    if (config.isDefault) radio.classList.add('config-radio-default');
    left.appendChild(radio);

    const info = this._el('div', 'config-info');

    const nameEl = this._el('span', 'config-name', config.name);
    if (config.isDefault) {
      nameEl.appendChild(this._el('span', 'config-default-tag', 'default'));
    }
    info.appendChild(nameEl);

    const tabCount = config.tabCount || 0;
    const date = config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : '';
    info.appendChild(this._el('span', 'config-meta', `${tabCount} tab${tabCount !== 1 ? 's' : ''} · ${date}`));

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
    const container = this._el('div', 'config-bottom-actions');
    for (const { label, action } of BOTTOM_CONFIG_BUTTONS) {
      const btn = this._el('button', 'config-bottom-btn', label);
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
    const currentBar = this._el('div', 'config-current-bar');
    currentBar.appendChild(this._el('span', 'config-current-label', 'Config chargée :'));
    currentBar.appendChild(this._el('span', 'config-current-value', currentName));
    this.content.appendChild(currentBar);

    // Config list
    const configs = await window.api.config.list();
    const list = this._el('div', 'config-list');
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
