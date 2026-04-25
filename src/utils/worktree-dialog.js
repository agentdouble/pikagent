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

/** Build the "new branch" text input. */
function buildBranchInput() {
  return _el('input', {
    className: 'prompt-dialog-input', type: 'text', placeholder: 'feat/my-branch',
  });
}

/** Build the base-branch <select> for "new branch" mode. */
function buildBaseSelect(allBranches, currentBranch) {
  const baseSelect = _el('select', { className: 'prompt-dialog-input worktree-dialog-select' });
  for (const b of allBranches) {
    const opt = _el('option', null, b);
    opt.value = b;
    if (b === currentBranch) opt.selected = true;
    baseSelect.appendChild(opt);
  }
  return baseSelect;
}

/** Build the existing-branch <select> for "existing branch" mode. */
function buildExistingSelect(existingBranches) {
  const existingSelect = _el('select', { className: 'prompt-dialog-input worktree-dialog-select' });
  for (const b of existingBranches) existingSelect.appendChild(_el('option', null, b));
  if (!existingBranches.length) existingSelect.appendChild(_el('option', { disabled: true }, 'No other branches'));
  existingSelect.style.display = 'none';
  return existingSelect;
}

/** Build the mode-toggle buttons ("New branch" / "Existing branch"). */
function buildModeButtons(onNew, onExisting) {
  const btnNew = createActionButton({
    text: 'New branch', cls: 'worktree-dialog-mode-btn active',
    onClick: onNew,
  });
  const btnExisting = createActionButton({
    text: 'Existing branch', cls: 'worktree-dialog-mode-btn',
    onClick: onExisting,
  });
  return { btnNew, btnExisting };
}

/** Build the Cancel / Create action buttons row. */
function buildActionButtons(cancel, confirm) {
  return _el('div', 'prompt-dialog-btns',
    createActionButton({ text: 'Cancel', cls: 'prompt-dialog-cancel', onClick: cancel }),
    createActionButton({ text: 'Create', cls: 'prompt-dialog-confirm', onClick: confirm }),
  );
}

/** Apply visibility for the given mode to the form elements. */
function applyModeVisibility(mode, { newInput, baseSelect, baseLabel, existingSelect }) {
  const isNew = mode === 'new';
  newInput.style.display = isNew ? '' : 'none';
  baseSelect.style.display = isNew ? '' : 'none';
  baseLabel.style.display = isNew ? '' : 'none';
  existingSelect.style.display = isNew ? 'none' : '';
  return isNew;
}

/** Read the current branch value from the active input for the given mode. */
function readBranchValue(mode, newInput, existingSelect) {
  return mode === 'new' ? newInput.value.trim() : existingSelect.value;
}

/** Wire Enter/Escape keyboard shortcuts on multiple elements. */
function wireKeyboardShortcuts(elements, actions) {
  for (const el of elements) setupKeyboardShortcuts(el, actions);
}

/** Assemble modal children (title, mode row, inputs, path, action buttons). */
function populateModal(modal, { btnNew, btnExisting, els, pathEl, cancel, confirm }) {
  modal.append(
    _el('label', 'prompt-dialog-label', 'New worktree'),
    _el('div', 'worktree-dialog-mode-row', btnNew, btnExisting),
    els.newInput, els.baseLabel, els.baseSelect, els.existingSelect,
    pathEl,
    buildActionButtons(cancel, confirm),
  );
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
      const els = {
        newInput: buildBranchInput(),
        baseSelect: buildBaseSelect(allBranches, currentBranch),
        baseLabel: _el('label', 'worktree-dialog-sub-label', 'Base branch'),
        existingSelect: buildExistingSelect(existingBranches),
      };
      const pathEl = _el('div', 'worktree-dialog-path');

      const updatePath = () => {
        const branch = readBranchValue(mode, els.newInput, els.existingSelect);
        pathEl.textContent = branch ? defaultWorktreePath(repoCwd, branch) : '';
      };

      const { btnNew, btnExisting } = buildModeButtons(
        () => setMode('new'),
        () => setMode('existing'),
      );

      function setMode(next) {
        mode = next;
        btnNew.classList.toggle('active', mode === 'new');
        btnExisting.classList.toggle('active', mode === 'existing');
        const isNew = applyModeVisibility(mode, els);
        updatePath();
        (isNew ? els.newInput : els.existingSelect).focus();
      }

      els.newInput.addEventListener('input', updatePath);
      els.existingSelect.addEventListener('change', updatePath);

      const confirm = () => {
        const branch = readBranchValue(mode, els.newInput, els.existingSelect);
        if (!branch) return;
        cleanup({
          branch,
          createBranch: mode === 'new',
          targetPath: defaultWorktreePath(repoCwd, branch),
          baseBranch: mode === 'new' ? (els.baseSelect.value || null) : null,
        });
      };

      wireKeyboardShortcuts([els.newInput, els.existingSelect, els.baseSelect], { onEnter: confirm, onEscape: cancel });
      populateModal(modal, { btnNew, btnExisting, els, pathEl, cancel, confirm });

      return () => { updatePath(); els.newInput.focus(); };
    },
  });
}
