import { _el } from '../utils/dom.js';

const LOG_LEVELS = ['verbose', 'info', 'warn', 'error'];
const MAX_LOGS = 5000;

export class WebviewInstance {
  constructor(container, url) {
    this.container = container;
    this.url = url;
    this.disposed = false;
    this._consoleOpen = false;
    this._logs = [];
    this._build();
  }

  _build() {
    // Navigation bar
    this.navBar = _el('div', 'webview-nav');

    const backBtn = _el('button', 'webview-nav-btn', { textContent: '\u2190', title: 'Back' });
    backBtn.addEventListener('click', () => { try { this.webview.goBack(); } catch {} });

    const fwdBtn = _el('button', 'webview-nav-btn', { textContent: '\u2192', title: 'Forward' });
    fwdBtn.addEventListener('click', () => { try { this.webview.goForward(); } catch {} });

    const refreshBtn = _el('button', 'webview-nav-btn', { textContent: '\u21BB', title: 'Refresh' });
    refreshBtn.addEventListener('click', () => { try { this.webview.reload(); } catch {} });

    this.urlInput = _el('input', 'webview-url-input');
    this.urlInput.type = 'text';
    this.urlInput.value = this.url;
    this.urlInput.spellcheck = false;
    this.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.navigate(this.urlInput.value.trim());
      }
    });

    const openExtBtn = _el('button', 'webview-nav-btn', { textContent: '\u2197', title: 'Open in browser' });
    openExtBtn.addEventListener('click', () => {
      window.api.shell.openExternal(this.url);
    });

    this.consoleToggle = _el('button', 'webview-nav-btn', { textContent: '\u{25b6}', title: 'Toggle console' });
    this.consoleToggle.addEventListener('click', () => this.toggleConsole());

    this.navBar.append(backBtn, fwdBtn, refreshBtn, this.urlInput, openExtBtn, this.consoleToggle);

    // Webview element
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

    // Console log capture
    this.webview.addEventListener('console-message', (e) => {
      this._addLog(e.level, e.message, e.sourceId, e.line);
    });

    // Console panel
    this._consolePanel = _el('div', 'webview-console');
    this._consolePanel.style.display = 'none';

    // Console toolbar
    const consoleToolbar = _el('div', 'webview-console-toolbar');
    const consoleTitle = _el('span', 'webview-console-title', 'Console');

    this._consoleBadge = _el('span', 'webview-console-badge');
    this._consoleBadge.style.display = 'none';

    const clearBtn = _el('button', 'webview-console-clear', { textContent: '\u2298', title: 'Clear console' });
    clearBtn.addEventListener('click', () => this.clearConsole());

    consoleToolbar.append(consoleTitle, this._consoleBadge, clearBtn);

    // Console log list
    this._consoleList = _el('div', 'webview-console-list');

    // Resize handle between webview and console
    this._consoleHandle = _el('div', 'webview-console-handle');
    this._setupConsoleResize();

    this._consolePanel.append(this._consoleHandle, consoleToolbar, this._consoleList);

    this.container.append(this.navBar, this.webview, this._consolePanel);
  }

  _addLog(level, message, source, line) {
    const levelName = LOG_LEVELS[level] || 'info';
    const entry = { level: levelName, message, source, line, time: new Date() };
    this._logs.push(entry);
    if (this._logs.length > MAX_LOGS) this._logs.shift();

    // Update badge count when console is closed
    if (!this._consoleOpen) {
      const count = this._logs.length;
      this._consoleBadge.textContent = count > 99 ? '99+' : String(count);
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

    const time = _el('span', 'webview-log-time',
      entry.time.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    const level = _el('span', `webview-log-level webview-log-level-${entry.level}`,
      entry.level === 'verbose' ? 'verb' : entry.level);

    const msg = _el('span', 'webview-log-msg', entry.message);

    row.append(time, level, msg);

    if (entry.source) {
      const src = entry.source.replace(/.*\//, '');
      const loc = _el('span', 'webview-log-source', `${src}:${entry.line}`);
      row.appendChild(loc);
    }

    this._consoleList.appendChild(row);
  }

  toggleConsole() {
    this._consoleOpen = !this._consoleOpen;
    this._consolePanel.style.display = this._consoleOpen ? '' : 'none';
    this.consoleToggle.textContent = this._consoleOpen ? '\u{25bc}' : '\u{25b6}';
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

  _setupConsoleResize() {
    let startY = 0;
    let startHeight = 0;

    const onMove = (e) => {
      const dy = startY - e.clientY;
      const newH = Math.max(60, Math.min(500, startHeight + dy));
      this._consolePanel.style.height = `${newH}px`;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('resizing');
    };

    this._consoleHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = this._consolePanel.getBoundingClientRect().height;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.body.classList.add('resizing');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  navigate(url) {
    if (!/^https?:\/\//.test(url)) url = 'http://' + url;
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
