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
import { createDialogBase } from './dom-dialogs.js';
import { setupKeyboardShortcuts } from './keyboard-helpers.js';

/** Sanitize a branch name into a filesystem-safe segment. */
function sanitizeSegment(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Build the default target path for a worktree given the host repo cwd. */
function defaultWorktreePath(repoCwd, branch) {
  const segment = sanitizeSegment(branch) || 'worktree';
  return `${repoCwd.replace(/\/$/, '')}/.worktrees/${segment}`;
}

/**
 * Show the worktree creation dialog.
 *
 * `allBranches` is the full list of local branches (used to build the
 * base-branch dropdown in "new branch" mode — a base branch can be one
 * that's already checked out elsewhere).
 * `existingBranches` is the list of branches available for the "existing
 * branch" mode (i.e. not already checked out in another worktree).
 *
 * @param {{ repoCwd: string, allBranches: string[], existingBranches: string[], currentBranch: string|null }} opts
 * @returns {Promise<{ branch: string, createBranch: boolean, targetPath: string, baseBranch: string|null } | null>}
 */
export function showWorktreeDialog({ repoCwd, allBranches, existingBranches, currentBranch }) {
  return createDialogBase({
    overlayClass: 'prompt-dialog-overlay',
    modalClass: 'prompt-dialog-box worktree-dialog-box',
    builder({ modal, cleanup, cancel }) {
      let mode = 'new';

      const newInput = _el('input', {
        className: 'prompt-dialog-input', type: 'text', placeholder: 'feat/my-branch',
      });

      const baseSelect = _el('select', { className: 'prompt-dialog-input worktree-dialog-select' });
      for (const b of allBranches) {
        const opt = _el('option', null, b);
        opt.value = b;
        if (b === currentBranch) opt.selected = true;
        baseSelect.appendChild(opt);
      }
      const baseLabel = _el('label', 'worktree-dialog-sub-label', 'Base branch');

      const existingSelect = _el('select', { className: 'prompt-dialog-input worktree-dialog-select' });
      for (const b of existingBranches) existingSelect.appendChild(_el('option', null, b));
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
        const isNew = mode === 'new';
        newInput.style.display = isNew ? '' : 'none';
        baseSelect.style.display = isNew ? '' : 'none';
        baseLabel.style.display = isNew ? '' : 'none';
        existingSelect.style.display = isNew ? 'none' : '';
        updatePath();
        (isNew ? newInput : existingSelect).focus();
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
          baseBranch: mode === 'new' ? (baseSelect.value || null) : null,
        });
      };

      setupKeyboardShortcuts(newInput, { onEnter: confirm, onEscape: cancel });
      setupKeyboardShortcuts(existingSelect, { onEnter: confirm, onEscape: cancel });
      setupKeyboardShortcuts(baseSelect, { onEnter: confirm, onEscape: cancel });

      existingSelect.style.display = 'none';

      modal.append(
        _el('label', 'prompt-dialog-label', 'New worktree'),
        _el('div', 'worktree-dialog-mode-row', btnNew, btnExisting),
        newInput,
        baseLabel,
        baseSelect,
        existingSelect,
        pathEl,
        _el('div', 'prompt-dialog-btns',
          createActionButton({ text: 'Cancel', cls: 'prompt-dialog-cancel', onClick: cancel }),
          createActionButton({ text: 'Create', cls: 'prompt-dialog-confirm', onClick: confirm }),
        ),
      );

      return () => {
        updatePath();
        newInput.focus();
      };
    },
  });
}
