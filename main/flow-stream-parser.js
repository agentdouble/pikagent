const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// Strip ANSI escape sequences injected by the PTY shell around JSON lines
const ANSI_RE = /\x1b\[[\d;?]*[a-zA-Z~]|\x1b\][^\x07]*\x07|\x1b[()][B012]/g;
function stripAnsi(str) { return str.replace(ANSI_RE, ''); }

const TOOL_CONFIG = {
  Read:  { color: '\x1b[36m', detail: (i) => i.file_path || '' },
  Edit:  { color: '\x1b[33m', detail: (i) => i.file_path || '' },
  Write: { color: '\x1b[32m', detail: (i) => i.file_path || '' },
  Bash:  { color: '\x1b[35m', detail: (i) => (i.command || '').split('\n')[0].slice(0, 120) },
  Grep:  { color: '\x1b[36m', detail: (i) => `"${i.pattern || ''}"${i.path ? ` in ${i.path}` : ''}` },
  Glob:  { color: '\x1b[36m', detail: (i) => i.pattern || '' },
  Agent: { color: '\x1b[34m', detail: () => '' },
};

const DEFAULT_TOOL_COLOR = '\x1b[36m';

function formatToolUse(block) {
  const cfg = TOOL_CONFIG[block.name];
  const color = cfg?.color || DEFAULT_TOOL_COLOR;
  const detail = cfg?.detail(block.input || {}) ?? '';
  return `\r\n${color}${BOLD}[${block.name}]${RESET} ${DIM}${detail}${RESET}\r\n`;
}

/** Declarative map: message content block type → formatter function. */
const BLOCK_FORMATTERS = {
  text:     (block) => block.text ? `\r\n${block.text.replace(/\n/g, '\r\n')}\r\n` : '',
  tool_use: formatToolUse,
};

function formatAssistant(message) {
  if (!message?.content) return '';
  return message.content.reduce((out, block) => out + (BLOCK_FORMATTERS[block.type]?.(block) || ''), '');
}

/** Declarative map: result subtype → ANSI color and display label. */
const RESULT_SUBTYPE_CONFIG = {
  success: { color: '\x1b[32m', label: 'Terminé' },
};
const RESULT_SUBTYPE_DEFAULT = { color: '\x1b[31m', label: 'Erreur' };

/** Declarative array: optional result statistics appended to the status line. */
const RESULT_STATS = [
  { key: 'cost_usd',    format: (v) => `$${v.toFixed(4)}` },
  { key: 'duration_ms', format: (v) => `${(v / 1000).toFixed(1)}s` },
];

function formatResult(event) {
  const { color, label } = RESULT_SUBTYPE_CONFIG[event.subtype] || RESULT_SUBTYPE_DEFAULT;
  const stats = RESULT_STATS
    .filter(({ key }) => event[key] != null)
    .map(({ key, format }) => format(event[key]));

  let line = `\r\n${BOLD}${color}── ${label}`;
  if (stats.length) line += ` | ${stats.join(' | ')}`;
  line += ` ──${RESET}\r\n`;

  if (event.result) {
    line += `\r\n${event.result.replace(/\n/g, '\r\n')}\r\n`;
  }
  return line;
}

const EVENT_FORMATTERS = {
  assistant: (e) => formatAssistant(e.message),
  result:    (e) => formatResult(e),
};

function formatEvent(event) {
  return EVENT_FORMATTERS[event.type]?.(event) || '';
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
        const trimmed = stripAnsi(line.replace(/\r$/, '')).trim();
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
      const rest = stripAnsi(buffer).trim();
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
