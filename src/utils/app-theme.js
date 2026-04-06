const STORAGE_KEY = 'pikagent-app-theme';

export function getAppTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'dark';
}

export function setAppTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyAppTheme(theme);
}

export function applyAppTheme(theme) {
  if (!theme) theme = getAppTheme();
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
