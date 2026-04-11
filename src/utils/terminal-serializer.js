/**
 * Serialization / deserialization helpers for terminal split layout.
 * Extracted from TerminalPanel to reduce component size.
 * No business logic changes — pure structural refactoring.
 */

/**
 * Serialize a single DOM element into a layout tree descriptor.
 * @param {HTMLElement} el - either a split-container or terminal-wrapper
 * @param {(el: HTMLElement) => string} findTerminalCwd - returns the terminal cwd for a given wrapper element
 * @param {string} fallbackCwd - default cwd if terminal not found
 * @returns {{ type: string, direction?: string, flex: number, cwd?: string, children?: Array<unknown> }} tree descriptor
 */
export function serializeElement(el, findTerminalCwd, fallbackCwd) {
  if (el.classList.contains('split-container')) {
    const direction = el.classList.contains('split-horizontal') ? 'horizontal' : 'vertical';
    const children = [];

    for (const child of el.children) {
      if (child.classList.contains('split-handle')) continue;
      children.push(serializeElement(child, findTerminalCwd, fallbackCwd));
    }

    return {
      type: 'split',
      direction,
      flex: parseFloat(el.style.flex) || 1,
      children,
    };
  }

  if (el.classList.contains('terminal-wrapper')) {
    return {
      type: 'terminal',
      cwd: findTerminalCwd(el),
      flex: parseFloat(el.style.flex) || 1,
    };
  }

  return { type: 'terminal', cwd: fallbackCwd, flex: 1 };
}

/**
 * Serialize the entire terminal panel layout.
 * @param {HTMLElement} container - the terminal-panel container
 * @param {(el: HTMLElement) => string} findTerminalCwd - returns the terminal cwd for a given wrapper element
 * @param {string} fallbackCwd - default cwd
 * @returns {{ type: string, direction?: string, flex: number, cwd?: string, children?: Array<unknown> }} tree descriptor
 */
export function serializeLayout(container, findTerminalCwd, fallbackCwd) {
  const rootEl = container.firstElementChild;
  if (!rootEl) return { type: 'terminal', cwd: fallbackCwd, flex: 1 };
  return serializeElement(rootEl, findTerminalCwd, fallbackCwd);
}
