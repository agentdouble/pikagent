/**
 * Mode-bar rendering helper for FileViewer.
 * Extracted from file-viewer.js to reduce component size.
 */

import { _el } from './dom.js';
import { STATIC_MODES } from './editor-helpers.js';

/**
 * Rebuild the mode bar with static mode buttons and webview tabs.
 *
 * @param {HTMLElement} modeBar - the mode bar container element
 * @param {string} currentMode - the currently active mode key
 * @param {{ switchMode: (mode: string) => void }} callbacks
 * @param {{ webviewTabs: Array, buildWebviewModeBtn: Function, buildAddWebviewBtn: Function }} webviewMgr
 */
export function renderModeBar(modeBar, currentMode, { switchMode }, webviewMgr) {
  modeBar.replaceChildren();
  for (const { key, label } of STATIC_MODES) {
    const btn = _el('button', `mode-btn${currentMode === key ? ' active' : ''}`, label);
    btn.addEventListener('click', () => switchMode(key));
    modeBar.appendChild(btn);
  }
  for (const wt of webviewMgr.webviewTabs) {
    modeBar.appendChild(webviewMgr.buildWebviewModeBtn(wt, currentMode));
  }
  modeBar.appendChild(webviewMgr.buildAddWebviewBtn(modeBar));
}
