/**
 * Base class for UI components that share a common lifecycle pattern:
 * container assignment, disposed guard, and tracked disposables.
 *
 * Lifecycle hooks (called automatically by the constructor in this order):
 * 1. `_initState()`   — initialise instance properties / state
 * 2. `_bindEvents()`  — subscribe to external events / services
 * 3. `render()`       — first DOM render
 * 4. `_afterInit()`   — post-render setup (polling, async loads, etc.)
 *
 * Subclasses should:
 * - Call `super(container)` in their constructor (hooks fire at the end)
 * - Use `this._track(unsub)` in listener setup to register disposables
 * - Use `this._guardDisposed(fn)` to skip work when disposed
 * - Override `dispose()` calling `super.dispose()` if extra cleanup is needed
 */
export class ComponentBase {
  constructor(container) {
    this.container = container;
    this.disposed = false;
    this._disposables = [];

    // Run lifecycle hooks if defined by subclass
    this._initState?.();
    this._bindEvents?.();
    this.render?.();
    this._afterInit?.();
  }

  /**
   * Register an unsubscribe function (or any teardown callback) to be called on dispose.
   * @param {() => void} unsub
   * @returns {() => void} the same unsub, for chaining
   */
  _track(unsub) {
    this._disposables.push(unsub);
    return unsub;
  }

  /**
   * Execute `fn` only if the component has not been disposed.
   * @param {() => void} fn
   */
  _guardDisposed(fn) {
    if (!this.disposed) fn();
  }

  /**
   * Mark the component as disposed and call all tracked disposables.
   * Subclasses that override this should call `super.dispose()`.
   */
  dispose() {
    this.disposed = true;
    this._disposables.forEach(fn => fn?.());
    this._disposables = [];
  }
}
