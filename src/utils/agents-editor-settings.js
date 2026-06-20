import { persistedSetting } from './persisted-setting.js';

const ENABLED = 'enabled';
const DISABLED = 'disabled';

export const AGENTS_DOUBLE_CLICK_EDIT_KEY = 'pikagent-agents-double-click-edit';

const doubleClickEditSetting = persistedSetting(AGENTS_DOUBLE_CLICK_EDIT_KEY, ENABLED);

function basename(filePath) {
  return String(filePath || '').split(/[\\/]/).pop();
}

export function isAgentsMarkdownFile(file) {
  if (!file) return false;
  const name = typeof file === 'string' ? basename(file) : (file.name || basename(file.path));
  return name === 'AGENTS.md';
}

export function shouldEditAgentsOnDoubleClick() {
  return doubleClickEditSetting.get() !== DISABLED;
}

export function setEditAgentsOnDoubleClick(enabled) {
  doubleClickEditSetting.set(enabled ? ENABLED : DISABLED);
}
