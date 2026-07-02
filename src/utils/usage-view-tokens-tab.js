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
  const cacheParts = [
    t.totalCacheRead > 0 ? `cache read: ${formatTokens(t.totalCacheRead)}` : '',
    t.totalCacheCreate > 0 ? `cache write: ${formatTokens(t.totalCacheCreate)}` : '',
  ].filter(Boolean);
  return [
    { label: 'Total', value: formatTokens(t.total), cls: '', sub: cacheParts.join(' · ') },
    { label: 'Input', value: formatTokens(t.totalInput), cls: 'usage-stat-value-blue' },
    { label: 'Output', value: formatTokens(t.totalOutput), cls: 'usage-stat-value-green' },
    { label: 'Sessions logs', value: formatTokens(t.sessionTotal || 0), cls: '', sub: `${t.sessionCount || 0} runs détectés` },
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

function renderConsumerRow(maxConsumerTotal) {
  return (consumer) => buildTableRow([
    { value: consumer.label, className: 'usage-file-name', title: consumer.consumerKey },
    { value: consumer.source, className: 'usage-file-name' },
    { value: consumer.runs, className: 'usage-file-count' },
    { value: formatTokens(consumer.total), className: 'usage-file-count' },
    createBarCell((consumer.total / maxConsumerTotal) * 100),
  ]);
}

function shortSessionId(sessionId) {
  if (!sessionId) return 'session inconnue';
  return sessionId.length > 13 ? `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}` : sessionId;
}

function renderSessionRow(maxSessionTotal) {
  return (session) => buildTableRow([
    { value: shortSessionId(session.sessionId), className: 'usage-file-name', title: session.sessionId || session.logFile || '' },
    { value: session.label, className: 'usage-file-name', title: session.logFile || session.consumerKey },
    { value: session.source, className: 'usage-file-name' },
    { value: formatTokens(session.total), className: 'usage-file-count' },
    createBarCell((session.total / maxSessionTotal) * 100),
  ]);
}

export function tokenTabConfig(metrics) {
  const t = metrics.tokens;
  if (!t || (t.total === 0 && !t.sessionTotal)) {
    return { empty: ['Aucune donnée de tokens', 'Les tokens sont lus depuis les sessions Claude (~/.claude/projects/)'] };
  }
  const maxProjectTotal = t.perProject?.[0]?.total || 1;
  const maxConsumerTotal = t.perTokenConsumer?.[0]?.total || 1;
  const maxSessionTotal = t.perTokenSession?.[0]?.total || 1;
  return {
    cards: tokenCards(t),
    chart: { title: 'Tokens par jour (30 derniers jours)', data: t.perDay, segments: TOKEN_CHART_SEGMENTS, tooltip: tokenTooltip },
    tables: [
      { title: 'Par projet', headers: ['Projet', 'Input', 'Output', 'Total', ''], tableCls: 'usage-files-table', data: t.perProject, renderRow: renderProjectRow(maxProjectTotal) },
      { title: 'Plus gros consommateurs logs', headers: ['Agent / node', 'Source', 'Runs', 'Total', ''], tableCls: 'usage-files-table', data: t.perTokenConsumer, renderRow: renderConsumerRow(maxConsumerTotal) },
      { title: 'Sessions les plus coûteuses', headers: ['Session', 'Agent / node', 'Source', 'Tokens', ''], tableCls: 'usage-files-table', data: t.perTokenSession, renderRow: renderSessionRow(maxSessionTotal) },
    ],
  };
}
