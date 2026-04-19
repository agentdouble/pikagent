// Component manifest — centralizes all side-effect imports that register
// components in the component registry.
// Sub-components must be registered before their parents resolve them.

import './config-manager.js';
import './terminal-panel.js';
import './file-tree.js';
import './diff-viewer.js';
import './git-changes-view.js';
import './webview-panel.js';
import './file-viewer-webview.js';
import './file-viewer.js';
import './board-view.js';
import './flow-card-terminal.js';
import './flow-modal.js';
import './flow-view.js';
import './usage-view.js';
import './skills-view.js';
import './settings-appearance.js';
import './settings-keybindings.js';
import './settings-configs.js';
import './settings-update.js';
