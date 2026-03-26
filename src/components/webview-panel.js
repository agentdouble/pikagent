import { _el } from '../utils/dom.js';

export class WebviewInstance {
  constructor(container, url) {
    this.container = container;
    this.url = url;
    this.disposed = false;
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

    this.navBar.append(backBtn, fwdBtn, refreshBtn, this.urlInput, openExtBtn);

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

    this.container.append(this.navBar, this.webview);
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
