/**
 * Appearance section renderer for SettingsModal.
 * Extracted from settings-modal.js to reduce component size.
 */
import { TERMINAL_THEMES, getTerminalThemeName, setTerminalTheme, getTerminalTheme, switchTerminalForMode } from '../utils/terminal-themes.js';
import { getAppTheme, setAppTheme } from '../utils/app-theme.js';
import { _el, createActionButton } from '../utils/dom.js';
import { MODE_BUTTONS, THEME_PREVIEW_LINES, COLOR_DOT_KEYS } from '../utils/settings-helpers.js';
import { createSettingsSection } from '../utils/settings-section-builder.js';
import { registerComponent } from '../utils/component-registry.js';

/**
 * Apply the current terminal theme to all terminal panels across tabs.
 * @param {Object|null} tabManager
 */
export function applyThemeToTerminals(tabManager) {
  if (!tabManager) return;
  const theme = getTerminalTheme();
  for (const [, tab] of tabManager.tabs) {
    if (tab.terminalPanel) tab.terminalPanel.applyTheme(theme);
  }
}

function _createThemePreviewLine(segments, theme) {
  const line = _el('div', 'theme-preview-line');
  for (const { text, colorKey } of segments) {
    const span = _el('span', null, text);
    span.style.color = theme[colorKey];
    line.appendChild(span);
  }
  return line;
}

function _createThemeCard(name, theme, isActive, tabManager, renderAppearanceFn) {
  const card = _el('div', 'theme-card');
  if (isActive) card.classList.add('theme-active');

  // Preview block
  const preview = _el('div', 'theme-preview');
  preview.style.background = theme.background;

  for (const segments of THEME_PREVIEW_LINES) {
    preview.appendChild(_createThemePreviewLine(segments, theme));
  }

  // Color dots
  const dots = _el('div', 'theme-preview-dots');
  for (const key of COLOR_DOT_KEYS) {
    const dot = _el('span', 'theme-dot');
    dot.style.background = theme[key];
    dots.appendChild(dot);
  }
  preview.appendChild(dots);

  card.appendChild(preview);
  card.appendChild(_el('div', 'theme-card-label', name));

  card.addEventListener('click', () => {
    setTerminalTheme(name);
    applyThemeToTerminals(tabManager);
    renderAppearanceFn();
  });

  return card;
}

/**
 * Render the Appearance section into the given content element.
 * @param {HTMLElement} contentEl - the settings content container
 * @param {Object|null} tabManager
 * @param {function} renderAppearanceFn - callback to re-render this section
 */
export function renderAppearance(contentEl, tabManager, renderAppearanceFn) {
  // Day/Night mode toggle
  const modeRow = _el('div', 'theme-mode-row');
  modeRow.appendChild(_el('span', 'theme-mode-label', 'Mode'));

  const modeToggle = _el('div', 'theme-mode-toggle');
  const currentMode = getAppTheme();

  for (const { mode, label } of MODE_BUTTONS) {
    const btn = createActionButton({
      text: label,
      cls: 'theme-mode-btn',
      onClick: () => {
        setAppTheme(mode);
        if (switchTerminalForMode(mode)) applyThemeToTerminals(tabManager);
        renderAppearanceFn();
      },
    });
    if (currentMode === mode) btn.classList.add('active');
    modeToggle.appendChild(btn);
  }

  modeRow.appendChild(modeToggle);

  // Terminal theme grid
  const subHeading = _el('h4', 'theme-sub-heading', 'Terminal Theme');

  const currentThemeName = getTerminalThemeName();
  const grid = _el('div', 'theme-grid');
  for (const [name, theme] of Object.entries(TERMINAL_THEMES)) {
    grid.appendChild(_createThemeCard(name, theme, name === currentThemeName, tabManager, renderAppearanceFn));
  }

  createSettingsSection(contentEl, {
    heading: 'Appearance',
    content: [modeRow, subHeading, grid],
  });
}

registerComponent('renderAppearance', renderAppearance);
