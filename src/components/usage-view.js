import { _el } from '../utils/dom.js';

function _td(text, attrs = {}) {
  return _el('td', { ...attrs, textContent: text });
}

// --- Constants ---

const TABS = [
  { id: 'agents', label: 'Agents (Work)' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'flows', label: 'Flows' },
];

const RATE_THRESHOLD = 70;

const RUN_CHART_SEGMENTS = [
  { key: 'success', cls: 'usage-chart-bar-success' },
  { key: 'error', cls: 'usage-chart-bar-error' },
  { key: 'running', cls: 'usage-chart-bar-running' },
];

function _runTooltip(day) {
  return `${day.label}: ${day.total} (${day.success} ok, ${day.error} err${day.running ? `, ${day.running} en cours` : ''})`;
}

function _rateColor(rate) {
  return rate >= RATE_THRESHOLD ? 'var(--green)' : '#ff6b6b';
}

function _rateCls(rate) {
  return rate >= RATE_THRESHOLD ? 'usage-stat-value-green' : 'usage-stat-value-red';
}

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

    if (this.activeTab === 'agents') this._renderAgentsTab();
    else if (this.activeTab === 'tokens') this._renderTokensTab();
    else if (this.activeTab === 'flows') this._renderFlowsTab();
  }

  // ===== Agents Tab =====

  _renderAgentsTab() {
    const m = this.metrics.agent;
    this._renderOverviewCards(this.bodyEl, [
      { label: 'Sessions', value: m.totalSessions, cls: '' },
      { label: 'En cours', value: m.activeSessions, cls: m.activeSessions > 0 ? 'usage-stat-value-green' : '' },
      { label: 'Taux succès', value: `${m.rate.rate}%`, cls: _rateCls(m.rate.rate) },
      { label: 'Durée moy.', value: this._fmt(m.duration.avg), cls: 'usage-stat-value-blue', sub: m.duration.count > 0 ? `min: ${this._fmt(m.duration.min)} · max: ${this._fmt(m.duration.max)}` : '' },
    ]);
    this._renderChart(this.bodyEl, {
      title: 'Sessions par jour',
      data: m.perDay,
      segments: RUN_CHART_SEGMENTS,
      tooltip: _runTooltip,
    });
    this._renderTable(this.bodyEl, {
      title: 'Par agent',
      headers: ['Agent', 'Sessions', 'Actifs', 'Succès', 'Durée moy.'],
      tableCls: 'usage-flow-table',
      data: m.byAgent,
      renderRow: (a) => _el('tr', {},
        _td(a.agent, { className: 'usage-flow-name' }),
        _td(a.totalSessions),
        _td(a.active, { style: { color: a.active > 0 ? 'var(--green)' : 'var(--text-muted)' } }),
        _td(`${a.successRate}%`, { className: 'usage-flow-rate', style: { color: _rateColor(a.successRate) } }),
        _td(a.avgDuration > 0 ? this._fmt(a.avgDuration) : '\u2014', { className: 'usage-flow-duration' }),
      ),
    });
    const maxFileCount = this.metrics.mostModifiedFiles[0]?.count || 1;
    this._renderTable(this.bodyEl, {
      title: 'Fichiers les plus modifiés (30 jours)',
      headers: ['Fichier', 'Modifs', ''],
      tableCls: 'usage-files-table',
      data: this.metrics.mostModifiedFiles,
      renderRow: (file) => _el('tr', {},
        _td(file.file, { className: 'usage-file-name', title: file.file }),
        _td(file.count, { className: 'usage-file-count' }),
        this._createBarCell((file.count / maxFileCount) * 100),
      ),
    });
  }

  // ===== Tokens Tab =====

  _renderTokensTab() {
    const t = this.metrics.tokens;
    if (!t || t.total === 0) {
      this._renderEmpty('Aucune donnée de tokens', 'Les tokens sont lus depuis les sessions Claude (~/.claude/projects/)');
      return;
    }
    this._renderOverviewCards(this.bodyEl, [
      { label: 'Total', value: this._fmtTokens(t.total), cls: '' },
      { label: 'Input', value: this._fmtTokens(t.totalInput), cls: 'usage-stat-value-blue' },
      { label: 'Output', value: this._fmtTokens(t.totalOutput), cls: 'usage-stat-value-green' },
      { label: 'Cache read', value: this._fmtTokens(t.totalCacheRead), cls: '', sub: t.totalCacheCreate > 0 ? `cache write: ${this._fmtTokens(t.totalCacheCreate)}` : '' },
    ]);
    this._renderChart(this.bodyEl, {
      title: 'Tokens par jour (30 derniers jours)',
      data: t.perDay,
      segments: [
        { key: 'input', cls: 'usage-chart-bar-running' },
        { key: 'output', cls: 'usage-chart-bar-success' },
      ],
      tooltip: (day) => `${day.label}: ${this._fmtTokens(day.total)} (in: ${this._fmtTokens(day.input)}, out: ${this._fmtTokens(day.output)})`,
    });
    const maxProjectTotal = t.perProject?.[0]?.total || 1;
    this._renderTable(this.bodyEl, {
      title: 'Par projet',
      headers: ['Projet', 'Input', 'Output', 'Total', ''],
      tableCls: 'usage-files-table',
      data: t.perProject,
      renderRow: (proj) => _el('tr', {},
        _td(proj.project, { className: 'usage-file-name' }),
        _td(this._fmtTokens(proj.input), { className: 'usage-file-count', style: { color: 'var(--blue)' } }),
        _td(this._fmtTokens(proj.output), { className: 'usage-file-count', style: { color: 'var(--green)' } }),
        _td(this._fmtTokens(proj.total), { className: 'usage-file-count' }),
        this._createBarCell((proj.total / maxProjectTotal) * 100),
      ),
    });
  }

  // ===== Flows Tab =====

  _renderFlowsTab() {
    const f = this.metrics.flow;
    if (f.totalFlows === 0) {
      this._renderEmpty('Aucun flow configuré', 'Créez des flows depuis la vue FLOW');
      return;
    }
    this._renderOverviewCards(this.bodyEl, [
      { label: 'Total Runs', value: f.rate.total, cls: '' },
      { label: 'Flows actifs', value: `${f.activeFlows}/${f.totalFlows}`, cls: '' },
      { label: 'Taux succès', value: `${f.rate.rate}%`, cls: _rateCls(f.rate.rate) },
      { label: 'Durée moy.', value: this._fmt(f.duration.avg), cls: 'usage-stat-value-blue', sub: f.duration.count > 0 ? `min: ${this._fmt(f.duration.min)} · max: ${this._fmt(f.duration.max)}` : '' },
    ]);
    this._renderChart(this.bodyEl, {
      title: 'Runs par jour',
      data: f.perDay,
      segments: RUN_CHART_SEGMENTS,
      tooltip: _runTooltip,
    });
    this._renderTable(this.bodyEl, {
      title: 'Par flow',
      headers: ['Flow', 'Runs', 'Succès', 'Durée moy.'],
      tableCls: 'usage-flow-table',
      data: f.flowStats,
      renderRow: (flow) => _el('tr', {},
        _el('td', {},
          _el('span', {
            className: `usage-flow-name ${!flow.enabled ? 'usage-flow-disabled' : ''}`,
            textContent: flow.name,
          }),
          !flow.enabled && _el('span', {
            style: { fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' },
            textContent: '(désactivé)',
          }),
        ),
        _td(flow.totalRuns),
        _td(`${flow.successRate}%`, { className: 'usage-flow-rate', style: { color: _rateColor(flow.successRate) } }),
        _td(flow.avgDuration > 0 ? this._fmt(flow.avgDuration) : '\u2014', { className: 'usage-flow-duration' }),
      ),
    });
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

  _createSection(title) {
    return _el('div', { className: 'usage-section' },
      _el('div', { className: 'usage-section-title', textContent: title }),
    );
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
    const section = this._createSection(title);
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

  _createBarCell(pct) {
    return _el('td', { className: 'usage-file-bar-cell' },
      _el('div', { className: 'usage-file-bar' },
        _el('div', { className: 'usage-file-bar-fill', style: { width: `${pct}%` } }),
      ),
    );
  }

  _renderTable(parent, { title, headers, tableCls, data, renderRow }) {
    if (!data || data.length === 0) return;

    const section = this._createSection(title);
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

  _fmtTokens(n) {
    if (n == null || n === 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return `${n}`;
  }

  _fmt(seconds) {
    if (!seconds || seconds <= 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  }
}
