const DEFAULT_ICON = '📄';

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
const FILENAME_LANG = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
};

function _getExt(filename) {
  return filename.split('.').pop().toLowerCase();
}

export function getFileIcon(name, isDirectory) {
  if (isDirectory) return '📁';
  const cfg = FILE_CONFIG[_getExt(name)];
  return (cfg && cfg.icon) || DEFAULT_ICON;
}

export function detectLanguage(filename) {
  const lower = filename.toLowerCase();
  const byName = FILENAME_LANG[lower];
  if (byName) return byName;
  const cfg = FILE_CONFIG[_getExt(lower)];
  return (cfg && cfg.lang) || 'plaintext';
}
