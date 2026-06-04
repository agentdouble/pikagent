/**
 * Editor section renderer for SettingsModal.
 */
import { _el } from '../utils/dom-api.js';
import { createSettingsSection } from '../utils/settings-section-builder.js';
import { registerComponent } from '../utils/component-registry.js';
import {
  setEditAgentsOnDoubleClick,
  shouldEditAgentsOnDoubleClick,
} from '../utils/agents-editor-settings.js';

function createToggle(checked, onChange) {
  const input = _el('input', {
    className: 'editor-setting-toggle-input',
    type: 'checkbox',
    checked,
    ariaLabel: 'Double-click AGENTS.md to edit',
  });

  input.addEventListener('change', () => onChange(input.checked));

  return _el('label', 'editor-setting-toggle',
    input,
    _el('span', 'editor-setting-toggle-track',
      _el('span', 'editor-setting-toggle-thumb'),
    ),
  );
}

function createAgentsDoubleClickRow(renderEditorSettingsFn) {
  const enabled = shouldEditAgentsOnDoubleClick();
  const toggle = createToggle(enabled, (checked) => {
    setEditAgentsOnDoubleClick(checked);
    renderEditorSettingsFn();
  });

  return _el('div', 'editor-setting-row',
    _el('div', 'editor-setting-copy',
      _el('div', 'editor-setting-title', 'Double-click AGENTS.md to edit'),
      _el('div', 'editor-setting-description', 'Open AGENTS.md in editable mode after a double-click from the file tree.'),
    ),
    toggle,
  );
}

function renderEditorSettings(contentEl, renderEditorSettingsFn) {
  createSettingsSection(contentEl, {
    heading: 'Editor',
    content: [
      createAgentsDoubleClickRow(renderEditorSettingsFn),
    ],
  });
}

registerComponent('renderEditorSettings', renderEditorSettings);
