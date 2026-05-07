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

import { _el, createActionButton, _vis } from './git-dom.js';
import { createDialogBase } from './dom-dialogs.js';
import { onKeyAction } from './event-helpers.js';
import { sanitizeSegment } from '../../shared/string-utils.js';
import { buildSelect } from './form-helpers.js';

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
  return buildSelect(allBranches, {
    className: 'prompt-dialog-input worktree-dialog-select',
    selected: currentBranch,
  });
}

/** Build the existing-branch <select> for "existing branch" mode. */
function buildExistingSelect(existingBranches) {
  const items = existingBranches.length
    ? existingBranches
    : [{ value: '', label: 'No other branches', disabled: true }];
  const existingSelect = buildSelect(items, {
    className: 'prompt-dialog-input worktree-dialog-select',
  });
  _vis(existingSelect, false);
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
  _vis(newInput, isNew);
  _vis(baseSelect, isNew);
  _vis(baseLabel, isNew);
  _vis(existingSelect, !isNew);
  return isNew;
}

/** Read the current branch value from the active input for the given mode. */
function readBranchValue(mode, newInput, existingSelect) {
  return mode === 'new' ? newInput.value.trim() : existingSelect.value;
}

/** Wire Enter/Escape keyboard shortcuts on multiple elements. */
function wireKeyboardShortcuts(elements, actions) {
  for (const el of elements) onKeyAction(el, actions);
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
 * Build all form elements needed by the worktree dialog.
 * @returns {{ els: object, pathEl: HTMLElement, btnNew: HTMLElement, btnExisting: HTMLElement }}
 */
function _buildWorktreeForm({ allBranches, existingBranches, currentBranch }) {
  const els = {
    newInput: buildBranchInput(),
    baseSelect: buildBaseSelect(allBranches, currentBranch),
    baseLabel: _el('label', 'worktree-dialog-sub-label', 'Base branch'),
    existingSelect: buildExistingSelect(existingBranches),
  };
  const pathEl = _el('div', 'worktree-dialog-path');
  const { btnNew, btnExisting } = buildModeButtons(() => {}, () => {});
  return { els, pathEl, btnNew, btnExisting };
}

/**
 * Validate the worktree input: return the trimmed branch name or empty string.
 */
function _validateWorktreeInput(mode, els) {
  return readBranchValue(mode, els.newInput, els.existingSelect);
}

/** Build the confirm callback that validates input and invokes cleanup with the result. */
function _buildConfirmAction(getMode, els, cleanup, repoCwd) {
  return () => {
    const mode = getMode();
    const branch = _validateWorktreeInput(mode, els);
    if (!branch) return;
    cleanup({
      branch,
      createBranch: mode === 'new',
      targetPath: defaultWorktreePath(repoCwd, branch),
      baseBranch: mode === 'new' ? (els.baseSelect.value || null) : null,
    });
  };
}

/** Bind mode-toggle and input listeners that keep the path preview in sync. */
function _bindModeListeners(btnNew, btnExisting, els, setMode, updatePath) {
  btnNew.addEventListener('click', () => setMode('new'));
  btnExisting.addEventListener('click', () => setMode('existing'));
  els.newInput.addEventListener('input', updatePath);
  els.existingSelect.addEventListener('change', updatePath);
}

/**
 * Wire up mode switching, path updates, and confirm/cancel inside the dialog.
 * Returns an initializer function to call after the modal is mounted.
 */
function _wireWorktreeDialog({ modal, cleanup, cancel, repoCwd, allBranches, existingBranches, currentBranch }) {
  let mode = 'new';
  const { els, pathEl, btnNew, btnExisting } = _buildWorktreeForm({ allBranches, existingBranches, currentBranch });

  const updatePath = () => {
    const branch = _validateWorktreeInput(mode, els);
    pathEl.textContent = branch ? defaultWorktreePath(repoCwd, branch) : '';
  };

  function setMode(next) {
    mode = next;
    btnNew.classList.toggle('active', mode === 'new');
    btnExisting.classList.toggle('active', mode === 'existing');
    const isNew = applyModeVisibility(mode, els);
    updatePath();
    (isNew ? els.newInput : els.existingSelect).focus();
  }

  _bindModeListeners(btnNew, btnExisting, els, setMode, updatePath);
  const confirm = _buildConfirmAction(() => mode, els, cleanup, repoCwd);

  wireKeyboardShortcuts([els.newInput, els.existingSelect, els.baseSelect], { onEnter: confirm, onEscape: cancel });
  populateModal(modal, { btnNew, btnExisting, els, pathEl, cancel, confirm });

  return () => { updatePath(); els.newInput.focus(); };
}

/**
 * Show the worktree creation dialog.
 *
 * @param {{ repoCwd: string, allBranches: string[], existingBranches: string[], currentBranch: string|null }} opts
 * @returns {Promise<{ branch: string, createBranch: boolean, targetPath: string, baseBranch: string|null } | null>}
 */
export function showWorktreeDialog({ repoCwd, allBranches, existingBranches, currentBranch }) {
  return createDialogBase({
    overlayClass: 'prompt-dialog-overlay',
    modalClass: 'prompt-dialog-box worktree-dialog-box',
    builder({ modal, cleanup, cancel }) {
      return _wireWorktreeDialog({ modal, cleanup, cancel, repoCwd, allBranches, existingBranches, currentBranch });
    },
  });
}
