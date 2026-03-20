export class UsageView {
  constructor(container) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.className = 'usage-container';
    container.appendChild(this.el);
    this.render();
  }

  async render() {
    this.el.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'usage-header';
    const title = document.createElement('h2');
    title.className = 'usage-title';
    title.textContent = 'Usage Dashboard';
    header.appendChild(title);

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'usage-refresh-btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.addEventListener('click', () => this.render());
    header.appendChild(refreshBtn);

    this.el.appendChild(header);

    // Loading
    const loading = document.createElement('div');
    loading.className = 'usage-empty';
    loading.innerHTML = '<div class="usage-empty-text">Chargement des métriques...</div>';
    this.el.appendChild(loading);

    let metrics;
    try {
      metrics = await window.api.usage.getMetrics();
    } catch {
      loading.innerHTML = '<div class="usage-empty-text">Erreur lors du chargement</div>';
      return;
    }

    loading.remove();

    if (metrics.totalFlows === 0) {
      const empty = document.createElement('div');
      empty.className = 'usage-empty';
      empty.innerHTML = `
        <div class="usage-empty-icon">📊</div>
        <div class="usage-empty-text">Aucune donnée disponible</div>
        <div class="usage-empty-sub">Créez des flows pour voir les métriques d'utilisation</div>
      `;
      this.el.appendChild(empty);
      return;
    }

    const body = document.createElement('div');
    body.className = 'usage-body';

    this._renderOverviewCards(body, metrics);
    this._renderSuccessRate(body, metrics);
    this._renderRunsChart(body, metrics);
    this._renderFlowStats(body, metrics);
    this._renderMostModifiedFiles(body, metrics);

    this.el.appendChild(body);
  }

  refresh() {
    this.render();
  }

  dispose() {
    this.el.remove();
  }

  _renderOverviewCards(parent, metrics) {
    const overview = document.createElement('div');
    overview.className = 'usage-overview';

    const cards = [
      { label: 'Total Runs', value: metrics.successRate.total, cls: '' },
      { label: 'Flows actifs', value: `${metrics.activeFlows}/${metrics.totalFlows}`, cls: '' },
      { label: 'Taux succès', value: `${metrics.successRate.rate}%`, cls: metrics.successRate.rate >= 70 ? 'usage-stat-value-green' : 'usage-stat-value-red' },
      { label: 'Durée moy.', value: this._formatDuration(metrics.duration.avg), cls: 'usage-stat-value-blue', sub: metrics.duration.count > 0 ? `min: ${this._formatDuration(metrics.duration.min)} · max: ${this._formatDuration(metrics.duration.max)}` : '' },
    ];

    for (const card of cards) {
      const el = document.createElement('div');
      el.className = 'usage-stat-card';

      const label = document.createElement('div');
      label.className = 'usage-stat-label';
      label.textContent = card.label;
      el.appendChild(label);

      const val = document.createElement('div');
      val.className = `usage-stat-value ${card.cls}`;
      val.textContent = card.value;
      el.appendChild(val);

      if (card.sub) {
        const sub = document.createElement('div');
        sub.className = 'usage-stat-sub';
        sub.textContent = card.sub;
        el.appendChild(sub);
      }

      overview.appendChild(el);
    }

    parent.appendChild(overview);
  }

  _renderSuccessRate(parent, metrics) {
    const section = document.createElement('div');
    section.className = 'usage-rate-row';

    // Success rate card
    const card = document.createElement('div');
    card.className = 'usage-rate-card';

    const header = document.createElement('div');
    header.className = 'usage-rate-header';
    const title = document.createElement('span');
    title.className = 'usage-rate-title';
    title.textContent = 'Taux de succès / échec';
    const value = document.createElement('span');
    value.className = 'usage-rate-value';
    value.textContent = `${metrics.successRate.rate}%`;
    header.appendChild(title);
    header.appendChild(value);
    card.appendChild(header);

    const bar = document.createElement('div');
    bar.className = 'usage-rate-bar';
    const fill = document.createElement('div');
    fill.className = 'usage-rate-fill';
    fill.style.width = `${metrics.successRate.rate}%`;
    bar.appendChild(fill);
    card.appendChild(bar);

    const legend = document.createElement('div');
    legend.className = 'usage-rate-legend';

    const successLegend = document.createElement('div');
    successLegend.className = 'usage-rate-legend-item';
    successLegend.innerHTML = `<span class="usage-rate-legend-dot" style="background: var(--green)"></span> ${metrics.successRate.success} succès`;
    legend.appendChild(successLegend);

    const errorLegend = document.createElement('div');
    errorLegend.className = 'usage-rate-legend-item';
    errorLegend.innerHTML = `<span class="usage-rate-legend-dot" style="background: #ff6b6b"></span> ${metrics.successRate.error} échecs`;
    legend.appendChild(errorLegend);

    card.appendChild(legend);
    section.appendChild(card);

    // Duration card
    if (metrics.duration.count > 0) {
      const durCard = document.createElement('div');
      durCard.className = 'usage-rate-card';

      const durHeader = document.createElement('div');
      durHeader.className = 'usage-rate-header';
      const durTitle = document.createElement('span');
      durTitle.className = 'usage-rate-title';
      durTitle.textContent = "Durée d'exécution";
      const durValue = document.createElement('span');
      durValue.className = 'usage-rate-value';
      durValue.style.color = 'var(--blue)';
      durValue.textContent = this._formatDuration(metrics.duration.avg);
      durHeader.appendChild(durTitle);
      durHeader.appendChild(durValue);
      durCard.appendChild(durHeader);

      const durRow = document.createElement('div');
      durRow.className = 'usage-duration-row';

      const stats = [
        { label: 'Minimum', val: this._formatDuration(metrics.duration.min) },
        { label: 'Moyenne', val: this._formatDuration(metrics.duration.avg) },
        { label: 'Maximum', val: this._formatDuration(metrics.duration.max) },
      ];

      for (const s of stats) {
        const stat = document.createElement('div');
        stat.className = 'usage-duration-stat';
        const v = document.createElement('div');
        v.className = 'usage-duration-val';
        v.textContent = s.val;
        const l = document.createElement('div');
        l.className = 'usage-duration-label';
        l.textContent = s.label;
        stat.appendChild(v);
        stat.appendChild(l);
        durRow.appendChild(stat);
      }

      durCard.appendChild(durRow);
      section.appendChild(durCard);
    }

    parent.appendChild(section);
  }

  _renderRunsChart(parent, metrics) {
    const section = document.createElement('div');
    section.className = 'usage-section';

    const title = document.createElement('div');
    title.className = 'usage-section-title';
    title.textContent = 'Runs par jour (30 derniers jours)';
    section.appendChild(title);

    const chart = document.createElement('div');
    chart.className = 'usage-chart';

    const bars = document.createElement('div');
    bars.className = 'usage-chart-bars';

    const maxTotal = Math.max(1, ...metrics.runsPerDay.map((d) => d.total));

    for (const day of metrics.runsPerDay) {
      const col = document.createElement('div');
      col.className = 'usage-chart-col';
      col.title = `${day.label}: ${day.total} run${day.total !== 1 ? 's' : ''} (${day.success} ok, ${day.error} err)`;

      if (day.total > 0) {
        const stack = document.createElement('div');
        stack.className = 'usage-chart-bar-stack';
        const pct = (day.total / maxTotal) * 100;
        stack.style.height = `${Math.max(pct, 4)}%`;

        if (day.success > 0) {
          const successBar = document.createElement('div');
          successBar.className = 'usage-chart-bar-success';
          successBar.style.height = `${(day.success / day.total) * 100}%`;
          stack.appendChild(successBar);
        }
        if (day.error > 0) {
          const errorBar = document.createElement('div');
          errorBar.className = 'usage-chart-bar-error';
          errorBar.style.height = `${(day.error / day.total) * 100}%`;
          stack.appendChild(errorBar);
        }

        col.appendChild(stack);
      }

      const idx = metrics.runsPerDay.indexOf(day);
      if (idx % 5 === 0 || idx === metrics.runsPerDay.length - 1) {
        const label = document.createElement('div');
        label.className = 'usage-chart-label';
        label.textContent = day.label;
        col.appendChild(label);
      }

      bars.appendChild(col);
    }

    chart.appendChild(bars);
    section.appendChild(chart);
    parent.appendChild(section);
  }

  _renderFlowStats(parent, metrics) {
    if (!metrics.flowStats || metrics.flowStats.length === 0) return;

    const section = document.createElement('div');
    section.className = 'usage-section';

    const title = document.createElement('div');
    title.className = 'usage-section-title';
    title.textContent = 'Statistiques par flow';
    section.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'usage-table-wrap';

    const table = document.createElement('table');
    table.className = 'usage-flow-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Flow</th><th>Runs</th><th>Succès</th><th>Durée moy.</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const flow of metrics.flowStats) {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      const nameSpan = document.createElement('span');
      nameSpan.className = `usage-flow-name ${!flow.enabled ? 'usage-flow-disabled' : ''}`;
      nameSpan.textContent = flow.name;
      tdName.appendChild(nameSpan);
      if (!flow.enabled) {
        const tag = document.createElement('span');
        tag.style.cssText = 'font-size:10px;color:var(--text-muted);margin-left:6px';
        tag.textContent = '(désactivé)';
        tdName.appendChild(tag);
      }
      tr.appendChild(tdName);

      const tdRuns = document.createElement('td');
      tdRuns.textContent = flow.totalRuns;
      tr.appendChild(tdRuns);

      const tdRate = document.createElement('td');
      tdRate.className = 'usage-flow-rate';
      tdRate.style.color = flow.successRate >= 70 ? 'var(--green)' : '#ff6b6b';
      tdRate.textContent = `${flow.successRate}%`;
      tr.appendChild(tdRate);

      const tdDur = document.createElement('td');
      tdDur.className = 'usage-flow-duration';
      tdDur.textContent = flow.avgDuration > 0 ? this._formatDuration(flow.avgDuration) : '—';
      tr.appendChild(tdDur);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    parent.appendChild(section);
  }

  _renderMostModifiedFiles(parent, metrics) {
    if (!metrics.mostModifiedFiles || metrics.mostModifiedFiles.length === 0) return;

    const section = document.createElement('div');
    section.className = 'usage-section';

    const title = document.createElement('div');
    title.className = 'usage-section-title';
    title.textContent = 'Fichiers les plus modifiés (30 jours)';
    section.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'usage-table-wrap';

    const table = document.createElement('table');
    table.className = 'usage-files-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Fichier</th><th>Modifs</th><th></th></tr>';
    table.appendChild(thead);

    const maxCount = metrics.mostModifiedFiles[0]?.count || 1;
    const tbody = document.createElement('tbody');

    for (const file of metrics.mostModifiedFiles) {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.className = 'usage-file-name';
      tdName.textContent = file.file;
      tdName.title = file.file;
      tr.appendChild(tdName);

      const tdCount = document.createElement('td');
      tdCount.className = 'usage-file-count';
      tdCount.textContent = file.count;
      tr.appendChild(tdCount);

      const tdBar = document.createElement('td');
      tdBar.className = 'usage-file-bar-cell';
      const bar = document.createElement('div');
      bar.className = 'usage-file-bar';
      const fill = document.createElement('div');
      fill.className = 'usage-file-bar-fill';
      fill.style.width = `${(file.count / maxCount) * 100}%`;
      bar.appendChild(fill);
      tdBar.appendChild(bar);
      tr.appendChild(tdBar);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    parent.appendChild(section);
  }

  _formatDuration(seconds) {
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
