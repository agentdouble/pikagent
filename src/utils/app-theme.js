import { persistedSetting } from './persisted-setting.js';

const _appThemeSetting = persistedSetting('pikagent-app-theme', 'dark');

export function getAppTheme() {
  return _appThemeSetting.get();
}

export function setAppTheme(theme) {
  _appThemeSetting.set(theme);
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
