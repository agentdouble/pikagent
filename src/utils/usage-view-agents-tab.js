/**
 * "Agents (Work)" tab config for UsageView.
 * Builds the cards / chart / tables descriptor consumed by the view.
 */

import { formatDuration, rateColor } from './usage-formatters.js';
import { buildTableRow, createBarCell, createRunBasedTabConfig } from './usage-view-shared.js';

function renderAgentRow(a) {
  return buildTableRow([
    { value: a.agent, className: 'usage-flow-name' },
    { value: a.totalSessions },
    { value: a.active, style: { color: a.active > 0 ? 'var(--green)' : 'var(--text-muted)' } },
    { value: `${a.successRate}%`, className: 'usage-flow-rate', style: { color: rateColor(a.successRate) } },
    { value: a.avgDuration > 0 ? formatDuration(a.avgDuration) : '—', className: 'usage-flow-duration' },
  ]);
}

function renderFileRow(maxFileCount) {
  return (file) => buildTableRow([
    { value: file.file, className: 'usage-file-name', title: file.file },
    { value: file.count, className: 'usage-file-count' },
    createBarCell((file.count / maxFileCount) * 100),
  ]);
}

function agentHeaderCards(m) {
  return [
    { label: 'Sessions', value: m.totalSessions, cls: '' },
    { label: 'En cours', value: m.activeSessions, cls: m.activeSessions > 0 ? 'usage-stat-value-green' : '' },
  ];
}

export function agentTabConfig(metrics) {
  return createRunBasedTabConfig(metrics, {
    sliceKey: 'agent',
    headerCards: agentHeaderCards,
    chartTitle: 'Sessions par jour',
    tables: (m, allMetrics) => {
      const maxFileCount = allMetrics.mostModifiedFiles[0]?.count || 1;
      return [
        { title: 'Par agent', headers: ['Agent', 'Sessions', 'Actifs', 'Succès', 'Durée moy.'], tableCls: 'usage-flow-table', data: m.byAgent, renderRow: renderAgentRow },
        { title: 'Fichiers les plus modifiés (30 jours)', headers: ['Fichier', 'Modifs', ''], tableCls: 'usage-files-table', data: allMetrics.mostModifiedFiles, renderRow: renderFileRow(maxFileCount) },
      ];
    },
  });
}
