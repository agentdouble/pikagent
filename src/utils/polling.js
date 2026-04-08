/**
 * Reusable polling timer for the renderer process.
 * Mirrors the API of main/polling-timer.js (start/stop/running)
 * but lives in the renderer bundle.
 */
export class RendererPollingTimer {
  /**
   * @param {number} intervalMs  - Polling interval in milliseconds
   * @param {Function} callback  - Called on each tick and immediately on start
   */
  constructor(intervalMs, callback) {
    this._intervalMs = intervalMs;
    this._callback = callback;
    this._timer = null;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._callback(), this._intervalMs);
    this._callback();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  get running() {
    return this._timer !== null;
  }
}
