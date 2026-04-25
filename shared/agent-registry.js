/**
 * Single source of truth for supported agents.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 */

const AGENTS = [
  {
    id: 'claude',
    label: 'Claude',
    permModes: ['--permission-mode auto', '--dangerously-skip-permissions'],
    flags: '--output-format stream-json',
    promptPrefix: '-p',
    skipPermConfig: { label: 'Skip permissions', title: 'Lance Claude avec --dangerously-skip-permissions' },
  },
  {
    id: 'codex',
    label: 'Codex',
    permModes: ['--approval-mode auto-edit', '--approval-mode full-auto'],
    flags: '--quiet',
    skipPermConfig: { label: 'Full auto', title: 'Lance Codex avec --approval-mode full-auto au lieu de auto-edit' },
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    promptPrefix: '-p',
  },
];

/* ── Derived structures ──────────────────────────────────────────── */

/** { claude: { permModes, flags, promptPrefix }, ... } */
const AGENT_CONFIG = Object.fromEntries(
  AGENTS.map(({ id, permModes, flags, promptPrefix }) => [
    id,
    {
      ...(permModes && { permModes }),
      ...(flags && { flags }),
      ...(promptPrefix && { promptPrefix }),
    },
  ]),
);

/** { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode' } */
const AGENT_OPTIONS = Object.fromEntries(
  AGENTS.map(({ id, label }) => [id, label]),
);

/** [['claude','Claude'], ['codex','Codex'], ['opencode','OpenCode']] */
const KNOWN_AGENTS = AGENTS.map(({ id, label }) => [id, label]);

/** { claude: { label, title }, codex: { label, title } } */
const SKIP_PERM_CONFIG = Object.fromEntries(
  AGENTS.filter((a) => a.skipPermConfig).map(({ id, skipPermConfig }) => [id, skipPermConfig]),
);

module.exports = {
  AGENTS,
  AGENT_CONFIG,
  AGENT_OPTIONS,
  KNOWN_AGENTS,
  SKIP_PERM_CONFIG,
};
