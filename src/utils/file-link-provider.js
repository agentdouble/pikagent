// File path link provider for xterm.js
// Detects file paths in terminal output and makes them clickable (opened with default app).

const FILE_EXT = '(?:png|jpe?g|gif|svg|webp|bmp|ico|tiff?|pdf|txt|md|json|ya?ml|xml|html?|css|js|jsx|ts|tsx|py|rb|go|rs|c|cpp|h|hpp|java|sh|log|csv|sql|toml|ini|conf|mp[34]|wav|zip|tar|gz|mov|avi|mkv|webm)';

// Matches:
//   /absolute/path/file.ext
//   ~/home-relative/file.ext
//   ./relative/file.ext  ../parent/file.ext
//   dir/file.ext  file.ext (bare names with known extensions)
const FILE_PATH_RE = new RegExp(
  `(?:~\\/|\\.\\.?\\/|\\/)?(?:[\\w.@\\-]+\\/)*[\\w@\\-][\\w.@\\-]*\\.${FILE_EXT}`,
  'gi',
);

export class FilePathLinkProvider {
  /**
   * @param {import('@xterm/xterm').Terminal} terminal
   * @param {() => string|null} getCwd  returns the shell's current working directory
   * @param {{ homedir: Function, openPath: Function }} api - injected API methods
   */
  constructor(terminal, getCwd, { homedir, openPath }) {
    this._terminal = terminal;
    this._getCwd = getCwd;
    this._homedir = homedir;
    this._openPath = openPath;
  }

  provideLinks(y, callback) {
    const line = this._terminal.buffer.active.getLine(y - 1);
    if (!line) return callback(undefined);

    const text = line.translateToString(true);
    const links = [];

    FILE_PATH_RE.lastIndex = 0;
    let m;
    while ((m = FILE_PATH_RE.exec(text)) !== null) {
      const startX = m.index + 1; // xterm columns are 1-based
      const endX = startX + m[0].length - 1;

      links.push({
        range: { start: { x: startX, y }, end: { x: endX, y } },
        text: m[0],
        activate: (_e, linkText) => this._open(linkText),
      });
    }

    callback(links.length ? links : undefined);
  }

  async _open(raw) {
    let filePath = raw;

    // Expand ~ to home dir
    if (filePath.startsWith('~/')) {
      const home = await this._homedir();
      filePath = home + filePath.slice(1);
    }

    // Resolve relative paths against cwd
    if (!filePath.startsWith('/')) {
      const cwd = this._getCwd?.() || '/';
      filePath = cwd + '/' + filePath;
    }

    this._openPath(filePath);
  }
}
