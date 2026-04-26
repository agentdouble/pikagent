import { formatCombo, eventToCombo } from '../utils/shortcut-helpers.js';
import { _el, createActionButton } from '../utils/settings-dom.js';
import { createModalOverlay } from '../utils/dom-dialogs.js';
import { MODAL_CLOSE_TRANSITION_MS, MODIFIER_KEYS, NAV_SECTIONS } from '../utils/settings-helpers.js';
import { getComponent } from '../utils/component-registry.js';

export class SettingsModal {
  constructor(shortcutManager) {
    this.shortcutManager = shortcutManager;
    this.tabManager = null; // Set externally
    this.overlay = null;
    this.recording = null; // { actionId, index, el }
    this.activeSection = 'keybindings';
    this._updateUnsub = null;
    this.sectionRenderers = {
      keybindings: () => this._renderKeybindings(),
      appearance: () => this._renderAppearance(),
      configs: () => this._renderConfigs(),
      update: () => this._renderUpdate(),
    };
    this.build();
  }

  // ===== Build =====

  build() {
    const { overlay, modal } = createModalOverlay('settings-overlay', 'settings-modal', () => this.close());
    this.overlay = overlay;
    this.modal = modal;

    this.modal.appendChild(this._buildHeader());
    this.modal.appendChild(this._buildBody());

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
    const closeBtn = createActionButton({ text: '×', cls: 'settings-close-btn', onClick: () => this.close() });
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

  // ===== Delegated section renderers =====

  _renderAppearance() {
    getComponent('renderAppearance')(
      this.content,
      this.tabManager,
      () => this._renderAppearance(),
    );
  }

  _renderKeybindings() {
    getComponent('renderKeybindings')(
      this.content,
      this.shortcutManager,
      (actionId, index, badgeEl) => this.startRecording(actionId, index, badgeEl),
      () => this._renderKeybindings(),
    );
  }

  _renderConfigs() {
    getComponent('renderConfigs')(
      this.content,
      this.tabManager,
      () => this._renderConfigs(),
    );
  }

  _renderUpdate() {
    getComponent('renderUpdate')(this.content);
  }

  // ===== Recording (keybinding capture) =====

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

    this._renderKeybindings();
  }

  cancelRecording() {
    if (this.recording) {
      this.recording.el.classList.remove('recording');
      this.recording = null;
      this._renderKeybindings();
    }
  }
}
