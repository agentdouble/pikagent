/**
 * Domain facade for fs-api, shell-api and clipboard-api services
 * used by the FileTree component.
 *
 * Exposes a single flat object so the component imports exactly one
 * module instead of three separate service modules.
 */
import fsApi from '../services/fs-api.js';
import shellApi from '../services/shell-api.js';
import clipboardApi from '../services/clipboard-api.js';

export const fileTreeApi = {
  // fs
  copy:           (...a) => fsApi.copy(...a),
  copyTo:         (...a) => fsApi.copyTo(...a),
  rename:         (...a) => fsApi.rename(...a),
  mkdir:          (...a) => fsApi.mkdir(...a),
  writefile:      (...a) => fsApi.writefile(...a),
  readdir:        (...a) => fsApi.readdir(...a),
  watch:          (...a) => fsApi.watch(...a),
  unwatch:        (...a) => fsApi.unwatch(...a),
  onChanged:      (...a) => fsApi.onChanged(...a),
  trash:          (...a) => fsApi.trash(...a),
  // shell
  showInFolder:   (...a) => shellApi.showInFolder(...a),
  // clipboard
  clipboardWrite: (...a) => clipboardApi.write(...a),
};
