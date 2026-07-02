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

function formatPercent(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function remainingClass(limit) {
  if ((limit?.remainingPercent || 0) <= 20) return 'usage-stat-value-red';
  if ((limit?.remainingPercent || 0) <= 50) return 'usage-stat-value-blue';
  return 'usage-stat-value-green';
}

function limitByKey(codexUsage, key) {
  return codexUsage?.limits?.find((limit) => limit.key === key) || null;
}

function codexUsageCards(codexUsage) {
  if (!codexUsage?.available) return [];
  const primary = limitByKey(codexUsage, 'primary');
  const weekly = limitByKey(codexUsage, 'secondary');
  return [
    primary && {
      label: `Codex ${primary.label}`,
      value: formatPercent(primary.remainingPercent),
      cls: remainingClass(primary),
      sub: `restant · reset ${formatDateTime(primary.resetsAt)}`,
    },
    weekly && {
      label: 'Codex hebdo',
      value: formatPercent(weekly.remainingPercent),
      cls: remainingClass(weekly),
      sub: `restant · reset ${formatDateTime(weekly.resetsAt)}`,
    },
    codexUsage.totalTokenUsage?.totalTokens > 0 && {
      label: 'Session Codex',
      value: formatTokens(codexUsage.totalTokenUsage.totalTokens),
      cls: '',
      sub: `dernier relevé ${formatDateTime(codexUsage.sampledAt)}`,
    },
  ].filter(Boolean);
}

function tokenCards(t, codexUsage) {
  const cacheParts = [
    t.totalCacheRead > 0 ? `cache read: ${formatTokens(t.totalCacheRead)}` : '',
    t.totalCacheCreate > 0 ? `cache write: ${formatTokens(t.totalCacheCreate)}` : '',
  ].filter(Boolean);
  return [
    { label: 'Total', value: formatTokens(t.total), cls: '', sub: cacheParts.join(' · ') },
    { label: 'Input', value: formatTokens(t.totalInput), cls: 'usage-stat-value-blue' },
    { label: 'Output', value: formatTokens(t.totalOutput), cls: 'usage-stat-value-green' },
    { label: 'Sessions logs', value: formatTokens(t.sessionTotal || 0), cls: '', sub: `${t.sessionCount || 0} runs détectés` },
    ...codexUsageCards(codexUsage),
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

function renderCodexLimitRow(limit, codexUsage) {
  return buildTableRow([
    { value: limit.label, className: 'usage-file-name' },
    { value: formatPercent(limit.usedPercent), className: 'usage-file-count' },
    { value: formatPercent(limit.remainingPercent), className: 'usage-file-count', style: { color: limit.remainingPercent <= 20 ? 'var(--red)' : 'var(--green)' } },
    { value: formatDateTime(limit.resetsAt), className: 'usage-file-name' },
    { value: codexUsage.planType || '—', className: 'usage-file-name' },
  ]);
}

export function tokenTabConfig(metrics) {
  const t = metrics.tokens;
  const codexUsage = metrics.codexUsage;
  if (!t || (t.total === 0 && !t.sessionTotal && !codexUsage?.available)) {
    return { empty: ['Aucune donnée de tokens', 'Les tokens sont lus depuis les sessions Claude (~/.claude/projects/)'] };
  }
  const maxProjectTotal = t.perProject?.[0]?.total || 1;
  const maxConsumerTotal = t.perTokenConsumer?.[0]?.total || 1;
  const maxSessionTotal = t.perTokenSession?.[0]?.total || 1;
  const tables = [
    codexUsage?.available && { title: 'Limites Codex', headers: ['Fenêtre', 'Utilisé', 'Restant', 'Reset', 'Plan'], tableCls: 'usage-files-table', data: codexUsage.limits, renderRow: (limit) => renderCodexLimitRow(limit, codexUsage) },
    { title: 'Par projet', headers: ['Projet', 'Input', 'Output', 'Total', ''], tableCls: 'usage-files-table', data: t.perProject, renderRow: renderProjectRow(maxProjectTotal) },
    { title: 'Plus gros consommateurs logs', headers: ['Agent / node', 'Source', 'Runs', 'Total', ''], tableCls: 'usage-files-table', data: t.perTokenConsumer, renderRow: renderConsumerRow(maxConsumerTotal) },
    { title: 'Sessions les plus coûteuses', headers: ['Session', 'Agent / node', 'Source', 'Tokens', ''], tableCls: 'usage-files-table', data: t.perTokenSession, renderRow: renderSessionRow(maxSessionTotal) },
  ].filter(Boolean);
  return {
    cards: tokenCards(t, codexUsage),
    chart: { title: 'Tokens par jour (30 derniers jours)', data: t.perDay, segments: TOKEN_CHART_SEGMENTS, tooltip: tokenTooltip },
    tables,
  };
}
