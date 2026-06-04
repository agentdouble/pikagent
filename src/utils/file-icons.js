/** Unified file-type config: maps each extension to its icon and/or language.
 *  Single source of truth — add new file types here. */
const FILE_CONFIG = {
  // JavaScript / TypeScript
  js:   { icon: '📄', lang: 'javascript' },
  ts:   { icon: '📄', lang: 'typescript' },
  jsx:  { icon: '📄', lang: 'javascript' },
  tsx:  { icon: '📄', lang: 'typescript' },
  // Python / Ruby / Go / Rust
  py:   { icon: '🐍', lang: 'python' },
  rb:   { icon: '💎', lang: 'ruby' },
  go:   { icon: '🔵', lang: 'go' },
  rs:   { icon: '🦀', lang: 'rust' },
  // Web
  html: { icon: '🌐', lang: 'xml' },
  css:  { icon: '🎨', lang: 'css' },
  scss: { icon: '🎨', lang: 'scss' },
  less: { icon: '🎨', lang: 'less' },
  // Data / Config
  json: { icon: '📋', lang: 'json' },
  yaml: { icon: '📋', lang: 'yaml' },
  yml:  { icon: '📋', lang: 'yaml' },
  toml: { icon: '📋', lang: 'ini' },
  // Docs
  md:   { icon: '📝', lang: 'markdown' },
  txt:  { icon: '📝' },
  // Shell
  sh:   { icon: '⚡', lang: 'bash' },
  zsh:  { icon: '⚡', lang: 'bash' },
  bash: { icon: '⚡' },
  // Sensitive
  env:  { icon: '🔒' },
  lock: { icon: '🔒' },
  // Media
  png:  { icon: '🖼️' },
  jpg:  { icon: '🖼️' },
  svg:  { icon: '🖼️' },
  gif:  { icon: '🖼️' },
  // Other
  pdf:  { icon: '📕' },
  sql:    { lang: 'sql' },
  java:   { lang: 'java' },
  c:      { lang: 'c' },
  cpp:    { lang: 'cpp' },
  h:      { lang: 'c' },
  swift:  { lang: 'swift' },
  kt:     { lang: 'kotlin' },
  dart:   { lang: 'dart' },
  xml:    { lang: 'xml' },
  vue:    { lang: 'xml' },
  svelte: { lang: 'xml' },
};

/** Full-filename overrides for files without meaningful extensions. */
const FILENAME_CONFIG = {
  dockerfile: { icon: '📦', lang: 'dockerfile' },
  makefile: { icon: '⚙️', lang: 'makefile' },
};

function _getExt(filename) {
  return filename.split('.').pop().toLowerCase();
}

function _getBaseName(filePath) {
  return String(filePath || '').split(/[\\/]/).pop();
}

function getFileConfig(filename) {
  const lower = _getBaseName(filename).toLowerCase();
  return FILENAME_CONFIG[lower] || FILE_CONFIG[_getExt(lower)] || null;
}

export function detectLanguage(filename) {
  const cfg = getFileConfig(filename);
  return (cfg && cfg.lang) || 'plaintext';
}

export function getFileIcon(filename) {
  const cfg = getFileConfig(filename);
  return (cfg && cfg.icon) || '📄';
}
