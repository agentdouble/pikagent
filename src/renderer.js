import hljs from 'highlight.js';
import { TabManager } from './components/tab-manager.js';
import { ShortcutManager } from './components/shortcuts.js';
import { SettingsModal } from './components/settings-modal.js';
import { applyAppTheme } from './utils/app-theme.js';

// Side-effect imports: register components in the component registry.
// Sub-components must be registered before their parents resolve them.
import './components/config-manager.js';
import './components/terminal-panel.js';
import './components/file-tree.js';
import './components/git-changes-view.js';
import './components/file-viewer-webview.js';
import './components/file-viewer.js';
import './components/board-view.js';
import './components/flow-card-terminal.js';
import './components/flow-modal.js';
import './components/flow-view.js';
import './components/usage-view.js';
import './components/settings-appearance.js';
import './components/settings-keybindings.js';
import './components/settings-configs.js';

// Expose hljs globally for file-viewer
window.hljs = hljs;

document.addEventListener('DOMContentLoaded', () => {
  // Apply saved day/night mode
  applyAppTheme();
  const tabBar = document.getElementById('tab-bar');
  const workspace = document.getElementById('workspace');

  const tabManager = new TabManager(tabBar, workspace);
  const shortcuts = new ShortcutManager(tabManager);
  const settingsModal = new SettingsModal(shortcuts);
  settingsModal.tabManager = tabManager;

  // Wire settings open from shortcut manager and tab manager
  shortcuts.onOpenSettings = () => settingsModal.open();
  tabManager.onOpenSettings = () => settingsModal.open();

  // Save on close as a safety net
  window.addEventListener('beforeunload', () => {
    shortcuts.dispose();
    tabManager.autoSave();
  });
});
