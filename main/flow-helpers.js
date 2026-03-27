const MS_PER_HOUR = 3_600_000;

const AGENT_COMMANDS = {
  claude: (prompt, opts = {}) =>
    opts.dangerouslySkipPermissions
      ? `claude --dangerously-skip-permissions --verbose -p '${prompt}'`
      : `claude --permission-mode auto --verbose -p '${prompt}'`,
  codex: (prompt) => `codex --approval-mode full-auto --quiet '${prompt}'`,
  opencode: (prompt) => `opencode -p '${prompt}'`,
};

function getLastRun(flow) {
  return flow.runs?.at(-1) ?? null;
}

function shouldRun(flow, now) {
  const { schedule } = flow;
  if (!schedule) return false;

  const lastRun = getLastRun(flow);

  if (schedule.type === 'interval') {
    const intervalMs = (schedule.intervalHours || 1) * MS_PER_HOUR;
    if (!lastRun) return true;
    return now.getTime() - new Date(lastRun.timestamp).getTime() >= intervalMs;
  }

  if (!schedule.time) return false;

  const [hours, minutes] = schedule.time.split(':').map(Number);
  if (now.getHours() !== hours || now.getMinutes() !== minutes) return false;

  const day = now.getDay();
  if (schedule.type === 'weekdays' && (day === 0 || day === 6)) return false;
  if (schedule.type === 'custom' && schedule.days && !schedule.days.includes(day)) return false;

  const todayStr = now.toISOString().slice(0, 10);
  return !lastRun || lastRun.date !== todayStr;
}

function buildFlowCommand(flow) {
  const escapedPrompt = flow.prompt.replace(/'/g, "'\\''");
  const agent = flow.agent || 'claude';
  const buildCmd = AGENT_COMMANDS[agent] || AGENT_COMMANDS.claude;
  return `${buildCmd(escapedPrompt, { dangerouslySkipPermissions: !!flow.dangerouslySkipPermissions })}; exit\n`;
}

module.exports = { AGENT_COMMANDS, getLastRun, shouldRun, buildFlowCommand };
