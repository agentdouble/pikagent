import { _el } from '../utils/dom-api.js';
import { buildTabBar } from '../utils/dom-tabs.js';
import { buildViewHeader } from '../utils/view-header.js';
import { TABS, getTabConfig, createSection } from '../utils/usage-view-helpers.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import { usageFacade as usageApi } from '../facades/usage-facade.js';

// --- Component ---

const USAGE_AUTO_REFRESH_MS = 60_000;

class UsageView extends ComponentBase {
  constructor(container) {
    super(container);
  }

  _initState() {
    this.el = _el('div', { className: 'usage-container' });
    this.container.appendChild(this.el);
    this.activeTab = 'agents';
    this.metrics = null;
    this._loadingMetrics = false;
  }

  _afterInit() {
    const refreshTimer = window.setInterval(() => this.refresh(), USAGE_AUTO_REFRESH_MS);
    this._track(() => window.clearInterval(refreshTimer));
    const onFocus = () => this.refresh();
    window.addEventListener('focus', onFocus);
    this._track(() => window.removeEventListener('focus', onFocus));
  }

  async render() {
    this.el.replaceChildren();

    this.el.appendChild(buildViewHeader({
      baseClass: 'usage',
      title: 'Usage',
      wrapLeft: true,
      actions: _el('button', { className: 'usage-refresh-btn', textContent: 'Refresh', onClick: () => this.refresh(true) }),
    }));

    const { bar, setActive } = buildTabBar(TABS, {
      activeId: this.activeTab,
      barClass: 'usage-tabs',
      itemClass: 'usage-tab',
      activeClass: 'usage-tab-active',
      onSelect: (id) => {
        this.activeTab = id;
        this._renderBody();
        setActive(id);
      },
    });
    this.el.appendChild(bar);

    this.bodyEl = _el('div', { className: 'usage-body' });
    this.el.appendChild(this.bodyEl);

    await this._loadMetrics({ showLoading: true });
  }

  async _loadMetrics({ force = false, showLoading = false } = {}) {
    if (this.disposed || this._loadingMetrics) return;
    this._loadingMetrics = true;
    if (showLoading) this._renderEmpty('Chargement des métriques...');
    try {
      this.metrics = await usageApi.getMetrics({ force });
    } catch {
      this._renderEmpty('Erreur lors du chargement');
      return;
    } finally {
      this._loadingMetrics = false;
    }

    if (!this.disposed) this._renderBody();
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

  refresh(force = false) {
    return this._loadMetrics({ force });
  }

  dispose() {
    super.dispose();
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
