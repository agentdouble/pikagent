/**
 * Reusable polling timer with start/stop lifecycle.
 * Shared by FlowManager and SessionManager.
 */
class PollingTimer {
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

module.exports = { PollingTimer };
