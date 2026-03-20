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

export function getFileIcon(name, isDirectory) {
  if (isDirectory) return '📁';
  const ext = name.split('.').pop().toLowerCase();
  return EXT_ICONS[ext] || '📄';
}

const EXT_LANG = {
  js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  html: 'xml', css: 'css', scss: 'scss', less: 'less',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  md: 'markdown', sh: 'bash', zsh: 'bash',
  sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', h: 'c',
  swift: 'swift', kt: 'kotlin', dart: 'dart',
  xml: 'xml', vue: 'xml', svelte: 'xml',
  dockerfile: 'dockerfile',
};

export function detectLanguage(filename) {
  const name = filename.toLowerCase();
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  const ext = name.split('.').pop();
  return EXT_LANG[ext] || 'plaintext';
}
