/**
 * Canonical agent registry — single source of truth for the list of
 * supported agents.  CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 */

const AGENTS = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'opencode', label: 'OpenCode' },
];

/** @type {string[]} e.g. ['claude', 'codex', 'opencode'] */
const AGENT_IDS = AGENTS.map((a) => a.id);

/** @type {Record<string, string>} e.g. { claude: 'Claude', … } */
const AGENT_OPTIONS = Object.fromEntries(AGENTS.map((a) => [a.id, a.label]));

module.exports = { AGENTS, AGENT_IDS, AGENT_OPTIONS };
