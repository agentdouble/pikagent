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

/** Build the new-branch text input. */
function buildNewBranchInput() {
  return _el('input', {
    className: 'prompt-dialog-input', type: 'text', placeholder: 'feat/my-branch',
  });
}

/** Build the base-branch dropdown from all available branches. */
function buildBaseBranchSelect(allBranches, currentBranch) {
  const baseSelect = _el('select', { className: 'prompt-dialog-input worktree-dialog-select' });
  for (const b of allBranches) {
    const opt = _el('option', null, b);
    opt.value = b;
    if (b === currentBranch) opt.selected = true;
    baseSelect.appendChild(opt);
  }
  return baseSelect;
}

/** Build the existing-branch dropdown. */
function buildExistingBranchSelect(existingBranches) {
  const existingSelect = _el('select', { className: 'prompt-dialog-input worktree-dialog-select' });
  for (const b of existingBranches) existingSelect.appendChild(_el('option', null, b));
  if (!existingBranches.length) existingSelect.appendChild(_el('option', { disabled: true }, 'No other branches'));
  existingSelect.style.display = 'none';
  return existingSelect;
}

/** Build the path preview element that updates when the branch changes. */
function buildPathPreview(repoCwd, getMode, newInput, existingSelect) {
  const pathEl = _el('div', 'worktree-dialog-path');
  const updatePath = () => {
    const branch = getMode() === 'new' ? newInput.value.trim() : existingSelect.value;
    pathEl.textContent = branch ? defaultWorktreePath(repoCwd, branch) : '';
  };
  newInput.addEventListener('input', updatePath);
  existingSelect.addEventListener('change', updatePath);
  return { pathEl, updatePath };
}

/** Build the Cancel / Create action buttons. */
function buildActionButtons(cancel, confirm) {
  return _el('div', 'prompt-dialog-btns',
    createActionButton({ text: 'Cancel', cls: 'prompt-dialog-cancel', onClick: cancel }),
    createActionButton({ text: 'Create', cls: 'prompt-dialog-confirm', onClick: confirm }),
  );
}

/** Build mode-toggle buttons and return the toggle controller. */
function buildModeToggle(els, updatePath) {
  const { newInput, baseSelect, baseLabel, existingSelect } = els;
  const state = { mode: 'new' };

  const btnNew = createActionButton({
    text: 'New branch', cls: 'worktree-dialog-mode-btn active',
    onClick: () => setMode('new'),
  });
  const btnExisting = createActionButton({
    text: 'Existing branch', cls: 'worktree-dialog-mode-btn',
    onClick: () => setMode('existing'),
  });

  function setMode(next) {
    state.mode = next;
    btnNew.classList.toggle('active', state.mode === 'new');
    btnExisting.classList.toggle('active', state.mode === 'existing');
    const isNew = state.mode === 'new';
    newInput.style.display = isNew ? '' : 'none';
    baseSelect.style.display = isNew ? '' : 'none';
    baseLabel.style.display = isNew ? '' : 'none';
    existingSelect.style.display = isNew ? 'none' : '';
    updatePath();
    (isNew ? newInput : existingSelect).focus();
  }

  return { btnNew, btnExisting, state };
}

/** Wire keyboard shortcuts and build the confirm handler. */
function wireConfirmAndKeyboard(els, state, repoCwd, cleanup, cancel) {
  const { newInput, baseSelect, existingSelect } = els;
  const confirm = () => {
    const branch = state.mode === 'new' ? newInput.value.trim() : existingSelect.value;
    if (!branch) return;
    cleanup({
      branch,
      createBranch: state.mode === 'new',
      targetPath: defaultWorktreePath(repoCwd, branch),
      baseBranch: state.mode === 'new' ? (baseSelect.value || null) : null,
    });
  };
  setupKeyboardShortcuts(newInput, { onEnter: confirm, onEscape: cancel });
  setupKeyboardShortcuts(existingSelect, { onEnter: confirm, onEscape: cancel });
  setupKeyboardShortcuts(baseSelect, { onEnter: confirm, onEscape: cancel });
  return confirm;
}

/**
 * Show the worktree creation dialog.
 *
 * @param {{ repoCwd: string, allBranches: string[], existingBranches: string[], currentBranch: string|null }} opts
 * @returns {Promise<{ branch: string, createBranch: boolean, targetPath: string, baseBranch: string|null } | null>}
 */
export function showWorktreeDialog({ repoCwd, allBranches, existingBranches, currentBranch }) {
  return new Promise((resolve) => {
    let overlay;
    const cleanup = (value) => { overlay.remove(); resolve(value); };
    const cancel = () => cleanup(null);

    ({ overlay } = createModalOverlay('prompt-dialog-overlay', 'prompt-dialog-box worktree-dialog-box', cancel));

    const newInput = buildNewBranchInput();
    const baseSelect = buildBaseBranchSelect(allBranches, currentBranch);
    const baseLabel = _el('label', 'worktree-dialog-sub-label', 'Base branch');
    const existingSelect = buildExistingBranchSelect(existingBranches);
    const els = { newInput, baseSelect, baseLabel, existingSelect };

    const { pathEl, updatePath } = buildPathPreview(repoCwd, () => state.mode, newInput, existingSelect);
    const { btnNew, btnExisting, state } = buildModeToggle(els, updatePath);
    const confirm = wireConfirmAndKeyboard(els, state, repoCwd, cleanup, cancel);

    overlay.firstChild.append(
      _el('label', 'prompt-dialog-label', 'New worktree'),
      _el('div', 'worktree-dialog-mode-row', btnNew, btnExisting),
      newInput, baseLabel, baseSelect, existingSelect, pathEl,
      buildActionButtons(cancel, confirm),
    );

    document.body.appendChild(overlay);
    updatePath();
    newInput.focus();
  });
}
