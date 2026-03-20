export class UsageView {
  constructor(container) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.className = 'usage-container';
    container.appendChild(this.el);
    this.activeTab = 'agents';
    this.metrics = null;
    this.render();
  }

  async render() {
    this.el.innerHTML = '';

    // Header with tabs
    const header = document.createElement('div');
    header.className = 'usage-header';

    const left = document.createElement('div');
    left.className = 'usage-header-left';
    const title = document.createElement('h2');
    title.className = 'usage-title';
    title.textContent = 'Usage';
    left.appendChild(title);
    header.appendChild(left);

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'usage-refresh-btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.addEventListener('click', () => this.render());
    header.appendChild(refreshBtn);
    this.el.appendChild(header);

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.className = 'usage-tabs';
    const tabs = [
      { id: 'agents', label: 'Agents (Work)' },
      { id: 'tokens', label: 'Tokens' },
      { id: 'flows', label: 'Flows' },
    ];
    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.className = `usage-tab ${this.activeTab === tab.id ? 'usage-tab-active' : ''}`;
      btn.textContent = tab.label;
      btn.addEventListener('click', () => {
        this.activeTab = tab.id;
        this._renderBody();
        tabBar.querySelectorAll('.usage-tab').forEach((t) => t.classList.remove('usage-tab-active'));
        btn.classList.add('usage-tab-active');
      });
      tabBar.appendChild(btn);
    }
    this.el.appendChild(tabBar);

    // Body container
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'usage-body';
    this.el.appendChild(this.bodyEl);

    // Loading
    this.bodyEl.innerHTML = '<div class="usage-empty"><div class="usage-empty-text">Chargement des métriques...</div></div>';

    try {
      this.metrics = await window.api.usage.getMetrics();
    } catch {
      this.bodyEl.innerHTML = '<div class="usage-empty"><div class="usage-empty-text">Erreur lors du chargement</div></div>';
      return;
    }

    this._renderBody();
  }

  _renderBody() {
    this.bodyEl.innerHTML = '';
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
      { label: 'Taux succès', value: `${m.rate.rate}%`, cls: m.rate.rate >= 70 ? 'usage-stat-value-green' : 'usage-stat-value-red' },
      { label: 'Durée moy.', value: this._fmt(m.duration.avg), cls: 'usage-stat-value-blue', sub: m.duration.count > 0 ? `min: ${this._fmt(m.duration.min)} · max: ${this._fmt(m.duration.max)}` : '' },
    ]);
    this._renderChart(this.bodyEl, m.perDay, 'Sessions par jour');
    this._renderAgentTable(this.bodyEl, m.byAgent);
    if (this.metrics.mostModifiedFiles.length > 0) {
      this._renderFilesTable(this.bodyEl, this.metrics.mostModifiedFiles);
    }
  }

  // ===== Tokens Tab =====

  _renderTokensTab() {
    const t = this.metrics.tokens;
    if (!t || t.total === 0) {
      this.bodyEl.innerHTML = `
        <div class="usage-empty">
          <div class="usage-empty-text">Aucune donnée de tokens</div>
          <div class="usage-empty-sub">Les tokens sont lus depuis les sessions Claude (~/.claude/projects/)</div>
        </div>`;
      return;
    }
    this._renderOverviewCards(this.bodyEl, [
      { label: 'Total', value: this._fmtTokens(t.total), cls: '' },
      { label: 'Input', value: this._fmtTokens(t.totalInput), cls: 'usage-stat-value-blue' },
      { label: 'Output', value: this._fmtTokens(t.totalOutput), cls: 'usage-stat-value-green' },
      { label: 'Cache read', value: this._fmtTokens(t.totalCacheRead), cls: '', sub: t.totalCacheCreate > 0 ? `cache write: ${this._fmtTokens(t.totalCacheCreate)}` : '' },
    ]);
    this._renderTokenChart(this.bodyEl, t.perDay);
    this._renderTokenProjectTable(this.bodyEl, t.perProject);
  }

  // ===== Flows Tab =====

  _renderFlowsTab() {
    const f = this.metrics.flow;
    if (f.totalFlows === 0) {
      this.bodyEl.innerHTML = `
        <div class="usage-empty">
          <div class="usage-empty-text">Aucun flow configuré</div>
          <div class="usage-empty-sub">Créez des flows depuis la vue FLOW</div>
        </div>`;
      return;
    }
    this._renderOverviewCards(this.bodyEl, [
      { label: 'Total Runs', value: f.rate.total, cls: '' },
      { label: 'Flows actifs', value: `${f.activeFlows}/${f.totalFlows}`, cls: '' },
      { label: 'Taux succès', value: `${f.rate.rate}%`, cls: f.rate.rate >= 70 ? 'usage-stat-value-green' : 'usage-stat-value-red' },
      { label: 'Durée moy.', value: this._fmt(f.duration.avg), cls: 'usage-stat-value-blue', sub: f.duration.count > 0 ? `min: ${this._fmt(f.duration.min)} · max: ${this._fmt(f.duration.max)}` : '' },
    ]);
    this._renderChart(this.bodyEl, f.perDay, 'Runs par jour');
    this._renderFlowTable(this.bodyEl, f.flowStats);
  }

  refresh() {
    this.render();
  }

  dispose() {
    this.el.remove();
  }

  // ===== Shared rendering =====

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

  _renderFilesTable(parent, files) {
    if (!files || files.length === 0) return;

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
