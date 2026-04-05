/**
 * Keybindings section renderer for SettingsModal.
 * Extracted from settings-modal.js to reduce component size.
 */
import { formatCombo } from '../utils/shortcut-helpers.js';
import { _el } from '../utils/dom.js';
import { createSettingsSection } from '../utils/settings-section-builder.js';

/**
 * Create a key badge element for a binding at a given index.
 * @param {Object} binding - { id, label, keys }
 * @param {number} index
 * @param {Object} shortcutManager
 * @param {function} startRecordingFn - (actionId, index, badgeEl) => void
 * @param {function} renderKeybindingsFn - callback to re-render
 * @returns {HTMLElement}
 */
export function createKeyBadge(binding, index, shortcutManager, startRecordingFn, renderKeybindingsFn) {
  const wrapper = _el('div', 'keybinding-badge-wrapper');

  const badge = _el('span', 'keybinding-badge');
  badge.textContent = binding.keys[index]
    ? formatCombo(binding.keys[index])
    : 'Not set';
  if (!binding.keys[index]) badge.classList.add('unset');

  badge.addEventListener('click', () => {
    startRecordingFn(binding.id, index, badge);
  });

  const removeBtn = _el('span', 'keybinding-badge-remove', '×');
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    binding.keys.splice(index, 1);
    shortcutManager.updateBinding(binding.id, binding.keys);
    renderKeybindingsFn();
  });

  wrapper.appendChild(badge);
  if (binding.keys.length > 1) wrapper.appendChild(removeBtn);

  return wrapper;
}

/**
 * Render the Keybindings section into the given content element.
 * @param {HTMLElement} contentEl - the settings content container
 * @param {Object} shortcutManager
 * @param {function} startRecordingFn
 * @param {function} renderKeybindingsFn - callback to re-render
 */
export function renderKeybindings(contentEl, shortcutManager, startRecordingFn, renderKeybindingsFn) {
  const resetBtn = _el('button', 'settings-reset-btn', 'Reset to defaults');
  resetBtn.addEventListener('click', () => {
    shortcutManager.resetToDefaults();
    renderKeybindingsFn();
  });

  const list = _el('div', 'keybinding-list');

  for (const binding of shortcutManager.getBindingsList()) {
    const row = _el('div', 'keybinding-row');
    row.appendChild(_el('div', 'keybinding-label', binding.label));

    const keysContainer = _el('div', 'keybinding-keys');
    for (let i = 0; i < binding.keys.length; i++) {
      keysContainer.appendChild(createKeyBadge(binding, i, shortcutManager, startRecordingFn, renderKeybindingsFn));
    }

    const addBtn = _el('button', 'keybinding-add-btn', '+');
    addBtn.title = 'Add keybinding';
    addBtn.addEventListener('click', () => {
      binding.keys.push('');
      shortcutManager.updateBinding(binding.id, binding.keys);
      renderKeybindingsFn();
    });
    keysContainer.appendChild(addBtn);

    row.appendChild(keysContainer);
    list.appendChild(row);
  }

  createSettingsSection(contentEl, {
    heading: 'Keyboard Shortcuts',
    actions: [resetBtn],
    content: [list],
  });
}
