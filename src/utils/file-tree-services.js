/**
 * Domain facade for fs-api, shell-api and clipboard-api services
 * used by the FileTree component.
 *
 * Exposes a single flat interface so the component never imports more than
 * one service module.  The previous named re-exports are kept for
 * backward-compatibility but components should prefer `fileTreeFacade`.
 */
import fsApi from '../services/fs-api.js';
import shellApi from '../services/shell-api.js';
import clipboardApi from '../services/clipboard-api.js';

// ── backward-compat re-exports ──────────────────────────────────────
export { fsApi, shellApi, clipboardApi };

// ── unified facade ──────────────────────────────────────────────────
export const fileTreeFacade = {
  // fs
  copy:       (...a) => fsApi.copy(...a),
  copyTo:     (...a) => fsApi.copyTo(...a),
  rename:     (...a) => fsApi.rename(...a),
  mkdir:      (...a) => fsApi.mkdir(...a),
  writefile:  (...a) => fsApi.writefile(...a),
  readdir:    (...a) => fsApi.readdir(...a),
  watch:      (...a) => fsApi.watch(...a),
  unwatch:    (...a) => fsApi.unwatch(...a),
  onChanged:  (...a) => fsApi.onChanged(...a),
  trash:      (...a) => fsApi.trash(...a),
  // shell
  showInFolder: (...a) => shellApi.showInFolder(...a),
  // clipboard
  clipboardWrite: (...a) => clipboardApi.write(...a),
};
