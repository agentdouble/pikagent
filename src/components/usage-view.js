import { _el } from '../utils/dom-dialogs.js';
import { TABS, getTabConfig, createSection } from '../utils/usage-view-helpers.js';
import { registerComponent } from '../utils/component-registry.js';

// --- Component ---

export class UsageView {
  constructor(container) {
    this.container = container;
    this.el = _el('div', { className: 'usage-container' });
    container.appendChild(this.el);
    this.activeTab = 'agents';
    this.metrics = null;
    this.render();
  }

  async render() {
    this.el.replaceChildren();

    this.el.appendChild(_el('div', { className: 'usage-header' },
      _el('div', { className: 'usage-header-left' },
        _el('h2', { className: 'usage-title', textContent: 'Usage' }),
      ),
      _el('button', { className: 'usage-refresh-btn', textContent: 'Refresh', onClick: () => this.render() }),
    ));

    const tabBar = _el('div', { className: 'usage-tabs' });
    const tabBtns = [];
    for (const tab of TABS) {
      const btn = _el('button', {
        className: `usage-tab ${this.activeTab === tab.id ? 'usage-tab-active' : ''}`,
        textContent: tab.label,
        onClick: () => {
          this.activeTab = tab.id;
          this._renderBody();
          for (const b of tabBtns) b.classList.remove('usage-tab-active');
          btn.classList.add('usage-tab-active');
        },
      });
      tabBtns.push(btn);
      tabBar.appendChild(btn);
    }
    this.el.appendChild(tabBar);

    this.bodyEl = _el('div', { className: 'usage-body' });
    this.el.appendChild(this.bodyEl);

    this._renderEmpty('Chargement des métriques...');

    try {
      this.metrics = await window.api.usage.getMetrics();
    } catch {
      this._renderEmpty('Erreur lors du chargement');
      return;
    }

    this._renderBody();
  }

  _renderBody() {
    this.bodyEl.replaceChildren();
    if (!this.metrics) return;

    const config = getTabConfig(this.activeTab, this.metrics);
    if (!config) return;

    if (config.empty) {
      this._renderEmpty(...config.empty);
      return;
    }

    this._renderOverviewCards(this.bodyEl, config.cards);
    this._renderChart(this.bodyEl, config.chart);
    for (const table of config.tables) this._renderTable(this.bodyEl, table);
  }

  refresh() {
    this.render();
  }

  dispose() {
    this.el.remove();
  }

  // ===== Shared rendering =====

  _renderEmpty(text, sub) {
    this.bodyEl.replaceChildren();
    this.bodyEl.appendChild(_el('div', { className: 'usage-empty' },
      _el('div', { className: 'usage-empty-text', textContent: text }),
      sub && _el('div', { className: 'usage-empty-sub', textContent: sub }),
    ));
  }

  _renderOverviewCards(parent, cards) {
    parent.appendChild(_el('div', { className: 'usage-overview' },
      ...cards.map(c => _el('div', { className: 'usage-stat-card' },
        _el('div', { className: 'usage-stat-label', textContent: c.label }),
        _el('div', { className: `usage-stat-value ${c.cls}`, textContent: c.value }),
        c.sub && _el('div', { className: 'usage-stat-sub', textContent: c.sub }),
      )),
    ));
  }

  _renderChart(parent, { title, data, segments, tooltip }) {
    const section = createSection(title);
    const max = Math.max(1, ...data.map((d) => d.total));

    section.appendChild(_el('div', { className: 'usage-chart' },
      _el('div', { className: 'usage-chart-bars' },
        ...data.map((day, i) => _el('div', { className: 'usage-chart-col', title: tooltip(day) },
          day.total > 0 && _el('div', {
            className: 'usage-chart-bar-stack',
            style: { height: `${Math.max((day.total / max) * 100, 4)}%` },
          },
            ...segments
              .filter(seg => (day[seg.key] || 0) > 0)
              .map(seg => _el('div', {
                className: seg.cls,
                style: { height: `${((day[seg.key] || 0) / day.total) * 100}%` },
              })),
          ),
          (i % 5 === 0 || i === data.length - 1) && _el('div', { className: 'usage-chart-label', textContent: day.label }),
        )),
      ),
    ));
    parent.appendChild(section);
  }

  _renderTable(parent, { title, headers, tableCls, data, renderRow }) {
    if (!data || data.length === 0) return;

    const section = createSection(title);
    section.appendChild(_el('div', { className: 'usage-table-wrap' },
      _el('table', { className: tableCls },
        _el('thead', {},
          _el('tr', {}, ...headers.map(h => _el('th', { textContent: h }))),
        ),
        _el('tbody', {}, ...data.map(renderRow)),
      ),
    ));
    parent.appendChild(section);
  }
}

registerComponent('UsageView', UsageView);
