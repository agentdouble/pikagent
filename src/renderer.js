import hljs from 'highlight.js';
import { TabManager } from './components/tab-manager.js';
import { ShortcutManager } from './components/shortcuts.js';
import { SettingsModal } from './components/settings-modal.js';

// Expose hljs globally for file-viewer
window.hljs = hljs;

document.addEventListener('DOMContentLoaded', () => {
  const tabBar = document.getElementById('tab-bar');
  const workspace = document.getElementById('workspace');

  const tabManager = new TabManager(tabBar, workspace);
  const shortcuts = new ShortcutManager(tabManager);
  const settingsModal = new SettingsModal(shortcuts);

  // Wire settings open from shortcut manager and tab manager
  shortcuts.onOpenSettings = () => settingsModal.open();
  tabManager.onOpenSettings = () => settingsModal.open();
});
