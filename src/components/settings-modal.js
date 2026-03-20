import { ShortcutManager } from './shortcuts.js';
import { TERMINAL_THEMES, getTerminalThemeName, setTerminalTheme, getTerminalTheme } from '../utils/terminal-themes.js';

export class SettingsModal {
  constructor(shortcutManager) {
    this.shortcutManager = shortcutManager;
    this.tabManager = null; // Set externally
    this.overlay = null;
    this.recording = null; // { actionId, index, el }
    this.activeSection = 'keybindings';
    this.build();
  }

  build() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'settings-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Modal
    this.modal = document.createElement('div');
    this.modal.className = 'settings-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'settings-header';

    const title = document.createElement('h2');
    title.className = 'settings-title';
    title.textContent = 'Settings';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    this.modal.appendChild(header);

    // Nav (sidebar)
    const body = document.createElement('div');
    body.className = 'settings-body';

    const nav = document.createElement('div');
    nav.className = 'settings-nav';

    const navKeybindings = document.createElement('div');
    navKeybindings.className = 'settings-nav-item active';
    navKeybindings.textContent = 'Keyboard Shortcuts';
    navKeybindings.addEventListener('click', () => this.showSection('keybindings'));
    nav.appendChild(navKeybindings);

    const navAppearance = document.createElement('div');
    navAppearance.className = 'settings-nav-item';
    navAppearance.textContent = 'Appearance';
    navAppearance.addEventListener('click', () => this.showSection('appearance'));
    nav.appendChild(navAppearance);

    const navConfigs = document.createElement('div');
    navConfigs.className = 'settings-nav-item';
    navConfigs.textContent = 'Workspace Configs';
    navConfigs.addEventListener('click', () => this.showSection('configs'));
    nav.appendChild(navConfigs);

    const navUsage = document.createElement('div');
    navUsage.className = 'settings-nav-item';
    navUsage.textContent = 'Usage';
    navUsage.addEventListener('click', () => this.showSection('usage'));
    nav.appendChild(navUsage);

    this.navItems = { keybindings: navKeybindings, appearance: navAppearance, configs: navConfigs, usage: navUsage };

    // Content
    this.content = document.createElement('div');
    this.content.className = 'settings-content';

    body.appendChild(nav);
    body.appendChild(this.content);
    this.modal.appendChild(body);
    this.overlay.appendChild(this.modal);

    // Keyboard listener for recording
    this.keyHandler = (e) => {
      if (!this.recording) return;
      e.preventDefault();
      e.stopPropagation();

      // Ignore lone modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

      const parts = [];
      if (e.shiftKey) parts.push('shift');
      if (e.ctrlKey) parts.push('control');
      if (e.altKey) parts.push('alt');
      if (e.metaKey) parts.push('meta');
      parts.push(e.key.toLowerCase());
      const combo = parts.join('+');

      this.finishRecording(combo);
    };
  }

  showSection(section) {
    this.activeSection = section;
    // Update nav active state
    for (const [key, el] of Object.entries(this.navItems)) {
      el.classList.toggle('active', key === section);
    }
    if (section === 'keybindings') {
      this.renderKeybindings();
    } else if (section === 'appearance') {
      this.renderAppearance();
    } else if (section === 'configs') {
      this.renderConfigs();
    } else if (section === 'usage') {
      this.renderUsage();
    }
  }

  open() {
    this.showSection(this.activeSection);
    document.body.appendChild(this.overlay);
    requestAnimationFrame(() => this.overlay.classList.add('visible'));
    window.addEventListener('keydown', this.keyHandler, true);
  }

  close() {
    this.cancelRecording();
    window.removeEventListener('keydown', this.keyHandler, true);
    this.overlay.classList.remove('visible');
    setTimeout(() => {
      if (this.overlay.parentElement) this.overlay.remove();
    }, 200);
  }

  renderAppearance() {
    this.content.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'settings-section-header';
    const headingTitle = document.createElement('h3');
    headingTitle.textContent = 'Terminal Theme';
    heading.appendChild(headingTitle);
    this.content.appendChild(heading);

    const currentThemeName = getTerminalThemeName();
    const grid = document.createElement('div');
    grid.className = 'theme-grid';

    for (const [name, theme] of Object.entries(TERMINAL_THEMES)) {
      const card = document.createElement('div');
      card.className = 'theme-card';
      if (name === currentThemeName) card.classList.add('theme-active');

      // Preview block
      const preview = document.createElement('div');
      preview.className = 'theme-preview';
      preview.style.background = theme.background;

      const colors = [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan];
      const line1 = document.createElement('div');
      line1.className = 'theme-preview-line';
      const prompt = document.createElement('span');
      prompt.textContent = '$ ';
      prompt.style.color = theme.green;
      line1.appendChild(prompt);
      const cmd = document.createElement('span');
      cmd.textContent = 'npm start';
      cmd.style.color = theme.foreground;
      line1.appendChild(cmd);
      preview.appendChild(line1);

      const line2 = document.createElement('div');
      line2.className = 'theme-preview-line';
      const arrow = document.createElement('span');
      arrow.textContent = '> ';
      arrow.style.color = theme.cyan;
      line2.appendChild(arrow);
      const msg = document.createElement('span');
      msg.textContent = 'ready';
      msg.style.color = theme.green;
      line2.appendChild(msg);
      preview.appendChild(line2);

      // Color dots
      const dots = document.createElement('div');
      dots.className = 'theme-preview-dots';
      for (const c of colors) {
        const dot = document.createElement('span');
        dot.className = 'theme-dot';
        dot.style.background = c;
        dots.appendChild(dot);
      }
      preview.appendChild(dots);

      card.appendChild(preview);

      const label = document.createElement('div');
      label.className = 'theme-card-label';
      label.textContent = name;
      card.appendChild(label);

      card.addEventListener('click', () => {
        setTerminalTheme(name);
        // Apply to all open terminals
        if (this.tabManager) {
          const newTheme = getTerminalTheme();
          for (const [, tab] of this.tabManager.tabs) {
            if (tab.terminalPanel) tab.terminalPanel.applyTheme(newTheme);
          }
        }
        this.renderAppearance();
      });

      grid.appendChild(card);
    }

    this.content.appendChild(grid);
  }

  renderKeybindings() {
    this.content.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'settings-section-header';

    const headingTitle = document.createElement('h3');
    headingTitle.textContent = 'Keyboard Shortcuts';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'settings-reset-btn';
    resetBtn.textContent = 'Reset to defaults';
    resetBtn.addEventListener('click', () => {
      this.shortcutManager.resetToDefaults();
      this.renderKeybindings();
    });

    heading.appendChild(headingTitle);
    heading.appendChild(resetBtn);
    this.content.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'keybinding-list';

    const bindings = this.shortcutManager.getBindingsList();

    for (const binding of bindings) {
      const row = document.createElement('div');
      row.className = 'keybinding-row';

      const label = document.createElement('div');
      label.className = 'keybinding-label';
      label.textContent = binding.label;

      const keysContainer = document.createElement('div');
      keysContainer.className = 'keybinding-keys';

      for (let i = 0; i < binding.keys.length; i++) {
        const keyBadge = this.createKeyBadge(binding, i);
        keysContainer.appendChild(keyBadge);
      }

      // Add binding button
      const addBtn = document.createElement('button');
      addBtn.className = 'keybinding-add-btn';
      addBtn.textContent = '+';
      addBtn.title = 'Add keybinding';
      addBtn.addEventListener('click', () => {
        const newIndex = binding.keys.length;
        binding.keys.push('');
        this.shortcutManager.updateBinding(binding.id, binding.keys);
        this.renderKeybindings();
        // Auto-start recording on the new empty slot
        const rows = list.querySelectorAll('.keybinding-row');
        // Re-render will handle it
      });
      keysContainer.appendChild(addBtn);

      row.appendChild(label);
      row.appendChild(keysContainer);
      list.appendChild(row);
    }

    this.content.appendChild(list);
  }

  createKeyBadge(binding, index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'keybinding-badge-wrapper';

    const badge = document.createElement('span');
    badge.className = 'keybinding-badge';
    badge.textContent = binding.keys[index]
      ? ShortcutManager.formatCombo(binding.keys[index])
      : 'Not set';
    if (!binding.keys[index]) badge.classList.add('unset');

    badge.addEventListener('click', () => {
      this.startRecording(binding.id, index, badge);
    });

    const removeBtn = document.createElement('span');
    removeBtn.className = 'keybinding-badge-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      binding.keys.splice(index, 1);
      this.shortcutManager.updateBinding(binding.id, binding.keys);
      this.renderKeybindings();
    });

    wrapper.appendChild(badge);
    if (binding.keys.length > 1) {
      wrapper.appendChild(removeBtn);
    }

    return wrapper;
  }

  startRecording(actionId, index, badgeEl) {
    this.cancelRecording();
    this.recording = { actionId, index, el: badgeEl };
    badgeEl.textContent = 'Press keys...';
    badgeEl.classList.add('recording');
  }

  finishRecording(combo) {
    if (!this.recording) return;

    const { actionId, index, el } = this.recording;
    this.recording = null;

    el.classList.remove('recording');
    el.textContent = ShortcutManager.formatCombo(combo);

    // Update the binding
    const bindings = this.shortcutManager.getBindingsList();
    const binding = bindings.find((b) => b.id === actionId);
    if (binding) {
      binding.keys[index] = combo;
      this.shortcutManager.updateBinding(actionId, binding.keys);
    }

    this.renderKeybindings();
  }

  cancelRecording() {
    if (this.recording) {
      this.recording.el.classList.remove('recording');
      this.recording = null;
      this.renderKeybindings();
    }
  }

  // ===== Workspace Configs Section =====

  async renderConfigs() {
    this.content.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'settings-section-header';

    const headingTitle = document.createElement('h3');
    headingTitle.textContent = 'Workspace Configs';
    heading.appendChild(headingTitle);
    this.content.appendChild(heading);

    // Current loaded config indicator
    const currentName = this.tabManager?.currentConfigName || 'Default';
    const currentBar = document.createElement('div');
    currentBar.className = 'config-current-bar';
    const currentLabel = document.createElement('span');
    currentLabel.className = 'config-current-label';
    currentLabel.textContent = 'Config chargée :';
    currentBar.appendChild(currentLabel);
    const currentValue = document.createElement('span');
    currentValue.className = 'config-current-value';
    currentValue.textContent = currentName;
    currentBar.appendChild(currentValue);
    this.content.appendChild(currentBar);

    // Config list with radio-style selection
    const configs = await window.api.config.list();

    const list = document.createElement('div');
    list.className = 'config-list';

    for (const config of configs) {
      const row = document.createElement('div');
      row.className = 'config-row';
      const isCurrent = config.name === currentName;
      if (isCurrent) row.classList.add('config-active');

      // Radio + name
      const left = document.createElement('div');
      left.className = 'config-row-left';

      const radio = document.createElement('span');
      radio.className = 'config-radio';
      if (config.isDefault) radio.classList.add('config-radio-default');
      left.appendChild(radio);

      const info = document.createElement('div');
      info.className = 'config-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'config-name';
      nameEl.textContent = config.name;
      if (config.isDefault) {
        const defaultTag = document.createElement('span');
        defaultTag.className = 'config-default-tag';
        defaultTag.textContent = 'default';
        nameEl.appendChild(defaultTag);
      }
      info.appendChild(nameEl);

      const meta = document.createElement('span');
      meta.className = 'config-meta';
      const tabCount = config.tabCount || 0;
      const date = config.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : '';
      meta.textContent = `${tabCount} tab${tabCount !== 1 ? 's' : ''} · ${date}`;
      info.appendChild(meta);

      left.appendChild(info);

      // Click row to load
      row.addEventListener('click', async () => {
        const data = await window.api.config.load(config.name);
        if (data && this.tabManager) {
          await this.tabManager.restoreConfig(data);
          this.tabManager.currentConfigName = config.name;
          this.renderConfigs();
        }
      });

      // Actions (shown on hover)
      const actions = document.createElement('div');
      actions.className = 'config-actions';

      // Set default
      if (!config.isDefault) {
        const defaultBtn = document.createElement('button');
        defaultBtn.className = 'config-action-btn';
        defaultBtn.textContent = 'Set Default';
        defaultBtn.title = 'Charger au démarrage';
        defaultBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.api.config.setDefault(config.name);
          this.renderConfigs();
        });
        actions.appendChild(defaultBtn);
      }

      // Overwrite
      const overwriteBtn = document.createElement('button');
      overwriteBtn.className = 'config-action-btn';
      overwriteBtn.textContent = 'Overwrite';
      overwriteBtn.title = 'Écraser avec le workspace actuel';
      overwriteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!this.tabManager) return;
        const data = this.tabManager.serialize();
        await window.api.config.save(config.name, data);
        this.renderConfigs();
      });
      actions.appendChild(overwriteBtn);

      // Delete
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'config-action-btn config-delete-btn';
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.config.delete(config.name);
        this.renderConfigs();
      });
      actions.appendChild(deleteBtn);

      row.appendChild(left);
      row.appendChild(actions);
      list.appendChild(row);
    }

    this.content.appendChild(list);

    // Bottom actions: New Config + Duplicate Current
    const bottomActions = document.createElement('div');
    bottomActions.className = 'config-bottom-actions';

    const newBtn = document.createElement('button');
    newBtn.className = 'config-bottom-btn';
    newBtn.textContent = 'New Config...';
    newBtn.addEventListener('click', () => this._promptNewConfig());
    bottomActions.appendChild(newBtn);

    const dupBtn = document.createElement('button');
    dupBtn.className = 'config-bottom-btn';
    dupBtn.textContent = 'Duplicate Current...';
    dupBtn.addEventListener('click', () => this._duplicateCurrent());
    bottomActions.appendChild(dupBtn);

    this.content.appendChild(bottomActions);
  }

  _promptNewConfig() {
    const name = prompt('Nom de la nouvelle config :');
    if (!name || !name.trim()) return;
    if (!this.tabManager) return;
    const data = this.tabManager.serialize();
    window.api.config.save(name.trim(), data).then(() => {
      this.tabManager.currentConfigName = name.trim();
      this.renderConfigs();
    });
  }

  _duplicateCurrent() {
    const currentName = this.tabManager?.currentConfigName || 'Default';
    const newName = prompt('Nom de la copie :', `${currentName} (copy)`);
    if (!newName || !newName.trim()) return;
    if (!this.tabManager) return;
    const data = this.tabManager.serialize();
    window.api.config.save(newName.trim(), data).then(() => {
      this.tabManager.currentConfigName = newName.trim();
      this.renderConfigs();
    });
  }

  // ===== Usage Dashboard Section =====

  async renderUsage() {
    this.content.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'settings-section-header';
    const headingTitle = document.createElement('h3');
    headingTitle.textContent = 'Usage Dashboard';
    heading.appendChild(headingTitle);
    this.content.appendChild(heading);

    // Loading state
    const loading = document.createElement('div');
    loading.className = 'usage-empty';
    loading.innerHTML = '<div class="usage-empty-text">Chargement des métriques...</div>';
    this.content.appendChild(loading);

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
      this.content.appendChild(empty);
      return;
    }

    this._renderOverviewCards(metrics);
    this._renderSuccessRate(metrics);
    this._renderRunsChart(metrics);
    this._renderFlowStats(metrics);
    this._renderMostModifiedFiles(metrics);
  }

  _renderOverviewCards(metrics) {
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

    this.content.appendChild(overview);
  }

  _renderSuccessRate(metrics) {
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
      durTitle.textContent = 'Durée d\'exécution';
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

    this.content.appendChild(section);
  }

  _renderRunsChart(metrics) {
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

      // Show label every 5 days
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
    this.content.appendChild(section);
  }

  _renderFlowStats(metrics) {
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
    this.content.appendChild(section);
  }

  _renderMostModifiedFiles(metrics) {
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
    this.content.appendChild(section);
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
