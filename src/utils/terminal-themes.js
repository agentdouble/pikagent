const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

function _buildTheme(chrome, ansi, bright) {
  const t = {
    background: chrome[0], foreground: chrome[1], cursor: chrome[2],
    cursorAccent: chrome[3], selectionBackground: chrome[4],
  };
  for (let i = 0; i < ANSI.length; i++) {
    t[ANSI[i]] = ansi[i];
    t[`bright${ANSI[i][0].toUpperCase()}${ANSI[i].slice(1)}`] = bright[i];
  }
  return t;
}

// Single source of truth: each theme declares its colors AND its mode.
// TERMINAL_THEMES and light-theme detection are both derived from this table.
const THEME_DEFS = [
  { name: 'Pikagent',
    chrome: ['#1a1a2e', '#e0e0e0', '#e0e0e0', '#1a1a2e', '#3a3a5e'],
    ansi:   ['#1a1a2e', '#ff6b6b', '#51cf66', '#ffd43b', '#74c0fc', '#da77f2', '#66d9e8', '#e0e0e0'],
    bright: ['#555577', '#ff8787', '#69db7c', '#ffe066', '#91d5ff', '#e599f7', '#99e9f2', '#ffffff'] },
  { name: 'Dracula',
    chrome: ['#282a36', '#f8f8f2', '#f8f8f2', '#282a36', '#44475a'],
    ansi:   ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'],
    bright: ['#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'] },
  { name: 'One Dark',
    chrome: ['#282c34', '#abb2bf', '#528bff', '#282c34', '#3e4451'],
    ansi:   ['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf'],
    bright: ['#5c6370', '#be5046', '#98c379', '#d19a66', '#61afef', '#c678dd', '#56b6c2', '#ffffff'] },
  { name: 'Nord',
    chrome: ['#2e3440', '#d8dee9', '#d8dee9', '#2e3440', '#434c5e'],
    ansi:   ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0'],
    bright: ['#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4'] },
  { name: 'Tokyo Night',
    chrome: ['#1a1b26', '#c0caf5', '#c0caf5', '#1a1b26', '#33467c'],
    ansi:   ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'],
    bright: ['#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5'] },
  { name: 'Catppuccin Mocha',
    chrome: ['#1e1e2e', '#cdd6f4', '#f5e0dc', '#1e1e2e', '#45475a'],
    ansi:   ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'],
    bright: ['#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8'] },
  { name: 'Solarized Dark',
    chrome: ['#002b36', '#839496', '#839496', '#002b36', '#073642'],
    ansi:   ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
    bright: ['#586e75', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'] },
  { name: 'Gruvbox Dark',
    chrome: ['#282828', '#ebdbb2', '#ebdbb2', '#282828', '#504945'],
    ansi:   ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984'],
    bright: ['#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2'] },
  { name: 'Monokai',
    chrome: ['#272822', '#f8f8f2', '#f8f8f0', '#272822', '#49483e'],
    ansi:   ['#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2'],
    bright: ['#75715e', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f9f8f5'] },
  { name: 'GitHub Dark',
    chrome: ['#0d1117', '#c9d1d9', '#c9d1d9', '#0d1117', '#264f78'],
    ansi:   ['#0d1117', '#ff7b72', '#7ee787', '#d29922', '#79c0ff', '#d2a8ff', '#a5d6ff', '#c9d1d9'],
    bright: ['#484f58', '#ffa198', '#56d364', '#e3b341', '#79c0ff', '#d2a8ff', '#a5d6ff', '#f0f6fc'] },
  { name: 'Pikagent Light', light: true,
    chrome: ['#ffffff', '#1f2937', '#1f2937', '#ffffff', '#c7d2fe'],
    ansi:   ['#1f2937', '#dc2626', '#16a34a', '#ca8a04', '#2563eb', '#9333ea', '#0891b2', '#f3f4f6'],
    bright: ['#6b7280', '#ef4444', '#22c55e', '#eab308', '#3b82f6', '#a855f7', '#06b6d4', '#ffffff'] },
  { name: 'Solarized Light', light: true,
    chrome: ['#fdf6e3', '#657b83', '#657b83', '#fdf6e3', '#eee8d5'],
    ansi:   ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
    bright: ['#586e75', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'] },
  { name: 'GitHub Light', light: true,
    chrome: ['#ffffff', '#24292f', '#24292f', '#ffffff', '#ddf4ff'],
    ansi:   ['#24292f', '#cf222e', '#1a7f37', '#9a6700', '#0969da', '#8250df', '#1b7c83', '#f6f8fa'],
    bright: ['#57606a', '#a40e26', '#2da44e', '#bf8700', '#218bff', '#a475f9', '#3192aa', '#ffffff'] },
];

export const TERMINAL_THEMES = Object.fromEntries(
  THEME_DEFS.map(({ name, chrome, ansi, bright }) => [name, _buildTheme(chrome, ansi, bright)]),
);

const LIGHT_THEMES = new Set(THEME_DEFS.filter((d) => d.light).map((d) => d.name));

const STORAGE = { theme: 'pikagent-terminal-theme', prev: 'pikagent-terminal-theme-prev' };
const DEFAULT_LIGHT = 'Pikagent Light';
const DEFAULT_DARK = 'Pikagent';

export function getTerminalTheme() {
  const name = localStorage.getItem(STORAGE.theme) || DEFAULT_DARK;
  return TERMINAL_THEMES[name] || TERMINAL_THEMES[DEFAULT_DARK];
}

export function getTerminalThemeName() {
  return localStorage.getItem(STORAGE.theme) || DEFAULT_DARK;
}

export function setTerminalTheme(name) {
  localStorage.setItem(STORAGE.theme, name);
}

export function switchTerminalForMode(mode) {
  const current = getTerminalThemeName();
  const wantLight = mode === 'light';
  if (wantLight === LIGHT_THEMES.has(current)) return false;
  if (wantLight) localStorage.setItem(STORAGE.prev, current);
  setTerminalTheme(wantLight ? DEFAULT_LIGHT : (localStorage.getItem(STORAGE.prev) || DEFAULT_DARK));
  return true;
}
