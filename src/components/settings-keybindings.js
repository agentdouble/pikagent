/**
 * Keybindings section renderer for SettingsModal.
 * Extracted from settings-modal.js to reduce component size.
 */
import { formatCombo } from '../utils/shortcut-helpers.js';
import { _el, createActionButton } from '../utils/dom.js';
import { onClickStopped } from '../utils/event-helpers.js';
import { createSettingsSection } from '../utils/settings-section-builder.js';
import { registerComponent } from '../utils/component-registry.js';

/**
 * Create a key badge element for a binding at a given index.
 * @param {{ id: string, label: string, keys: string[] }} binding
 * @param {number} index
 * @param {{ updateBinding: (id: string, keys: string[]) => void, getBindingsList: () => Array<{ id: string, label: string, keys: string[] }>, resetToDefaults: () => void }} shortcutManager
 * @param {(actionId: string, index: number, badgeEl: HTMLElement) => void} startRecordingFn
 * @param {() => void} renderKeybindingsFn - callback to re-render
 * @returns {HTMLElement}
 */
function createKeyBadge(binding, index, shortcutManager, startRecordingFn, renderKeybindingsFn) {
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
  onClickStopped(removeBtn, () => {
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
 * @param {{ updateBinding: (id: string, keys: string[]) => void, getBindingsList: () => Array<{ id: string, label: string, keys: string[] }>, resetToDefaults: () => void }} shortcutManager
 * @param {(actionId: string, index: number, badgeEl: HTMLElement) => void} startRecordingFn
 * @param {() => void} renderKeybindingsFn - callback to re-render
 */
export function renderKeybindings(contentEl, shortcutManager, startRecordingFn, renderKeybindingsFn) {
  const resetBtn = createActionButton({
    text: 'Reset to defaults',
    cls: 'settings-reset-btn',
    onClick: () => {
      shortcutManager.resetToDefaults();
      renderKeybindingsFn();
    },
  });

  const list = _el('div', 'keybinding-list');

  for (const binding of shortcutManager.getBindingsList()) {
    const row = _el('div', 'keybinding-row');
    row.appendChild(_el('div', 'keybinding-label', binding.label));

    const keysContainer = _el('div', 'keybinding-keys');
    for (let i = 0; i < binding.keys.length; i++) {
      keysContainer.appendChild(createKeyBadge(binding, i, shortcutManager, startRecordingFn, renderKeybindingsFn));
    }

    const addBtn = createActionButton({
      text: '+',
      title: 'Add keybinding',
      cls: 'keybinding-add-btn',
      onClick: () => {
        binding.keys.push('');
        shortcutManager.updateBinding(binding.id, binding.keys);
        renderKeybindingsFn();
      },
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

registerComponent('renderKeybindings', renderKeybindings);
