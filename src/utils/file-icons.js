const DEFAULT_ICON = '📄';

const EXT_ICONS = {
  js: '📄', ts: '📄', jsx: '📄', tsx: '📄',
  py: '🐍', rb: '💎', go: '🔵', rs: '🦀',
  html: '🌐', css: '🎨', scss: '🎨', less: '🎨',
  json: '📋', yaml: '📋', yml: '📋', toml: '📋',
  md: '📝', txt: '📝',
  sh: '⚡', zsh: '⚡', bash: '⚡',
  env: '🔒', lock: '🔒',
  png: '🖼️', jpg: '🖼️', svg: '🖼️', gif: '🖼️',
  pdf: '📕',
};

const EXT_LANG = {
  js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  html: 'xml', css: 'css', scss: 'scss', less: 'less',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  md: 'markdown', sh: 'bash', zsh: 'bash',
  sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', h: 'c',
  swift: 'swift', kt: 'kotlin', dart: 'dart',
  xml: 'xml', vue: 'xml', svelte: 'xml',
};

const FILENAME_LANG = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
};

function _getExt(filename) {
  return filename.split('.').pop().toLowerCase();
}

export function getFileIcon(name, isDirectory) {
  if (isDirectory) return '📁';
  return EXT_ICONS[_getExt(name)] || DEFAULT_ICON;
}

export function detectLanguage(filename) {
  const lower = filename.toLowerCase();
  return FILENAME_LANG[lower] || EXT_LANG[_getExt(lower)] || 'plaintext';
}
