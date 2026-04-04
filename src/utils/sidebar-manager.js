/**
 * Sidebar Manager — extracted from tab-manager.js.
 *
 * Handles activity-bar rendering, sidebar mode switching, and
 * side-view lifecycle (board, flow, usage).
 *
 * All methods receive or operate on a `ctx` (TabManager instance).
 */

import { getComponent } from './component-registry.js';
import { _el } from './dom.js';
import { ACTIVITY_BUTTONS, SIDE_VIEWS } from './tab-manager-helpers.js';

/**
 * Declarative map for sidebar view rendering — single source of truth for
 * component name (resolved via registry), constructor args, and post-reattach behavior.
 */
const SIDE_VIEW_RENDERERS = {
  board: {
    componentName: 'BoardView',
    ctorArgs: (ctx) => [ctx],
    onReattach: (ctx) => {
      for (const [, card] of ctx.boardView.cards) {
        try { card.fitAddon.fit(); } catch {}
      }
      ctx.boardView.resume();
    },
  },
  flow: {
    componentName: 'FlowView',
    ctorArgs: (ctx) => [ctx],
    onReattach: (ctx) => ctx.flowView.refresh(),
  },
  usage: {
    componentName: 'UsageView',
    ctorArgs: () => [],
    onReattach: (ctx) => ctx.usageView.refresh(),
  },
};

// ── Activity Bar ──

export function renderActivityBar(ctx) {
  const activityBar = document.getElementById('activity-bar');
  if (!activityBar) return;
  activityBar.replaceChildren();

  const topSection = _el('div', 'activity-bar-top');

  for (const { label, mode } of ACTIVITY_BUTTONS) {
    const btn = _el('button', 'activity-btn', label);
    if (ctx.sidebarMode === mode) btn.classList.add('active');
    btn.addEventListener('click', () => ctx.setSidebarMode(mode));
    topSection.appendChild(btn);
  }

  topSection.appendChild(_el('button', 'activity-btn', '\u2026'));
  activityBar.appendChild(topSection);

  // Bottom section with settings
  const bottomSection = _el('div', 'activity-bar-bottom');
  const settingsBtn = _el('button', 'activity-btn activity-btn-settings');
  settingsBtn.append(_el('span', 'activity-btn-icon', '\u2699'), 'Settings');
  settingsBtn.addEventListener('click', () => {
    if (ctx.onOpenSettings) ctx.onOpenSettings();
  });
  bottomSection.appendChild(settingsBtn);

  activityBar.appendChild(bottomSection);
}

// ── Side view rendering ──

/** Reattach or create a side-panel view (board, flow, usage). Returns true if reattached. */
export function renderSideView(ctx, viewKey, containerKey, ViewClass, ...ctorArgs) {
  ctx.workspaceContainer.replaceChildren();

  if (ctx[viewKey] && ctx[containerKey]) {
    ctx.workspaceContainer.appendChild(ctx[containerKey]);
    return true;
  }

  const container = _el('div');
  container.style.height = '100%';
  ctx.workspaceContainer.appendChild(container);
  ctx[containerKey] = container;
  ctx[viewKey] = new ViewClass(container, ...ctorArgs);
  return false;
}

/** Activate a side view by mode using SIDE_VIEW_RENDERERS config. */
export function activateSideView(ctx, mode) {
  const sideView = SIDE_VIEWS[mode];
  const renderer = SIDE_VIEW_RENDERERS[mode];
  if (!sideView || !renderer) return;
  const ViewClass = getComponent(renderer.componentName);
  const reattached = renderSideView(
    ctx, sideView.viewKey, sideView.containerKey,
    ViewClass, ...renderer.ctorArgs(ctx),
  );
  if (reattached) renderer.onReattach(ctx);
}

// ── Side view detach / disposal ──

export function detachSidebarView(ctx, mode) {
  if (mode === 'work') {
    const prev = ctx._activeTab();
    if (prev?.layoutElement) {
      ctx._capturePanelWidths(prev);
      prev.layoutElement.remove();
    }
    return;
  }
  const cfg = SIDE_VIEWS[mode];
  if (!cfg) return;
  if (cfg.pauseOnDetach) {
    ctx[cfg.viewKey]?.pause();
    ctx[cfg.containerKey]?.remove();
  } else {
    disposeSideView(ctx, mode);
  }
}

export function disposeSideView(ctx, mode) {
  const cfg = SIDE_VIEWS[mode];
  if (!cfg) return;
  if (ctx[cfg.viewKey]) {
    ctx[cfg.viewKey].dispose();
    ctx[cfg.viewKey] = null;
  }
  if (ctx[cfg.containerKey]) {
    ctx[cfg.containerKey].remove();
    ctx[cfg.containerKey] = null;
  }
}

export function disposeAllSideViews(ctx) {
  for (const mode of Object.keys(SIDE_VIEWS)) disposeSideView(ctx, mode);
}
