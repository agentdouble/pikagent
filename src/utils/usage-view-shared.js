/**
 * Constants, pure helpers and shared typedefs for UsageView tab configs.
 * No side-effect dependencies — safe to unit-test in isolation.
 */

import { _el } from './dom-api.js';
import { formatDuration, formatTokens, runTooltip, rateCls } from './usage-formatters.js';

// --- Tab definitions ---

export const TABS = [
  { id: 'agents', label: 'Agents (Work)' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'flows', label: 'Flows' },
];

// --- Chart segment definitions ---

export const RUN_CHART_SEGMENTS = [
  { key: 'success', cls: 'usage-chart-bar-success' },
  { key: 'error', cls: 'usage-chart-bar-error' },
  { key: 'running', cls: 'usage-chart-bar-running' },
];

export const TOKEN_CHART_SEGMENTS = [
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
export function buildTableRow(columns) {
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

export function tokenTooltip(day) {
  return `${day.label}: ${formatTokens(day.total)} (in: ${formatTokens(day.input)}, out: ${formatTokens(day.output)})`;
}

// --- Pure DOM builders ---

export function createBarCell(pct) {
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

// --- Tab config typedefs ---

/**
 * A per-tab metrics slice extracted from the full metrics object. Its shape
 * varies per tab (agent / flow / token), so it is kept as a loose record.
 * @typedef {Record<string, unknown>} MetricsSlice
 */

/**
 * @typedef {object} UsageCard
 * @property {string} label         - card label
 * @property {string|number} value  - card value
 * @property {string} cls           - CSS class applied to the value
 * @property {string} [sub]         - optional sub-text shown below the value
 */

/**
 * @typedef {object} UsageChart
 * @property {string} title                                 - chart title
 * @property {Array<Record<string, unknown>>} data          - per-day data points
 * @property {Array<{ key: string, cls: string }>} segments - stacked-bar segment definitions
 * @property {(day: Record<string, unknown>) => string} tooltip - builds the tooltip text for a day
 */

/**
 * @typedef {object} UsageTable
 * @property {string} title      - table title
 * @property {string[]} headers  - column headers
 * @property {string} tableCls   - CSS class applied to the <table>
 * @property {Array<Record<string, unknown>>} data - row data
 * @property {(row: Record<string, unknown>) => HTMLTableRowElement} renderRow - renders one <tr>
 */

/**
 * A built tab configuration.
 * @typedef {{ cards: UsageCard[], chart: UsageChart, tables: UsageTable[] }} TabConfig
 */

/**
 * An empty-state descriptor returned in place of a TabConfig.
 * @typedef {{ empty: string[] }} EmptyTabConfig
 */

// --- Shared tab-config factory ---

/**
 * Build the two run-metric cards shared by agents and flows tabs:
 * success rate + average duration (with min/max sub-text).
 */
export function runMetricCards(m) {
  return [
    { label: 'Taux succès', value: `${m.rate.rate}%`, cls: rateCls(m.rate.rate) },
    { label: 'Durée moy.', value: formatDuration(m.duration.avg), cls: 'usage-stat-value-blue', sub: m.duration.count > 0 ? `min: ${formatDuration(m.duration.min)} · max: ${formatDuration(m.duration.max)}` : '' },
  ];
}

/**
 * Options object describing the tab-specific parts of a run-based tab.
 * Consumed by {@link createRunBasedTabConfig}.
 *
 * @typedef {object} RunBasedTabOptions
 * @property {string} sliceKey - Key to extract the metrics slice (e.g. 'agent', 'flow').
 * @property {(m: MetricsSlice) => UsageCard[]} headerCards - Returns the first 2 cards specific to this tab.
 * @property {string} chartTitle - Title displayed above the chart.
 * @property {(m: MetricsSlice, metrics: Record<string, MetricsSlice>) => UsageTable[]} tables - Returns table descriptor(s).
 * @property {(m: MetricsSlice) => {empty: string[]}|null} [emptyGuard] - Optional early-return for empty state.
 */

/**
 * Factory that builds the common { cards, chart, tables } shape shared by
 * run-based tabs (agents and flows).
 *
 * Both run-based tabs follow the same pattern:
 *  1. Extract a metrics slice from the top-level metrics object.
 *  2. Build 2 tab-specific "header" cards, then append the 2 shared run-metric
 *     cards (success rate + avg duration) via runMetricCards().
 *  3. Create a daily-run chart with RUN_CHART_SEGMENTS.
 *  4. Attach one or more data tables.
 *
 * Callers only supply the parts that differ (sliceKey, headerCards, chartTitle,
 * tables builder) — everything else is handled here.
 *
 * @param {Record<string, MetricsSlice>}   metrics  The full metrics object.
 * @param {RunBasedTabOptions} options  Tab-specific configuration.
 * @returns {TabConfig | EmptyTabConfig}
 */
export function createRunBasedTabConfig(metrics, { sliceKey, headerCards, chartTitle, tables, emptyGuard }) {
  const m = metrics[sliceKey];

  if (emptyGuard) {
    const guard = emptyGuard(m);
    if (guard) return guard;
  }

  return {
    cards: [...headerCards(m), ...runMetricCards(m)],
    chart: { title: chartTitle, data: m.perDay, segments: RUN_CHART_SEGMENTS, tooltip: runTooltip },
    tables: tables(m, metrics),
  };
}

/** @internal Exposed for unit tests only. */
export const _internals = { buildTableRow };
