/**
 * Pure constants and helpers extracted from UsageView.
 * No side-effect dependencies — safe to unit-test in isolation.
 */

import { _el } from './dom.js';
import { formatTokens } from './usage-formatters.js';

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

export function _td(text, attrs = {}) {
  return _el('td', { ...attrs, textContent: text });
}

export function tokenTooltip(day) {
  return `${day.label}: ${formatTokens(day.total)} (in: ${formatTokens(day.input)}, out: ${formatTokens(day.output)})`;
}
