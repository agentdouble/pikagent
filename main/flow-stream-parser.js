const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const TOOL_COLORS = {
  Read: '\x1b[36m',
  Edit: '\x1b[33m',
  Write: '\x1b[32m',
  Bash: '\x1b[35m',
  Grep: '\x1b[36m',
  Glob: '\x1b[36m',
  Agent: '\x1b[34m',
};

function toolDetail(name, input = {}) {
  switch (name) {
    case 'Read':  return input.file_path || '';
    case 'Edit':  return input.file_path || '';
    case 'Write': return input.file_path || '';
    case 'Bash':  return (input.command || '').split('\n')[0].slice(0, 120);
    case 'Grep':  return `"${input.pattern || ''}"${input.path ? ` in ${input.path}` : ''}`;
    case 'Glob':  return input.pattern || '';
    default:      return '';
  }
}

function formatToolUse(block) {
  const color = TOOL_COLORS[block.name] || '\x1b[36m';
  const detail = toolDetail(block.name, block.input);
  return `\r\n${color}${BOLD}[${block.name}]${RESET} ${DIM}${detail}${RESET}\r\n`;
}

function formatAssistant(message) {
  if (!message?.content) return '';
  let out = '';
  for (const block of message.content) {
    if (block.type === 'text' && block.text) {
      out += `\r\n${block.text.replace(/\n/g, '\r\n')}\r\n`;
    } else if (block.type === 'tool_use') {
      out += formatToolUse(block);
    }
  }
  return out;
}

function formatResult(event) {
  const ok = event.subtype === 'success';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  const label = ok ? 'Terminé' : 'Erreur';

  let line = `\r\n${BOLD}${color}── ${label}`;
  if (event.cost_usd != null) line += ` | $${event.cost_usd.toFixed(4)}`;
  if (event.duration_ms != null) line += ` | ${(event.duration_ms / 1000).toFixed(1)}s`;
  line += ` ──${RESET}\r\n`;

  if (event.result) {
    line += `\r\n${event.result.replace(/\n/g, '\r\n')}\r\n`;
  }
  return line;
}

function formatEvent(event) {
  if (event.type === 'assistant') return formatAssistant(event.message);
  if (event.type === 'result')    return formatResult(event);
  return '';
}

function createStreamParser() {
  let buffer = '';
  let _hasEvents = false;

  return {
    hasEvents() { return _hasEvents; },

    push(rawData) {
      buffer += rawData;
      const lines = buffer.split('\n');
      buffer = lines.pop();

      let output = '';
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '').trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          if (event.type) {
            _hasEvents = true;
            output += formatEvent(event);
          }
        } catch {
          // Non-JSON line – only forward after first event (possible errors)
          if (_hasEvents) output += trimmed + '\r\n';
        }
      }
      return output;
    },

    flush() {
      const rest = buffer.trim();
      buffer = '';
      if (!rest) return '';
      try {
        const event = JSON.parse(rest);
        if (event.type) { _hasEvents = true; return formatEvent(event); }
      } catch {}
      return _hasEvents ? rest + '\r\n' : '';
    },
  };
}

module.exports = { createStreamParser };
