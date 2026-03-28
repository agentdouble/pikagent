// Pure helpers and constants for git-changes-view

export const STATUS_LABELS = { M: 'M', A: 'A', D: 'D', R: 'R', '?': '?' };

export const CHEVRON = { expanded: '▼', collapsed: '▶' };

export const CHANGE_SECTIONS = [
  { key: 'staged', title: 'Staged', isStaged: true },
  { key: 'unstaged', title: 'Modified', isStaged: false },
  { key: 'untracked', title: 'Untracked', isStaged: false },
];

export function computeTotalChanges(changes) {
  return CHANGE_SECTIONS.reduce((sum, s) => sum + (changes[s.key]?.length || 0), 0);
}

export function buildFileKey(filePath, isStaged) {
  return `${isStaged ? 's' : 'u'}:${filePath}`;
}
