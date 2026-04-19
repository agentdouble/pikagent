/**
 * Worktree creation dialog.
 *
 * Prompts the user for:
 *   - mode: create a new branch vs check out an existing branch
 *   - branch name (or selected branch)
 *   - target path (defaults to `<repo>/.worktrees/<sanitized-branch>`)
 *
 * Returns a Promise<{ branch, createBranch, targetPath } | null>.
 */

import { _el, createActionButton } from './dom.js';
import { createModalOverlay } from './dom-dialogs.js';
import { setupKeyboardShortcuts } from './keyboard-helpers.js';

/** Sanitize a branch name into a filesystem-safe segment. */
function sanitizeSegment(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Build the default target path for a worktree given the host repo cwd. */
export function defaultWorktreePath(repoCwd, branch) {
  const segment = sanitizeSegment(branch) || 'worktree';
  return `${repoCwd.replace(/\/$/, '')}/.worktrees/${segment}`;
}

/**
 * Show the worktree creation dialog.
 * @param {{ repoCwd: string, existingBranches: string[] }} opts
 * @returns {Promise<{ branch: string, createBranch: boolean, targetPath: string } | null>}
 */
export function showWorktreeDialog({ repoCwd, existingBranches }) {
  return new Promise((resolve) => {
    let overlay;
    const cleanup = (value) => { overlay.remove(); resolve(value); };
    const cancel = () => cleanup(null);

    ({ overlay } = createModalOverlay('prompt-dialog-overlay', 'prompt-dialog-box worktree-dialog-box', cancel));
    const modal = overlay.firstChild;

    let mode = 'new';

    const newInput = _el('input', {
      className: 'prompt-dialog-input', type: 'text', placeholder: 'feat/my-branch',
    });

    const existingSelect = _el('select', { className: 'prompt-dialog-input worktree-dialog-select' });
    for (const b of existingBranches) existingSelect.appendChild(_el('option', null, b));
    existingSelect.style.display = 'none';
    if (!existingBranches.length) existingSelect.appendChild(_el('option', { disabled: true }, 'No other branches'));

    const pathEl = _el('div', 'worktree-dialog-path');

    const updatePath = () => {
      const branch = mode === 'new' ? newInput.value.trim() : existingSelect.value;
      pathEl.textContent = branch ? defaultWorktreePath(repoCwd, branch) : '';
    };

    const btnNew = createActionButton({
      text: 'New branch', cls: 'worktree-dialog-mode-btn active',
      onClick: () => setMode('new'),
    });
    const btnExisting = createActionButton({
      text: 'Existing branch', cls: 'worktree-dialog-mode-btn',
      onClick: () => setMode('existing'),
    });

    function setMode(next) {
      mode = next;
      btnNew.classList.toggle('active', mode === 'new');
      btnExisting.classList.toggle('active', mode === 'existing');
      newInput.style.display = mode === 'new' ? '' : 'none';
      existingSelect.style.display = mode === 'existing' ? '' : 'none';
      updatePath();
      (mode === 'new' ? newInput : existingSelect).focus();
    }

    newInput.addEventListener('input', updatePath);
    existingSelect.addEventListener('change', updatePath);

    const confirm = () => {
      const branch = mode === 'new' ? newInput.value.trim() : existingSelect.value;
      if (!branch) return;
      cleanup({
        branch,
        createBranch: mode === 'new',
        targetPath: defaultWorktreePath(repoCwd, branch),
      });
    };

    setupKeyboardShortcuts(newInput, { onEnter: confirm, onEscape: cancel });
    setupKeyboardShortcuts(existingSelect, { onEnter: confirm, onEscape: cancel });

    modal.append(
      _el('label', 'prompt-dialog-label', 'New worktree'),
      _el('div', 'worktree-dialog-mode-row', btnNew, btnExisting),
      newInput,
      existingSelect,
      pathEl,
      _el('div', 'prompt-dialog-btns',
        createActionButton({ text: 'Cancel', cls: 'prompt-dialog-cancel', onClick: cancel }),
        createActionButton({ text: 'Create', cls: 'prompt-dialog-confirm', onClick: confirm }),
      ),
    );

    document.body.appendChild(overlay);
    updatePath();
    newInput.focus();
  });
}
