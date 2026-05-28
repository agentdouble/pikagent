/**
 * Public entry point for UsageView tab configs.
 *
 * Implementation is split across:
 *   - usage-view-shared.js     : constants, pure helpers, factory
 *   - usage-view-agents-tab.js : agents tab
 *   - usage-view-tokens-tab.js : tokens tab
 *   - usage-view-flows-tab.js  : flows tab
 */

import { agentTabConfig } from './usage-view-agents-tab.js';
import { tokenTabConfig } from './usage-view-tokens-tab.js';
import { flowTabConfig } from './usage-view-flows-tab.js';

export { TABS, createSection, _internals } from './usage-view-shared.js';

export function getTabConfig(tabId, metrics) {
  const builders = { agents: agentTabConfig, tokens: tokenTabConfig, flows: flowTabConfig };
  return builders[tabId]?.(metrics);
}
