/**
 * Workspace Resize — extracted from workspace-layout.js.
 *
 * Handles panel resize interactions and panel toggle (collapse/expand).
 *
 * @typedef {{ getActiveTab: () => import('./tab-types.js').WorkspaceTab|null, scheduleAutoSave: () => void }} PanelInteractionDeps
 */

import { _el } from './workspace-dom.js';
import { trackMouse } from './drag-helpers.js';
import { PANEL_MIN_WIDTH, FIT_DELAY_MS, WORKSPACE_PANELS } from './tab-constants.js';
import { clampPanelWidth, panelArrowState } from './tab-manager-helpers.js';

// ── Panel building ──

/**
 * Build a collapsible side panel (left or right).
 * @param {PanelInteractionDeps} deps
 * @param {{ side: string, contentCls: string, title?: string }} panelDef
 */
export function buildSidePanel(deps, { side, contentCls, title }) {
  const panel = _el('div', `panel panel-${side}`);
  if (title) {
    const header = _el('div', 'panel-header');
    header.appendChild(_el('span', 'panel-title', title));
    panel.appendChild(header);
  }
  const content = _el('div', contentCls);
  panel.appendChild(content);
  const handle = _el('div', 'panel-resize-handle');
  setupPanelResize(deps, handle, panel, side);
  return { panel, handle, content };
}

/**
 * Build the center panel with path info, branch badge, and terminal area.
 * @param {PanelInteractionDeps} deps
 * @param {import('./tab-types.js').WorkspaceTab} tab
 * @param {HTMLElement} leftPanel
 * @param {HTMLElement} rightPanel
 */
export function buildCenterPanel(deps, tab, leftPanel, rightPanel) {
  const panel = _el('div', 'panel panel-center');
  const header = _el('div', 'panel-header');

  const pathInfo = _el('div', 'path-info');

  const pathArrowLeft = _el('span', 'path-arrow', '\u2190');
  pathArrowLeft.title = 'Collapse left panel';
  pathArrowLeft.addEventListener('click', () => togglePanel(deps, leftPanel, 'left', pathArrowLeft));

  const pathText = _el('span', 'path-text', tab.cwd);
  const branchBadge = _el('span', 'branch-badge', '');

  const pathArrowRight = _el('span', 'path-arrow', '\u2192');
  pathArrowRight.title = 'Collapse right panel';
  pathArrowRight.addEventListener('click', () => togglePanel(deps, rightPanel, 'right', pathArrowRight));

  pathInfo.append(pathArrowLeft, pathText, branchBadge, pathArrowRight);
  header.appendChild(pathInfo);
  panel.appendChild(header);

  const termContainer = _el('div', 'terminal-area');
  panel.appendChild(termContainer);

  tab.pathTextEl = pathText;
  tab.branchBadgeEl = branchBadge;

  return { panel, termContainer };
}

// ── Panel resize / toggle ──

/**
 * Attach mousedown resize handler to a panel handle.
 * @param {PanelInteractionDeps} deps
 * @param {HTMLElement} handle
 * @param {HTMLElement} panel
 * @param {string} side
 */
function setupPanelResize({ getActiveTab, scheduleAutoSave }, handle, panel, side) {
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    trackMouse('col-resize',
      (ev) => {
        const dx = ev.clientX - startX;
        const newWidth = side === 'left' ? startWidth + dx : startWidth - dx;
        panel.style.width = `${clampPanelWidth(newWidth, side)}px`;
        panel.style.flex = 'none';
        getActiveTab()?.terminalPanel?.fitAll();
      },
      () => scheduleAutoSave(),
    );
  });
}

/**
 * Toggle a panel's collapsed state and re-fit terminals.
 * @param {PanelInteractionDeps} deps
 * @param {HTMLElement} panel
 * @param {string} side
 * @param {HTMLElement} [arrowEl]
 */
function togglePanel({ getActiveTab, scheduleAutoSave }, panel, side, arrowEl) {
  panel.classList.add('animating');
  panel.classList.toggle('collapsed');
  const isCollapsed = panel.classList.contains('collapsed');

  if (arrowEl) {
    const arrow = panelArrowState(side, isCollapsed);
    arrowEl.textContent = arrow.text;
    arrowEl.title = arrow.title;
  }

  setTimeout(() => {
    panel.classList.remove('animating');
    getActiveTab()?.terminalPanel?.fitAll();
  }, FIT_DELAY_MS);
  scheduleAutoSave();
}

// ── Panel width capture / restore ──

/**
 * Snapshot current panel widths and collapsed state into `tab._panelWidths`.
 * @param {import('./tab-types.js').WorkspaceTab} tab
 */
export function capturePanelWidths(tab) {
  if (!tab.layoutElement) return;
  tab._panelWidths = {};
  for (const { side, widthKey, collapsedKey } of WORKSPACE_PANELS) {
    const el = tab.layoutElement.querySelector(`.panel-${side}`);
    if (!el) continue;
    tab._panelWidths[widthKey] = el.getBoundingClientRect().width;
    tab._panelWidths[collapsedKey] = el.classList.contains('collapsed');
  }
}

/**
 * Restore panel widths and collapsed state from a saved config.
 * @param {{ [widthKey: string]: number, [collapsedKey: string]: boolean }} panels - Saved panel size data
 * @param {{ left?: HTMLElement, right?: HTMLElement }} panelEls - Panel DOM elements
 */
export function restorePanelSizes(panels, panelEls) {
  if (!panels) return;
  for (const { widthKey, collapsedKey, side } of WORKSPACE_PANELS) {
    const el = panelEls[side];
    if (!el) continue;
    if (panels[widthKey] && !panels[collapsedKey]) {
      el.style.width = `${panels[widthKey]}px`;
      el.style.flex = 'none';
    }
    if (panels[collapsedKey]) el.classList.add('collapsed');
  }
}
