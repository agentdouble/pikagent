/**
 * Pure constants and helpers extracted from UsageView.
 * No side-effect dependencies — safe to unit-test in isolation.
 */

import { _el } from './dom-facades.js';
import { formatDuration, formatTokens, runTooltip, rateColor, rateCls } from './usage-formatters.js';

// --- Tab definitions ---

export const TABS = [
  { id: 'agents', label: 'Agents (Work)' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'flows', label: 'Flows' },
];

// --- Chart segment definitions ---

const RUN_CHART_SEGMENTS = [
  { key: 'success', cls: 'usage-chart-bar-success' },
  { key: 'error', cls: 'usage-chart-bar-error' },
  { key: 'running', cls: 'usage-chart-bar-running' },
];

const TOKEN_CHART_SEGMENTS = [
  { key: 'input', cls: 'usage-chart-bar-running' },
  { key: 'output', cls: 'usage-chart-bar-success' },
];

// --- Helpers ---

function _td(text, attrs = {}) {
  return _el('td', { ...attrs, textContent: text });
}

/**
 * Build a <tr> from an array of column descriptors.
 *
 * Each entry can be:
 *   - A DOM Node (inserted as-is into the row)
 *   - An object { value, className?, style?, title? } → converted via _td()
 *
 * @param {Array<Node | { value: string|number, className?: string, style?: Record<string, string>, title?: string }>} columns
 * @returns {HTMLTableRowElement}
 */
function buildTableRow(columns) {
  const cells = columns.map((col) => {
    if (col instanceof Node) return col;
    const attrs = {};
    if (col.className) attrs.className = col.className;
    if (col.style) attrs.style = col.style;
    if (col.title) attrs.title = col.title;
    return _td(col.value, attrs);
  });
  return _el('tr', {}, ...cells);
}

function tokenTooltip(day) {
  return `${day.label}: ${formatTokens(day.total)} (in: ${formatTokens(day.input)}, out: ${formatTokens(day.output)})`;
}

// --- Pure DOM builders ---

function createBarCell(pct) {
  return _el('td', { className: 'usage-file-bar-cell' },
    _el('div', { className: 'usage-file-bar' },
      _el('div', { className: 'usage-file-bar-fill', style: { width: `${pct}%` } }),
    ),
  );
}

export function createSection(title) {
  return _el('div', { className: 'usage-section' },
    _el('div', { className: 'usage-section-title', textContent: title }),
  );
}

// --- Tab configurations ---

/**
 * Build the two run-metric cards shared by agents and flows tabs:
 * success rate + average duration (with min/max sub-text).
 */
function _runMetricCards(m) {
  return [
    { label: 'Taux succès', value: `${m.rate.rate}%`, cls: rateCls(m.rate.rate) },
    { label: 'Durée moy.', value: formatDuration(m.duration.avg), cls: 'usage-stat-value-blue', sub: m.duration.count > 0 ? `min: ${formatDuration(m.duration.min)} · max: ${formatDuration(m.duration.max)}` : '' },
  ];
}

/**
 * Factory that builds the common { cards, chart, tables } shape shared by
 * run-based tabs (agents and flows).
 *
 * @param {object}   m               The metrics slice (metrics.agent or metrics.flow).
 * @param {object}   options
 * @param {Array<{label: string, value: string|number, cls: string, sub?: string}>} options.cards Four card descriptors (label/value/cls/sub).
 * @param {string}   options.chartTitle  Title displayed above the chart.
 * @param {Array<{title: string, headers: string[], tableCls: string, data: Array<object>, renderRow: (item: object) => HTMLTableRowElement}>} options.tables One or more table descriptors.
 * @returns {{ cards: Array, chart: object, tables: Array }}
 */
function _createRunBasedTabConfig(m, { cards, chartTitle, tables }) {
  return {
    cards,
    chart: { title: chartTitle, data: m.perDay, segments: RUN_CHART_SEGMENTS, tooltip: runTooltip },
    tables,
  };
}

export function getTabConfig(tabId, metrics) {
  const builders = { agents: _agentTabConfig, tokens: _tokenTabConfig, flows: _flowTabConfig };
  return builders[tabId]?.(metrics);
}

function _renderAgentRow(a) {
  return buildTableRow([
    { value: a.agent, className: 'usage-flow-name' },
    { value: a.totalSessions },
    { value: a.active, style: { color: a.active > 0 ? 'var(--green)' : 'var(--text-muted)' } },
    { value: `${a.successRate}%`, className: 'usage-flow-rate', style: { color: rateColor(a.successRate) } },
    { value: a.avgDuration > 0 ? formatDuration(a.avgDuration) : '\u2014', className: 'usage-flow-duration' },
  ]);
}

function _renderFileRow(maxFileCount) {
  return (file) => buildTableRow([
    { value: file.file, className: 'usage-file-name', title: file.file },
    { value: file.count, className: 'usage-file-count' },
    createBarCell((file.count / maxFileCount) * 100),
  ]);
}

function _agentSessionCards(m) {
  return [
    { label: 'Sessions', value: m.totalSessions, cls: '' },
    { label: 'En cours', value: m.activeSessions, cls: m.activeSessions > 0 ? 'usage-stat-value-green' : '' },
    ..._runMetricCards(m),
  ];
}

function _agentTabConfig(metrics) {
  const m = metrics.agent;
  const maxFileCount = metrics.mostModifiedFiles[0]?.count || 1;
  return _createRunBasedTabConfig(m, {
    cards: _agentSessionCards(m),
    chartTitle: 'Sessions par jour',
    tables: [
      { title: 'Par agent', headers: ['Agent', 'Sessions', 'Actifs', 'Succès', 'Durée moy.'], tableCls: 'usage-flow-table', data: m.byAgent, renderRow: _renderAgentRow },
      { title: 'Fichiers les plus modifiés (30 jours)', headers: ['Fichier', 'Modifs', ''], tableCls: 'usage-files-table', data: metrics.mostModifiedFiles, renderRow: _renderFileRow(maxFileCount) },
    ],
  });
}

function _tokenCards(t) {
  return [
    { label: 'Total', value: formatTokens(t.total), cls: '' },
    { label: 'Input', value: formatTokens(t.totalInput), cls: 'usage-stat-value-blue' },
    { label: 'Output', value: formatTokens(t.totalOutput), cls: 'usage-stat-value-green' },
    { label: 'Cache read', value: formatTokens(t.totalCacheRead), cls: '', sub: t.totalCacheCreate > 0 ? `cache write: ${formatTokens(t.totalCacheCreate)}` : '' },
  ];
}

function _renderProjectRow(maxProjectTotal) {
  return (proj) => buildTableRow([
    { value: proj.project, className: 'usage-file-name' },
    { value: formatTokens(proj.input), className: 'usage-file-count', style: { color: 'var(--blue)' } },
    { value: formatTokens(proj.output), className: 'usage-file-count', style: { color: 'var(--green)' } },
    { value: formatTokens(proj.total), className: 'usage-file-count' },
    createBarCell((proj.total / maxProjectTotal) * 100),
  ]);
}

function _tokenTabConfig(metrics) {
  const t = metrics.tokens;
  if (!t || t.total === 0) {
    return { empty: ['Aucune donnée de tokens', 'Les tokens sont lus depuis les sessions Claude (~/.claude/projects/)'] };
  }
  const maxProjectTotal = t.perProject?.[0]?.total || 1;
  return {
    cards: _tokenCards(t),
    chart: { title: 'Tokens par jour (30 derniers jours)', data: t.perDay, segments: TOKEN_CHART_SEGMENTS, tooltip: tokenTooltip },
    tables: [
      { title: 'Par projet', headers: ['Projet', 'Input', 'Output', 'Total', ''], tableCls: 'usage-files-table', data: t.perProject, renderRow: _renderProjectRow(maxProjectTotal) },
    ],
  };
}

/** @internal Exposed for unit tests only. */
export const _internals = { buildTableRow };

function _flowNameCell(flow) {
  return _el('td', {},
    _el('span', {
      className: `usage-flow-name ${!flow.enabled ? 'usage-flow-disabled' : ''}`,
      textContent: flow.name,
    }),
    !flow.enabled && _el('span', {
      style: { fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' },
      textContent: '(désactivé)',
    }),
  );
}

function _renderFlowRow(flow) {
  return buildTableRow([
    _flowNameCell(flow),
    { value: flow.totalRuns },
    { value: `${flow.successRate}%`, className: 'usage-flow-rate', style: { color: rateColor(flow.successRate) } },
    { value: flow.avgDuration > 0 ? formatDuration(flow.avgDuration) : '\u2014', className: 'usage-flow-duration' },
  ]);
}

function _flowCards(f) {
  return [
    { label: 'Total Runs', value: f.rate.total, cls: '' },
    { label: 'Flows actifs', value: `${f.activeFlows}/${f.totalFlows}`, cls: '' },
    ..._runMetricCards(f),
  ];
}

function _flowTabConfig(metrics) {
  const f = metrics.flow;
  if (f.totalFlows === 0) {
    return { empty: ['Aucun flow configuré', 'Créez des flows depuis la vue FLOW'] };
  }
  return _createRunBasedTabConfig(f, {
    cards: _flowCards(f),
    chartTitle: 'Runs par jour',
    tables: [
      { title: 'Par flow', headers: ['Flow', 'Runs', 'Succès', 'Durée moy.'], tableCls: 'usage-flow-table', data: f.flowStats, renderRow: _renderFlowRow },
    ],
  });
}
