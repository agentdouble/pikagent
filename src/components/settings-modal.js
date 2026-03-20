import { ShortcutManager } from './shortcuts.js';

export class SettingsModal {
  constructor(shortcutManager) {
    this.shortcutManager = shortcutManager;
    this.overlay = null;
    this.recording = null; // { actionId, index, el }
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

    const navItem = document.createElement('div');
    navItem.className = 'settings-nav-item active';
    navItem.textContent = 'Keyboard Shortcuts';
    nav.appendChild(navItem);

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

  open() {
    this.renderKeybindings();
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
}
