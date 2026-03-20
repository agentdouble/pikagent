import { ShortcutManager } from './shortcuts.js';

export class SettingsModal {
  constructor(shortcutManager) {
    this.shortcutManager = shortcutManager;
    this.tabManager = null; // Set externally
    this.overlay = null;
    this.recording = null; // { actionId, index, el }
    this.activeSection = 'keybindings';
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

    const navKeybindings = document.createElement('div');
    navKeybindings.className = 'settings-nav-item active';
    navKeybindings.textContent = 'Keyboard Shortcuts';
    navKeybindings.addEventListener('click', () => this.showSection('keybindings'));
    nav.appendChild(navKeybindings);

    const navConfigs = document.createElement('div');
    navConfigs.className = 'settings-nav-item';
    navConfigs.textContent = 'Workspace Configs';
    navConfigs.addEventListener('click', () => this.showSection('configs'));
    nav.appendChild(navConfigs);

    this.navItems = { keybindings: navKeybindings, configs: navConfigs };

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

      // Ignore lone modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

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
    // Update nav active state
    for (const [key, el] of Object.entries(this.navItems)) {
      el.classList.toggle('active', key === section);
    }
    if (section === 'keybindings') {
      this.renderKeybindings();
    } else if (section === 'configs') {
      this.renderConfigs();
    }
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
    }, 200);
  }

  renderKeybindings() {
    this.content.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'settings-section-header';

    const headingTitle = document.createElement('h3');
    headingTitle.textContent = 'Keyboard Shortcuts';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'settings-reset-btn';
    resetBtn.textContent = 'Reset to defaults';
    resetBtn.addEventListener('click', () => {
      this.shortcutManager.resetToDefaults();
      this.renderKeybindings();
    });

    heading.appendChild(headingTitle);
    heading.appendChild(resetBtn);
    this.content.appendChild(heading);

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
        const newIndex = binding.keys.length;
        binding.keys.push('');
        this.shortcutManager.updateBinding(binding.id, binding.keys);
        this.renderKeybindings();
        // Auto-start recording on the new empty slot
        const rows = list.querySelectorAll('.keybinding-row');
        // Re-render will handle it
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
    this.content.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'settings-section-header';

    const headingTitle = document.createElement('h3');
    headingTitle.textContent = 'Workspace Configs';
    heading.appendChild(headingTitle);
    this.content.appendChild(heading);

    // Save current workspace form
    const saveForm = document.createElement('div');
    saveForm.className = 'config-save-form';

    const saveInput = document.createElement('input');
    saveInput.className = 'config-name-input';
    saveInput.type = 'text';
    saveInput.placeholder = 'Config name...';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'config-save-btn';
    saveBtn.textContent = 'Save Current';
    saveBtn.addEventListener('click', async () => {
      const name = saveInput.value.trim();
      if (!name) return;
      if (!this.tabManager) return;
      const data = this.tabManager.serialize();
      await window.api.config.save(name, data);
      saveInput.value = '';
      this.renderConfigs();
    });

    saveForm.appendChild(saveInput);
    saveForm.appendChild(saveBtn);
    this.content.appendChild(saveForm);

    // Config list
    const configs = await window.api.config.list();
    const defaultName = await window.api.config.getDefault();

    if (configs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'config-empty';
      empty.textContent = 'No saved configs yet. Save your current workspace layout above.';
      this.content.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'config-list';

    for (const config of configs) {
      const row = document.createElement('div');
      row.className = 'config-row';
      if (config.isDefault) row.classList.add('config-default');

      const info = document.createElement('div');
      info.className = 'config-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'config-name';
      nameEl.textContent = config.name;

      const meta = document.createElement('span');
      meta.className = 'config-meta';
      const tabCount = config.tabCount || 0;
      const date = config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : '';
      meta.textContent = `${tabCount} tab${tabCount !== 1 ? 's' : ''} · ${date}`;

      info.appendChild(nameEl);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'config-actions';

      // Default toggle
      const defaultBtn = document.createElement('button');
      defaultBtn.className = 'config-action-btn';
      if (config.isDefault) {
        defaultBtn.classList.add('config-is-default');
        defaultBtn.textContent = 'Default';
        defaultBtn.title = 'This is the default config';
      } else {
        defaultBtn.textContent = 'Set Default';
        defaultBtn.title = 'Set as default config (auto-loaded on startup)';
      }
      defaultBtn.addEventListener('click', async () => {
        await window.api.config.setDefault(config.name);
        this.renderConfigs();
      });

      // Load button
      const loadBtn = document.createElement('button');
      loadBtn.className = 'config-action-btn config-load-btn';
      loadBtn.textContent = 'Load';
      loadBtn.title = 'Load this config now';
      loadBtn.addEventListener('click', async () => {
        const data = await window.api.config.load(config.name);
        if (data && this.tabManager) {
          await this.tabManager.restoreConfig(data);
          this.close();
        }
      });

      // Overwrite button
      const overwriteBtn = document.createElement('button');
      overwriteBtn.className = 'config-action-btn config-overwrite-btn';
      overwriteBtn.textContent = 'Overwrite';
      overwriteBtn.title = 'Overwrite with current workspace';
      overwriteBtn.addEventListener('click', async () => {
        if (!this.tabManager) return;
        const data = this.tabManager.serialize();
        await window.api.config.save(config.name, data);
        this.renderConfigs();
      });

      // Duplicate button
      const dupBtn = document.createElement('button');
      dupBtn.className = 'config-action-btn config-dup-btn';
      dupBtn.textContent = 'Duplicate';
      dupBtn.title = 'Duplicate this config';
      dupBtn.addEventListener('click', async () => {
        const data = await window.api.config.load(config.name);
        if (data) {
          const newName = `${config.name} (copy)`;
          await window.api.config.save(newName, { tabs: data.tabs, activeTabIndex: data.activeTabIndex });
          this.renderConfigs();
        }
      });

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'config-action-btn config-delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        await window.api.config.delete(config.name);
        this.renderConfigs();
      });

      actions.appendChild(defaultBtn);
      actions.appendChild(loadBtn);
      actions.appendChild(dupBtn);
      actions.appendChild(overwriteBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(info);
      row.appendChild(actions);
      list.appendChild(row);
    }

    this.content.appendChild(list);
  }
}
