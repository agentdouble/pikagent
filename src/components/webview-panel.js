import { _el } from '../utils/dom.js';
import { setupKeyboardShortcuts } from '../utils/keyboard-helpers.js';
import { trackMouse } from '../utils/drag-helpers.js';
import {
  MAX_LOGS,
  WEBVIEW_NAV_ACTIONS,
  CONSOLE_ICONS,
  resolveLogLevel,
  formatBadgeText,
  formatLogTime,
  shortenSource,
  normalizeUrl,
  clampConsoleHeight,
  shortLevelLabel,
} from '../utils/webview-helpers.js';
import { registerComponent } from '../utils/component-registry.js';

export class WebviewInstance {
  constructor(container, url) {
    this.container = container;
    this.url = url;
    this.disposed = false;
    this._consoleOpen = false;
    this._mobileMode = false;
    this._logs = [];
    this._build();
  }

  _build() {
    this.navBar = this._buildNavBar();
    this._webviewWrapper = this._buildWebview();
    this._consolePanel = this._buildConsolePanel();
    this.container.append(this.navBar, this._webviewWrapper, this._consolePanel);
  }

  _buildNavBar() {
    const nav = _el('div', 'webview-nav');

    for (const { text, title, method } of WEBVIEW_NAV_ACTIONS) {
      const btn = _el('button', 'webview-nav-btn', { textContent: text, title });
      btn.addEventListener('click', () => { try { this.webview[method](); } catch {} });
      nav.appendChild(btn);
    }

    this.urlInput = _el('input', 'webview-url-input');
    this.urlInput.type = 'text';
    this.urlInput.value = this.url;
    this.urlInput.spellcheck = false;
    setupKeyboardShortcuts(this.urlInput, {
      onEnter: (e) => {
        e.preventDefault();
        this.navigate(this.urlInput.value.trim());
      },
    });

    this._mobileBtn = _el('button', 'webview-nav-btn', { textContent: '\u{1F4F1}', title: 'Mobile view' });
    this._mobileBtn.addEventListener('click', () => this.toggleMobile());

    const openExtBtn = _el('button', 'webview-nav-btn', { textContent: '\u2197', title: 'Open in browser' });
    openExtBtn.addEventListener('click', () => window.api.shell.openExternal(this.url));

    this.consoleToggle = _el('button', 'webview-nav-btn', { textContent: CONSOLE_ICONS.closed, title: 'Toggle console' });
    this.consoleToggle.addEventListener('click', () => this.toggleConsole());

    nav.append(this.urlInput, this._mobileBtn, openExtBtn, this.consoleToggle);
    return nav;
  }

  _buildWebview() {
    this.webview = document.createElement('webview');
    this.webview.className = 'webview-frame';
    this.webview.src = this.url;
    this.webview.setAttribute('allowpopups', '');

    this.webview.addEventListener('did-navigate', (e) => {
      this.url = e.url;
      this.urlInput.value = e.url;
    });

    this.webview.addEventListener('did-navigate-in-page', (e) => {
      if (e.isMainFrame) {
        this.url = e.url;
        this.urlInput.value = e.url;
      }
    });

    this.webview.addEventListener('console-message', (e) => {
      this._addLog(e.level, e.message, e.sourceId, e.line);
    });

    const wrapper = _el('div', 'webview-wrapper');
    wrapper.appendChild(this.webview);
    return wrapper;
  }

  _buildConsolePanel() {
    const panel = _el('div', 'webview-console');
    panel.style.display = 'none';

    const toolbar = _el('div', 'webview-console-toolbar');
    this._consoleBadge = _el('span', 'webview-console-badge');
    this._consoleBadge.style.display = 'none';

    const clearBtn = _el('button', 'webview-console-clear', { textContent: '\u2298', title: 'Clear console' });
    clearBtn.addEventListener('click', () => this.clearConsole());
    toolbar.append(_el('span', 'webview-console-title', 'Console'), this._consoleBadge, clearBtn);

    this._consoleList = _el('div', 'webview-console-list');

    this._consoleHandle = _el('div', 'webview-console-handle');
    this._setupConsoleResize();

    panel.append(this._consoleHandle, toolbar, this._consoleList);
    return panel;
  }

  _addLog(level, message, source, line) {
    const entry = { level: resolveLogLevel(level), message, source, line, time: new Date() };
    this._logs.push(entry);
    if (this._logs.length > MAX_LOGS) this._logs.shift();

    // Update badge count when console is closed
    if (!this._consoleOpen) {
      const count = this._logs.length;
      this._consoleBadge.textContent = formatBadgeText(count);
      this._consoleBadge.style.display = count > 0 ? '' : 'none';
    }

    // Append to list if console is open
    if (this._consoleOpen) {
      this._appendLogEl(entry);
      this._consoleList.scrollTop = this._consoleList.scrollHeight;
    }
  }

  _appendLogEl(entry) {
    const row = _el('div', `webview-log webview-log-${entry.level}`);

    const time = _el('span', 'webview-log-time', formatLogTime(entry.time));
    const level = _el('span', `webview-log-level webview-log-level-${entry.level}`, shortLevelLabel(entry.level));
    const msg = _el('span', 'webview-log-msg', entry.message);

    row.append(time, level, msg);

    if (entry.source) {
      row.appendChild(_el('span', 'webview-log-source', `${shortenSource(entry.source)}:${entry.line}`));
    }

    this._consoleList.appendChild(row);
  }

  toggleConsole() {
    this._consoleOpen = !this._consoleOpen;
    this._consolePanel.style.display = this._consoleOpen ? '' : 'none';
    this.consoleToggle.textContent = this._consoleOpen ? CONSOLE_ICONS.open : CONSOLE_ICONS.closed;
    this.consoleToggle.classList.toggle('active', this._consoleOpen);

    if (this._consoleOpen) {
      // Render all logs
      this._consoleList.replaceChildren();
      for (const entry of this._logs) this._appendLogEl(entry);
      this._consoleList.scrollTop = this._consoleList.scrollHeight;
      this._consoleBadge.style.display = 'none';
    }
  }

  clearConsole() {
    this._logs = [];
    this._consoleList.replaceChildren();
    this._consoleBadge.style.display = 'none';
  }

  toggleMobile() {
    this._mobileMode = !this._mobileMode;
    this._mobileBtn.classList.toggle('active', this._mobileMode);
    this._webviewWrapper.classList.toggle('mobile', this._mobileMode);
    this.webview.classList.toggle('mobile', this._mobileMode);
  }

  _setupConsoleResize() {
    let startY = 0;
    let startHeight = 0;

    this._consoleHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = this._consolePanel.getBoundingClientRect().height;
      trackMouse('row-resize',
        (ev) => { this._consolePanel.style.height = `${clampConsoleHeight(startHeight, startY - ev.clientY)}px`; },
        () => {},
      );
    });
  }

  navigate(raw) {
    const url = normalizeUrl(raw);
    this.url = url;
    this.webview.src = url;
    this.urlInput.value = url;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.container.replaceChildren();
  }
}

registerComponent('WebviewInstance', WebviewInstance);
