import { ShortcutManager } from './shortcuts.js';
import { TERMINAL_THEMES, getTerminalThemeName, setTerminalTheme, getTerminalTheme } from '../utils/terminal-themes.js';

const MODAL_CLOSE_TRANSITION_MS = 200;
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta'];

const NAV_SECTIONS = [
  { key: 'keybindings', label: 'Keyboard Shortcuts' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'configs', label: 'Workspace Configs' },
];

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

  build() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'settings-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Modal
    this.modal = document.createElement('div');
    this.modal.className = 'settings-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'settings-header';

    const title = document.createElement('h2');
    title.className = 'settings-title';
    title.textContent = 'Settings';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    this.modal.appendChild(header);

    // Nav (sidebar)
    const body = document.createElement('div');
    body.className = 'settings-body';

    const nav = document.createElement('div');
    nav.className = 'settings-nav';

    this.navItems = {};
    for (const { key, label } of NAV_SECTIONS) {
      const item = document.createElement('div');
      item.className = 'settings-nav-item';
      if (key === this.activeSection) item.classList.add('active');
      item.textContent = label;
      item.addEventListener('click', () => this.showSection(key));
      nav.appendChild(item);
      this.navItems[key] = item;
    }

    // Content
    this.content = document.createElement('div');
    this.content.className = 'settings-content';

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
    this.content.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'settings-section-header';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    heading.appendChild(h3);
    for (const el of extras) heading.appendChild(el);
    this.content.appendChild(heading);
    return heading;
  }

  renderAppearance() {
    this._createSectionHeading('Terminal Theme');

    const currentThemeName = getTerminalThemeName();
    const grid = document.createElement('div');
    grid.className = 'theme-grid';

    for (const [name, theme] of Object.entries(TERMINAL_THEMES)) {
      const card = document.createElement('div');
      card.className = 'theme-card';
      if (name === currentThemeName) card.classList.add('theme-active');

      // Preview block
      const preview = document.createElement('div');
      preview.className = 'theme-preview';
      preview.style.background = theme.background;

      const colors = [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan];
      const line1 = document.createElement('div');
      line1.className = 'theme-preview-line';
      const prompt = document.createElement('span');
      prompt.textContent = '$ ';
      prompt.style.color = theme.green;
      line1.appendChild(prompt);
      const cmd = document.createElement('span');
      cmd.textContent = 'npm start';
      cmd.style.color = theme.foreground;
      line1.appendChild(cmd);
      preview.appendChild(line1);

      const line2 = document.createElement('div');
      line2.className = 'theme-preview-line';
      const arrow = document.createElement('span');
      arrow.textContent = '> ';
      arrow.style.color = theme.cyan;
      line2.appendChild(arrow);
      const msg = document.createElement('span');
      msg.textContent = 'ready';
      msg.style.color = theme.green;
      line2.appendChild(msg);
      preview.appendChild(line2);

      // Color dots
      const dots = document.createElement('div');
      dots.className = 'theme-preview-dots';
      for (const c of colors) {
        const dot = document.createElement('span');
        dot.className = 'theme-dot';
        dot.style.background = c;
        dots.appendChild(dot);
      }
      preview.appendChild(dots);

      card.appendChild(preview);

      const label = document.createElement('div');
      label.className = 'theme-card-label';
      label.textContent = name;
      card.appendChild(label);

      card.addEventListener('click', () => {
        setTerminalTheme(name);
        // Apply to all open terminals
        if (this.tabManager) {
          const newTheme = getTerminalTheme();
          for (const [, tab] of this.tabManager.tabs) {
            if (tab.terminalPanel) tab.terminalPanel.applyTheme(newTheme);
          }
        }
        this.renderAppearance();
      });

      grid.appendChild(card);
    }

    this.content.appendChild(grid);
  }

  renderKeybindings() {
    const resetBtn = document.createElement('button');
    resetBtn.className = 'settings-reset-btn';
    resetBtn.textContent = 'Reset to defaults';
    resetBtn.addEventListener('click', () => {
      this.shortcutManager.resetToDefaults();
      this.renderKeybindings();
    });
    this._createSectionHeading('Keyboard Shortcuts', resetBtn);

    const list = document.createElement('div');
    list.className = 'keybinding-list';

    const bindings = this.shortcutManager.getBindingsList();

    for (const binding of bindings) {
      const row = document.createElement('div');
      row.className = 'keybinding-row';

      const label = document.createElement('div');
      label.className = 'keybinding-label';
      label.textContent = binding.label;

      const keysContainer = document.createElement('div');
      keysContainer.className = 'keybinding-keys';

      for (let i = 0; i < binding.keys.length; i++) {
        const keyBadge = this.createKeyBadge(binding, i);
        keysContainer.appendChild(keyBadge);
      }

      // Add binding button
      const addBtn = document.createElement('button');
      addBtn.className = 'keybinding-add-btn';
      addBtn.textContent = '+';
      addBtn.title = 'Add keybinding';
      addBtn.addEventListener('click', () => {
        binding.keys.push('');
        this.shortcutManager.updateBinding(binding.id, binding.keys);
        this.renderKeybindings();
      });
      keysContainer.appendChild(addBtn);

      row.appendChild(label);
      row.appendChild(keysContainer);
      list.appendChild(row);
    }

    this.content.appendChild(list);
  }

  createKeyBadge(binding, index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'keybinding-badge-wrapper';

    const badge = document.createElement('span');
    badge.className = 'keybinding-badge';
    badge.textContent = binding.keys[index]
      ? ShortcutManager.formatCombo(binding.keys[index])
      : 'Not set';
    if (!binding.keys[index]) badge.classList.add('unset');

    badge.addEventListener('click', () => {
      this.startRecording(binding.id, index, badge);
    });

    const removeBtn = document.createElement('span');
    removeBtn.className = 'keybinding-badge-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      binding.keys.splice(index, 1);
      this.shortcutManager.updateBinding(binding.id, binding.keys);
      this.renderKeybindings();
    });

    wrapper.appendChild(badge);
    if (binding.keys.length > 1) {
      wrapper.appendChild(removeBtn);
    }

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

    // Update the binding
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

  async renderConfigs() {
    this._createSectionHeading('Workspace Configs');

    // Current loaded config indicator
    const currentName = this.tabManager?.currentConfigName || 'Default';
    const currentBar = document.createElement('div');
    currentBar.className = 'config-current-bar';
    const currentLabel = document.createElement('span');
    currentLabel.className = 'config-current-label';
    currentLabel.textContent = 'Config chargée :';
    currentBar.appendChild(currentLabel);
    const currentValue = document.createElement('span');
    currentValue.className = 'config-current-value';
    currentValue.textContent = currentName;
    currentBar.appendChild(currentValue);
    this.content.appendChild(currentBar);

    // Config list with radio-style selection
    const configs = await window.api.config.list();

    const list = document.createElement('div');
    list.className = 'config-list';

    for (const config of configs) {
      const row = document.createElement('div');
      row.className = 'config-row';
      const isCurrent = config.name === currentName;
      if (isCurrent) row.classList.add('config-active');

      // Radio + name
      const left = document.createElement('div');
      left.className = 'config-row-left';

      const radio = document.createElement('span');
      radio.className = 'config-radio';
      if (config.isDefault) radio.classList.add('config-radio-default');
      left.appendChild(radio);

      const info = document.createElement('div');
      info.className = 'config-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'config-name';
      nameEl.textContent = config.name;
      if (config.isDefault) {
        const defaultTag = document.createElement('span');
        defaultTag.className = 'config-default-tag';
        defaultTag.textContent = 'default';
        nameEl.appendChild(defaultTag);
      }
      info.appendChild(nameEl);

      const meta = document.createElement('span');
      meta.className = 'config-meta';
      const tabCount = config.tabCount || 0;
      const date = config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : '';
      meta.textContent = `${tabCount} tab${tabCount !== 1 ? 's' : ''} · ${date}`;
      info.appendChild(meta);

      left.appendChild(info);

      // Click row to load
      row.addEventListener('click', async () => {
        const data = await window.api.config.load(config.name);
        if (data && this.tabManager) {
          await this.tabManager.restoreConfig(data);
          this.tabManager.currentConfigName = config.name;
          this.renderConfigs();
        }
      });

      // Actions (shown on hover)
      const actions = document.createElement('div');
      actions.className = 'config-actions';

      // Set default
      if (!config.isDefault) {
        const defaultBtn = document.createElement('button');
        defaultBtn.className = 'config-action-btn';
        defaultBtn.textContent = 'Set Default';
        defaultBtn.title = 'Charger au démarrage';
        defaultBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.api.config.setDefault(config.name);
          this.renderConfigs();
        });
        actions.appendChild(defaultBtn);
      }

      // Overwrite
      const overwriteBtn = document.createElement('button');
      overwriteBtn.className = 'config-action-btn';
      overwriteBtn.textContent = 'Overwrite';
      overwriteBtn.title = 'Écraser avec le workspace actuel';
      overwriteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!this.tabManager) return;
        const data = this.tabManager.serialize();
        await window.api.config.save(config.name, data);
        this.renderConfigs();
      });
      actions.appendChild(overwriteBtn);

      // Delete
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'config-action-btn config-delete-btn';
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.config.delete(config.name);
        this.renderConfigs();
      });
      actions.appendChild(deleteBtn);

      row.appendChild(left);
      row.appendChild(actions);
      list.appendChild(row);
    }

    this.content.appendChild(list);

    // Bottom actions: New Config + Duplicate Current
    const bottomActions = document.createElement('div');
    bottomActions.className = 'config-bottom-actions';

    const newBtn = document.createElement('button');
    newBtn.className = 'config-bottom-btn';
    newBtn.textContent = 'New Config...';
    newBtn.addEventListener('click', () => this._saveConfigAs('Nom de la nouvelle config :'));
    bottomActions.appendChild(newBtn);

    const dupBtn = document.createElement('button');
    dupBtn.className = 'config-bottom-btn';
    dupBtn.textContent = 'Duplicate Current...';
    dupBtn.addEventListener('click', () => this._saveConfigAs('Nom de la copie :', `${currentName} (copy)`));
    bottomActions.appendChild(dupBtn);

    this.content.appendChild(bottomActions);
  }

  async _saveConfigAs(promptMsg, defaultValue = '') {
    const raw = prompt(promptMsg, defaultValue);
    const name = raw?.trim();
    if (!name || !this.tabManager) return;
    const data = this.tabManager.serialize();
    await window.api.config.save(name, data);
    this.tabManager.currentConfigName = name;
    this.renderConfigs();
  }

}
