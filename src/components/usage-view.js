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

    if (!metrics.hasData) {
      const empty = document.createElement('div');
      empty.className = 'usage-empty';
      empty.innerHTML = `
        <div class="usage-empty-icon">📊</div>
        <div class="usage-empty-text">Aucune donnée disponible</div>
        <div class="usage-empty-sub">Lancez des agents ou créez des flows pour voir les métriques</div>
      `;
      this.el.appendChild(empty);
      return;
    }

    const body = document.createElement('div');
    body.className = 'usage-body';

    // --- Tokens Section ---
    if (metrics.tokens.total > 0) {
      this._renderSectionTitle(body, 'Tokens', this._fmtTokens(metrics.tokens.total) + ' total');
      this._renderOverviewCards(body, [
        { label: 'Total', value: this._fmtTokens(metrics.tokens.total), cls: '' },
        { label: 'Input', value: this._fmtTokens(metrics.tokens.totalInput), cls: 'usage-stat-value-blue' },
        { label: 'Output', value: this._fmtTokens(metrics.tokens.totalOutput), cls: 'usage-stat-value-green' },
        { label: 'Cache read', value: this._fmtTokens(metrics.tokens.totalCacheRead), cls: '', sub: metrics.tokens.totalCacheCreate > 0 ? `cache write: ${this._fmtTokens(metrics.tokens.totalCacheCreate)}` : '' },
      ]);
      this._renderTokenChart(body, metrics.tokens.perDay);
      this._renderTokenProjectTable(body, metrics.tokens.perProject);

      const sepTokens = document.createElement('div');
      sepTokens.className = 'usage-separator';
      body.appendChild(sepTokens);
    }

    // --- Agents Section ---
    this._renderSectionTitle(body, 'Agents (Work)', `${metrics.agent.totalSessions} sessions · ${metrics.agent.activeSessions} active`);
    this._renderOverviewCards(body, [
      { label: 'Sessions', value: metrics.agent.totalSessions, cls: '' },
      { label: 'En cours', value: metrics.agent.activeSessions, cls: metrics.agent.activeSessions > 0 ? 'usage-stat-value-green' : '' },
      { label: 'Taux succès', value: `${metrics.agent.rate.rate}%`, cls: metrics.agent.rate.rate >= 70 ? 'usage-stat-value-green' : 'usage-stat-value-red' },
      { label: 'Durée moy.', value: this._fmt(metrics.agent.duration.avg), cls: 'usage-stat-value-blue', sub: metrics.agent.duration.count > 0 ? `min: ${this._fmt(metrics.agent.duration.min)} · max: ${this._fmt(metrics.agent.duration.max)}` : '' },
    ]);
    this._renderChart(body, metrics.agent.perDay, 'Sessions agents par jour');
    this._renderAgentTable(body, metrics.agent.byAgent);

    // --- Separator ---
    const sep = document.createElement('div');
    sep.className = 'usage-separator';
    body.appendChild(sep);

    // --- Flows Section ---
    this._renderSectionTitle(body, 'Flows', `${metrics.flow.totalFlows} flows · ${metrics.flow.activeFlows} actifs`);
    this._renderOverviewCards(body, [
      { label: 'Total Runs', value: metrics.flow.rate.total, cls: '' },
      { label: 'Flows actifs', value: `${metrics.flow.activeFlows}/${metrics.flow.totalFlows}`, cls: '' },
      { label: 'Taux succès', value: `${metrics.flow.rate.rate}%`, cls: metrics.flow.rate.rate >= 70 ? 'usage-stat-value-green' : 'usage-stat-value-red' },
      { label: 'Durée moy.', value: this._fmt(metrics.flow.duration.avg), cls: 'usage-stat-value-blue', sub: metrics.flow.duration.count > 0 ? `min: ${this._fmt(metrics.flow.duration.min)} · max: ${this._fmt(metrics.flow.duration.max)}` : '' },
    ]);
    this._renderChart(body, metrics.flow.perDay, 'Runs par jour');
    this._renderFlowTable(body, metrics.flow.flowStats);

    // --- Files Section ---
    if (metrics.mostModifiedFiles.length > 0) {
      const sep2 = document.createElement('div');
      sep2.className = 'usage-separator';
      body.appendChild(sep2);
      this._renderFilesTable(body, metrics.mostModifiedFiles);
    }

    this.el.appendChild(body);
  }

  refresh() {
    this.render();
  }

  dispose() {
    this.el.remove();
  }

  // ===== Rendering helpers =====

  _renderSectionTitle(parent, text, badge) {
    const row = document.createElement('div');
    row.className = 'usage-section-heading';
    const h = document.createElement('h3');
    h.className = 'usage-section-heading-text';
    h.textContent = text;
    row.appendChild(h);
    if (badge) {
      const b = document.createElement('span');
      b.className = 'usage-section-heading-badge';
      b.textContent = badge;
      row.appendChild(b);
    }
    parent.appendChild(row);
  }

  _renderOverviewCards(parent, cards) {
    const grid = document.createElement('div');
    grid.className = 'usage-overview';
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
      grid.appendChild(el);
    }
    parent.appendChild(grid);
  }

  _renderChart(parent, data, title) {
    const section = document.createElement('div');
    section.className = 'usage-section';
    const t = document.createElement('div');
    t.className = 'usage-section-title';
    t.textContent = title;
    section.appendChild(t);

    const chart = document.createElement('div');
    chart.className = 'usage-chart';
    const bars = document.createElement('div');
    bars.className = 'usage-chart-bars';
    const max = Math.max(1, ...data.map((d) => d.total));

    for (let i = 0; i < data.length; i++) {
      const day = data[i];
      const col = document.createElement('div');
      col.className = 'usage-chart-col';
      const running = day.running || 0;
      col.title = `${day.label}: ${day.total} (${day.success} ok, ${day.error} err${running ? `, ${running} en cours` : ''})`;

      if (day.total > 0) {
        const stack = document.createElement('div');
        stack.className = 'usage-chart-bar-stack';
        stack.style.height = `${Math.max((day.total / max) * 100, 4)}%`;
        if (day.success > 0) {
          const b = document.createElement('div');
          b.className = 'usage-chart-bar-success';
          b.style.height = `${(day.success / day.total) * 100}%`;
          stack.appendChild(b);
        }
        if (day.error > 0) {
          const b = document.createElement('div');
          b.className = 'usage-chart-bar-error';
          b.style.height = `${(day.error / day.total) * 100}%`;
          stack.appendChild(b);
        }
        if (running > 0) {
          const b = document.createElement('div');
          b.className = 'usage-chart-bar-running';
          b.style.height = `${(running / day.total) * 100}%`;
          stack.appendChild(b);
        }
        col.appendChild(stack);
      }

      if (i % 5 === 0 || i === data.length - 1) {
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

  _renderAgentTable(parent, byAgent) {
    if (!byAgent || byAgent.length === 0) return;

    const section = document.createElement('div');
    section.className = 'usage-section';
    const t = document.createElement('div');
    t.className = 'usage-section-title';
    t.textContent = 'Par agent';
    section.appendChild(t);

    const wrap = document.createElement('div');
    wrap.className = 'usage-table-wrap';
    const table = document.createElement('table');
    table.className = 'usage-flow-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Agent</th><th>Sessions</th><th>Actifs</th><th>Succès</th><th>Durée moy.</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const a of byAgent) {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.className = 'usage-flow-name';
      tdName.textContent = a.agent;
      tr.appendChild(tdName);

      const tdSessions = document.createElement('td');
      tdSessions.textContent = a.totalSessions;
      tr.appendChild(tdSessions);

      const tdActive = document.createElement('td');
      tdActive.style.color = a.active > 0 ? 'var(--green)' : 'var(--text-muted)';
      tdActive.textContent = a.active;
      tr.appendChild(tdActive);

      const tdRate = document.createElement('td');
      tdRate.className = 'usage-flow-rate';
      tdRate.style.color = a.successRate >= 70 ? 'var(--green)' : '#ff6b6b';
      tdRate.textContent = `${a.successRate}%`;
      tr.appendChild(tdRate);

      const tdDur = document.createElement('td');
      tdDur.className = 'usage-flow-duration';
      tdDur.textContent = a.avgDuration > 0 ? this._fmt(a.avgDuration) : '—';
      tr.appendChild(tdDur);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    parent.appendChild(section);
  }

  _renderFlowTable(parent, flowStats) {
    if (!flowStats || flowStats.length === 0) return;

    const section = document.createElement('div');
    section.className = 'usage-section';
    const t = document.createElement('div');
    t.className = 'usage-section-title';
    t.textContent = 'Par flow';
    section.appendChild(t);

    const wrap = document.createElement('div');
    wrap.className = 'usage-table-wrap';
    const table = document.createElement('table');
    table.className = 'usage-flow-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Flow</th><th>Runs</th><th>Succès</th><th>Durée moy.</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const flow of flowStats) {
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
      tdDur.textContent = flow.avgDuration > 0 ? this._fmt(flow.avgDuration) : '—';
      tr.appendChild(tdDur);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    parent.appendChild(section);
  }

  _renderFilesTable(parent, files) {
    const section = document.createElement('div');
    section.className = 'usage-section';
    const t = document.createElement('div');
    t.className = 'usage-section-title';
    t.textContent = 'Fichiers les plus modifiés (30 jours)';
    section.appendChild(t);

    const wrap = document.createElement('div');
    wrap.className = 'usage-table-wrap';
    const table = document.createElement('table');
    table.className = 'usage-files-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Fichier</th><th>Modifs</th><th></th></tr>';
    table.appendChild(thead);

    const maxCount = files[0]?.count || 1;
    const tbody = document.createElement('tbody');
    for (const file of files) {
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

  _renderTokenChart(parent, data) {
    const section = document.createElement('div');
    section.className = 'usage-section';
    const t = document.createElement('div');
    t.className = 'usage-section-title';
    t.textContent = 'Tokens par jour (30 derniers jours)';
    section.appendChild(t);

    const chart = document.createElement('div');
    chart.className = 'usage-chart';
    const bars = document.createElement('div');
    bars.className = 'usage-chart-bars';
    const max = Math.max(1, ...data.map((d) => d.total));

    for (let i = 0; i < data.length; i++) {
      const day = data[i];
      const col = document.createElement('div');
      col.className = 'usage-chart-col';
      col.title = `${day.label}: ${this._fmtTokens(day.total)} (in: ${this._fmtTokens(day.input)}, out: ${this._fmtTokens(day.output)})`;

      if (day.total > 0) {
        const stack = document.createElement('div');
        stack.className = 'usage-chart-bar-stack';
        stack.style.height = `${Math.max((day.total / max) * 100, 4)}%`;
        if (day.input > 0) {
          const b = document.createElement('div');
          b.className = 'usage-chart-bar-running';
          b.style.height = `${(day.input / day.total) * 100}%`;
          stack.appendChild(b);
        }
        if (day.output > 0) {
          const b = document.createElement('div');
          b.className = 'usage-chart-bar-success';
          b.style.height = `${(day.output / day.total) * 100}%`;
          stack.appendChild(b);
        }
        col.appendChild(stack);
      }

      if (i % 5 === 0 || i === data.length - 1) {
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

  _renderTokenProjectTable(parent, projects) {
    if (!projects || projects.length === 0) return;

    const section = document.createElement('div');
    section.className = 'usage-section';
    const t = document.createElement('div');
    t.className = 'usage-section-title';
    t.textContent = 'Par projet';
    section.appendChild(t);

    const wrap = document.createElement('div');
    wrap.className = 'usage-table-wrap';
    const table = document.createElement('table');
    table.className = 'usage-files-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Projet</th><th>Input</th><th>Output</th><th>Total</th><th></th></tr>';
    table.appendChild(thead);

    const maxTotal = projects[0]?.total || 1;
    const tbody = document.createElement('tbody');
    for (const proj of projects) {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.className = 'usage-file-name';
      tdName.textContent = proj.project;
      tr.appendChild(tdName);

      const tdIn = document.createElement('td');
      tdIn.className = 'usage-file-count';
      tdIn.style.color = 'var(--blue)';
      tdIn.textContent = this._fmtTokens(proj.input);
      tr.appendChild(tdIn);

      const tdOut = document.createElement('td');
      tdOut.className = 'usage-file-count';
      tdOut.style.color = 'var(--green)';
      tdOut.textContent = this._fmtTokens(proj.output);
      tr.appendChild(tdOut);

      const tdTotal = document.createElement('td');
      tdTotal.className = 'usage-file-count';
      tdTotal.textContent = this._fmtTokens(proj.total);
      tr.appendChild(tdTotal);

      const tdBar = document.createElement('td');
      tdBar.className = 'usage-file-bar-cell';
      const bar = document.createElement('div');
      bar.className = 'usage-file-bar';
      const fill = document.createElement('div');
      fill.className = 'usage-file-bar-fill';
      fill.style.width = `${(proj.total / maxTotal) * 100}%`;
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
