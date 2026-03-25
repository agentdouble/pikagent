const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

function _theme(chrome, ansi, bright) {
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

export const TERMINAL_THEMES = {
  'Pikagent': _theme(
    ['#1a1a2e', '#e0e0e0', '#e0e0e0', '#1a1a2e', '#3a3a5e'],
    ['#1a1a2e', '#ff6b6b', '#51cf66', '#ffd43b', '#74c0fc', '#da77f2', '#66d9e8', '#e0e0e0'],
    ['#555577', '#ff8787', '#69db7c', '#ffe066', '#91d5ff', '#e599f7', '#99e9f2', '#ffffff'],
  ),
  'Dracula': _theme(
    ['#282a36', '#f8f8f2', '#f8f8f2', '#282a36', '#44475a'],
    ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'],
    ['#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'],
  ),
  'One Dark': _theme(
    ['#282c34', '#abb2bf', '#528bff', '#282c34', '#3e4451'],
    ['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf'],
    ['#5c6370', '#be5046', '#98c379', '#d19a66', '#61afef', '#c678dd', '#56b6c2', '#ffffff'],
  ),
  'Nord': _theme(
    ['#2e3440', '#d8dee9', '#d8dee9', '#2e3440', '#434c5e'],
    ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0'],
    ['#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4'],
  ),
  'Tokyo Night': _theme(
    ['#1a1b26', '#c0caf5', '#c0caf5', '#1a1b26', '#33467c'],
    ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'],
    ['#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5'],
  ),
  'Catppuccin Mocha': _theme(
    ['#1e1e2e', '#cdd6f4', '#f5e0dc', '#1e1e2e', '#45475a'],
    ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'],
    ['#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8'],
  ),
  'Solarized Dark': _theme(
    ['#002b36', '#839496', '#839496', '#002b36', '#073642'],
    ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
    ['#586e75', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'],
  ),
  'Gruvbox Dark': _theme(
    ['#282828', '#ebdbb2', '#ebdbb2', '#282828', '#504945'],
    ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984'],
    ['#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2'],
  ),
  'Monokai': _theme(
    ['#272822', '#f8f8f2', '#f8f8f0', '#272822', '#49483e'],
    ['#272822', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f8f8f2'],
    ['#75715e', '#f92672', '#a6e22e', '#f4bf75', '#66d9ef', '#ae81ff', '#a1efe4', '#f9f8f5'],
  ),
  'GitHub Dark': _theme(
    ['#0d1117', '#c9d1d9', '#c9d1d9', '#0d1117', '#264f78'],
    ['#0d1117', '#ff7b72', '#7ee787', '#d29922', '#79c0ff', '#d2a8ff', '#a5d6ff', '#c9d1d9'],
    ['#484f58', '#ffa198', '#56d364', '#e3b341', '#79c0ff', '#d2a8ff', '#a5d6ff', '#f0f6fc'],
  ),
  'Pikagent Light': _theme(
    ['#ffffff', '#1f2937', '#1f2937', '#ffffff', '#c7d2fe'],
    ['#1f2937', '#dc2626', '#16a34a', '#ca8a04', '#2563eb', '#9333ea', '#0891b2', '#f3f4f6'],
    ['#6b7280', '#ef4444', '#22c55e', '#eab308', '#3b82f6', '#a855f7', '#06b6d4', '#ffffff'],
  ),
  'Solarized Light': _theme(
    ['#fdf6e3', '#657b83', '#657b83', '#fdf6e3', '#eee8d5'],
    ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
    ['#586e75', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'],
  ),
  'GitHub Light': _theme(
    ['#ffffff', '#24292f', '#24292f', '#ffffff', '#ddf4ff'],
    ['#24292f', '#cf222e', '#1a7f37', '#9a6700', '#0969da', '#8250df', '#1b7c83', '#f6f8fa'],
    ['#57606a', '#a40e26', '#2da44e', '#bf8700', '#218bff', '#a475f9', '#3192aa', '#ffffff'],
  ),
};

const STORAGE = { theme: 'pikagent-terminal-theme', prev: 'pikagent-terminal-theme-prev' };

const LIGHT_THEMES = new Set(['Pikagent Light', 'Solarized Light', 'GitHub Light']);
const DEFAULT_LIGHT = 'Pikagent Light';
const DEFAULT_DARK = 'Pikagent';

function _isLight(name) {
  return LIGHT_THEMES.has(name);
}

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
  if (wantLight === _isLight(current)) return false;
  if (wantLight) localStorage.setItem(STORAGE.prev, current);
  setTerminalTheme(wantLight ? DEFAULT_LIGHT : (localStorage.getItem(STORAGE.prev) || DEFAULT_DARK));
  return true;
}
