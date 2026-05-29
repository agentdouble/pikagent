/**
 * "Flows" tab config for UsageView.
 * Builds the cards / chart / tables descriptor consumed by the view.
 */

import { _el } from './dom-api.js';
import { formatDuration, rateColor } from './usage-formatters.js';
import { buildTableRow, createRunBasedTabConfig } from './usage-view-shared.js';

function flowNameCell(flow) {
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

function renderFlowRow(flow) {
  return buildTableRow([
    flowNameCell(flow),
    { value: flow.totalRuns },
    { value: `${flow.successRate}%`, className: 'usage-flow-rate', style: { color: rateColor(flow.successRate) } },
    { value: flow.avgDuration > 0 ? formatDuration(flow.avgDuration) : '—', className: 'usage-flow-duration' },
  ]);
}

function flowHeaderCards(f) {
  return [
    { label: 'Total Runs', value: f.rate.total, cls: '' },
    { label: 'Flows actifs', value: `${f.activeFlows}/${f.totalFlows}`, cls: '' },
  ];
}

export function flowTabConfig(metrics) {
  return createRunBasedTabConfig(metrics, {
    sliceKey: 'flow',
    headerCards: flowHeaderCards,
    chartTitle: 'Runs par jour',
    emptyGuard: (f) => f.totalFlows === 0
      ? { empty: ['Aucun flow configuré', 'Créez des flows depuis la vue FLOW'] }
      : null,
    tables: (f) => [
      { title: 'Par flow', headers: ['Flow', 'Runs', 'Succès', 'Durée moy.'], tableCls: 'usage-flow-table', data: f.flowStats, renderRow: renderFlowRow },
    ],
  });
}
