/**
 * Split layout DOM operations for terminal panel.
 * Handles element detachment, unwrapping single-child splits, and
 * move operations (center/insert/wrap).
 * Extracted from TerminalPanel to reduce component size.
 */

/**
 * Get non-handle child panels of a split container.
 * @param {HTMLElement} splitEl
 * @returns {HTMLElement[]}
 */
export function getPanels(splitEl) {
  return Array.from(splitEl.children).filter(
    (c) => !c.classList.contains('split-handle'),
  );
}

/**
 * Unwrap a split container if it has only one child panel.
 * @param {HTMLElement} el
 */
function unwrapIfSingle(el) {
  if (!el || !el.classList.contains('split-container')) return;
  const panels = getPanels(el);
  if (panels.length === 1) {
    const survivor = panels[0];
    const parent = el.parentElement;
    if (parent) {
      survivor.style.flex = el.style.flex || '1';
      parent.replaceChild(survivor, el);
    }
  }
}

/**
 * Detach an element from its parent split container, cleaning up
 * handles and unwrapping if the parent becomes a single-child split.
 * @param {HTMLElement} el
 */
export function detachElement(el) {
  const parentEl = el.parentElement;
  if (!parentEl) return;

  el.remove();

  if (parentEl.classList.contains('split-container')) {
    const handles = Array.from(parentEl.querySelectorAll(':scope > .split-handle'));
    if (handles.length > 0) {
      handles[handles.length - 1].remove();
    }

    const remainingPanels = getPanels(parentEl);

    if (remainingPanels.length === 1) {
      const survivor = remainingPanels[0];
      const grandParent = parentEl.parentElement;
      if (grandParent) {
        survivor.style.flex = parentEl.style.flex || '1';
        grandParent.replaceChild(survivor, parentEl);
        unwrapIfSingle(grandParent);
      }
    } else if (remainingPanels.length === 0) {
      parentEl.remove();
    }
  }
}

/**
 * Move source element to replace / swap with target (center drop).
 * @param {HTMLElement} sourceEl
 * @param {HTMLElement} targetEl
 */
export function moveToCenter(sourceEl, targetEl) {
  targetEl.parentElement.insertBefore(sourceEl, targetEl);
  sourceEl.style.flex = targetEl.style.flex;
}

/**
 * Insert source into an existing same-direction split container.
 * @param {HTMLElement} sourceEl
 * @param {HTMLElement} targetEl
 * @param {string} direction
 * @param {boolean} before - insert before target?
 * @param {HTMLElement} parentEl - the split container
 * @param {function} createHandle - (direction, splitEl) => handle element
 * @param {function} equalize - (splitEl) => void
 */
export function insertIntoSplit(sourceEl, targetEl, direction, before, parentEl, createHandle, equalize) {
  const handle = createHandle(direction, parentEl);
  if (before) {
    targetEl.insertAdjacentElement('beforebegin', sourceEl);
    sourceEl.insertAdjacentElement('afterend', handle);
  } else {
    targetEl.insertAdjacentElement('afterend', handle);
    handle.insertAdjacentElement('afterend', sourceEl);
  }
  equalize(parentEl);
}

/**
 * Wrap source and target in a new split container.
 * @param {HTMLElement} sourceEl
 * @param {HTMLElement} targetEl
 * @param {string} direction
 * @param {boolean} before - insert source before target?
 * @param {HTMLElement} parentEl - current parent of targetEl
 * @param {function} createSplitContainer - (direction, flex) => split element
 * @param {function} createHandle - (direction, splitEl) => handle element
 */
export function wrapInNewSplit(sourceEl, targetEl, direction, before, parentEl, createSplitContainer, createHandle) {
  const splitEl = createSplitContainer(direction, targetEl.style.flex || '1');
  parentEl.replaceChild(splitEl, targetEl);
  targetEl.style.flex = '1';
  sourceEl.style.flex = '1';

  const [first, second] = before ? [sourceEl, targetEl] : [targetEl, sourceEl];
  splitEl.appendChild(first);
  splitEl.appendChild(createHandle(direction, splitEl));
  splitEl.appendChild(second);
}
