/**
 * "Tokens" tab config for UsageView.
 * Builds the cards / chart / tables descriptor consumed by the view.
 */

import { formatTokens } from './usage-formatters.js';
import {
  buildTableRow,
  createBarCell,
  TOKEN_CHART_SEGMENTS,
  tokenTooltip,
} from './usage-view-shared.js';

function tokenCards(t) {
  return [
    { label: 'Total', value: formatTokens(t.total), cls: '' },
    { label: 'Input', value: formatTokens(t.totalInput), cls: 'usage-stat-value-blue' },
    { label: 'Output', value: formatTokens(t.totalOutput), cls: 'usage-stat-value-green' },
    { label: 'Cache read', value: formatTokens(t.totalCacheRead), cls: '', sub: t.totalCacheCreate > 0 ? `cache write: ${formatTokens(t.totalCacheCreate)}` : '' },
  ];
}

function renderProjectRow(maxProjectTotal) {
  return (proj) => buildTableRow([
    { value: proj.project, className: 'usage-file-name' },
    { value: formatTokens(proj.input), className: 'usage-file-count', style: { color: 'var(--blue)' } },
    { value: formatTokens(proj.output), className: 'usage-file-count', style: { color: 'var(--green)' } },
    { value: formatTokens(proj.total), className: 'usage-file-count' },
    createBarCell((proj.total / maxProjectTotal) * 100),
  ]);
}

export function tokenTabConfig(metrics) {
  const t = metrics.tokens;
  if (!t || t.total === 0) {
    return { empty: ['Aucune donnée de tokens', 'Les tokens sont lus depuis les sessions Claude (~/.claude/projects/)'] };
  }
  const maxProjectTotal = t.perProject?.[0]?.total || 1;
  return {
    cards: tokenCards(t),
    chart: { title: 'Tokens par jour (30 derniers jours)', data: t.perDay, segments: TOKEN_CHART_SEGMENTS, tooltip: tokenTooltip },
    tables: [
      { title: 'Par projet', headers: ['Projet', 'Input', 'Output', 'Total', ''], tableCls: 'usage-files-table', data: t.perProject, renderRow: renderProjectRow(maxProjectTotal) },
    ],
  };
}
