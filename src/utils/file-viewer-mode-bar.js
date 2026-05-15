/**
 * Mode-bar rendering helper for FileViewer.
 * Extracted from file-viewer.js to reduce component size.
 */

import { buildTabButton, renderList } from './dom.js';
import { STATIC_MODES } from './editor-helpers.js';

/**
 * Rebuild the mode bar with static mode buttons and webview tabs.
 *
 * @param {HTMLElement} modeBar - the mode bar container element
 * @param {string} currentMode - the currently active mode key
 * @param {{ switchMode: (mode: string) => void }} callbacks
 * @param {{ webviewTabs: Array<{ id: string, label: string, url: string }>, buildWebviewModeBtn: (wt: { id: string, label: string, url: string }, currentMode: string) => HTMLElement, buildAddWebviewBtn: (modeBar: HTMLElement) => HTMLElement }} webviewMgr
 */
export function renderModeBar(modeBar, currentMode, { switchMode }, webviewMgr) {
  const allItems = [
    ...STATIC_MODES.map(({ key, label }) => buildTabButton(
      { id: key, label },
      { activeId: currentMode, onSelect: switchMode, itemClass: 'mode-btn', activeClass: 'active' },
    )),
    ...webviewMgr.webviewTabs.map(wt => webviewMgr.buildWebviewModeBtn(wt, currentMode)),
    webviewMgr.buildAddWebviewBtn(modeBar),
  ];
  renderList(modeBar, allItems, (item) => item);
}
