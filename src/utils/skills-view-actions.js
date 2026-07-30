/**
 * SkillsView action handlers — extracted from SkillsView component.
 *
 * Each function receives the component state and API dependencies as
 * parameters, keeping the component class thin.
 */

import {
  _el,
  buildDialogButtons,
  createDialogBase,
  showConfirmDialog,
} from './dom-api.js';
import { onKeyAction } from './event-helpers.js';
import { updateDirtyBadge } from './skills-view-renderer.js';

/**
 * Open the root skills folder in the OS file manager.
 */
export async function openRoot(rootPath, shellApi) {
  if (!rootPath) return;
  await shellApi.openPath(rootPath);
}

/**
 * Configure the skills root path.
 * @param {import('../components/skills-view.js').SkillsView} sv - SkillsView instance (state is mutated)
 * @param {{ dialogApi: { openFolder: () => Promise<string|null> }, skillsApi: { setRoots: (payload: { roots: string[], activeRoot?: string }) => Promise<{ success: boolean, roots: string[], activeRoot: string }>, addRoot?: (path: string) => Promise<{ success: boolean, roots: string[], activeRoot: string }> }, chooseRootPathMode?: () => Promise<'browse'|'manual'|null>, promptPaths?: (currentPaths: string[]) => Promise<string[]|null> }} deps
 */
export async function configurePath(sv, deps) {
  const mode = await (deps.chooseRootPathMode || chooseRootPathMode)();
  let result = null;

  if (mode === 'browse') {
    const picked = await deps.dialogApi.openFolder();
    if (!picked) return;
    if (deps.skillsApi.addRoot) {
      result = await deps.skillsApi.addRoot(picked);
    } else {
      const roots = [...new Set([...(sv.rootPaths || [sv.rootPath].filter(Boolean)), picked])];
      result = await deps.skillsApi.setRoots({ roots, activeRoot: picked });
    }
  } else if (mode === 'manual') {
    const nextRoots = await (deps.promptPaths || promptRootPaths)(sv.rootPaths?.length ? sv.rootPaths : [sv.rootPath].filter(Boolean));
    if (!nextRoots?.length) return;
    result = await deps.skillsApi.setRoots({ roots: nextRoots, activeRoot: nextRoots[0] });
  } else {
    return;
  }

  if (result && result.success) {
    sv.rootPaths = result.roots || [];
    sv.activeRootPath = result.activeRoot || result.root || sv.rootPaths[0] || '';
    sv.rootPath = sv.activeRootPath;
    sv.selectedId = null;
    sv.editorDirty = false;
    await sv.refresh();
  }
}

function chooseRootPathMode() {
  return createDialogBase({
    overlayClass: 'confirm-overlay',
    modalClass: 'confirm-box',
    cancelValue: null,
    builder({ overlay, modal, cleanup, cancel }) {
      modal.appendChild(_el('p', null, 'Configurer les chemins des skills.'));
      modal.appendChild(buildDialogButtons({
        containerClass: 'confirm-buttons',
        confirmLabel: 'Naviguer',
        cancelLabel: 'Éditer la liste',
        confirmClass: 'confirm-ok',
        cancelClass: 'confirm-cancel',
        onConfirm: () => cleanup('browse'),
        onCancel: () => cleanup('manual'),
      }));

      onKeyAction(overlay, {
        onEscape: cancel,
      });
      overlay.setAttribute('tabindex', '-1');
      return () => modal.querySelector('.confirm-cancel')?.focus();
    },
  });
}

function promptRootPaths(currentPaths) {
  return createDialogBase({
    overlayClass: 'prompt-dialog-overlay',
    modalClass: 'prompt-dialog-box',
    cancelValue: null,
    builder({ modal, cleanup, cancel }) {
      const textarea = _el('textarea', {
        className: 'prompt-dialog-input skills-paths-textarea',
        value: (currentPaths || []).join('\n'),
        placeholder: [
          '/Users/jeremy/.codex/skills',
          '/Users/jeremy/.claude/skills',
          '/Users/jeremy/.opencode/skills',
        ].join('\n'),
      });
      const confirm = () => {
        const roots = textarea.value.split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        cleanup(roots.length ? roots : null);
      };
      onKeyAction(textarea, {
        onEscape: cancel,
      });
      modal.append(
        _el('label', 'prompt-dialog-label', 'Chemins des skills'),
        textarea,
        buildDialogButtons({
          containerClass: 'prompt-dialog-btns',
          confirmLabel: 'Utiliser ces chemins',
          cancelLabel: 'Annuler',
          confirmClass: 'prompt-dialog-confirm',
          cancelClass: 'prompt-dialog-cancel',
          onConfirm: confirm,
          onCancel: cancel,
        }),
      );
      return () => {
        textarea.focus();
        textarea.select();
      };
    },
  });
}

/**
 * Import a skill from a folder.
 * @param {import('../components/skills-view.js').SkillsView} sv - SkillsView instance
 * @param {{ dialogApi: { openFolder: () => Promise<string|null> }, skillsApi: { importSkill: (path: string) => Promise<{ success: boolean, id?: string, error?: string }> } }} deps
 */
export async function importSkill(sv, deps) {
  const picked = await deps.dialogApi.openFolder();
  if (!picked) return;
  const res = await deps.skillsApi.importSkill(picked);
  if (res && res.success) {
    sv.selectedId = res.id;
    await sv.refresh();
  } else {
    await showConfirmDialog(
      `Import impossible : ${res?.error || 'erreur inconnue'}. Le dossier doit contenir un fichier SKILL.md.`,
      { confirmLabel: 'OK', cancelLabel: 'Fermer' },
    );
  }
}

/**
 * Create a new skill via prompts.
 * @param {import('../components/skills-view.js').SkillsView} sv - SkillsView instance
 * @param {{ create: (opts: { id: string, description: string }) => Promise<{ success: boolean, id?: string }> }} skillsApi
 */
export async function createSkill(sv, skillsApi) {
  const id = await showPromptDialog({
    title: 'Nouveau skill',
    placeholder: 'identifiant-du-skill',
    confirmLabel: 'Créer',
    cancelLabel: 'Annuler',
  });
  if (!id) return;
  const description = await showPromptDialog({
    title: 'Description',
    placeholder: 'Quand activer ce skill ?',
    confirmLabel: 'Créer',
    cancelLabel: 'Annuler',
  });
  const res = await skillsApi.create({ id, description: description || '' });
  if (res && res.success) {
    sv.selectedId = res.id;
    await sv.refresh();
  }
}

/**
 * Delete a skill after confirmation.
 * @param {import('../components/skills-view.js').SkillsView} sv - SkillsView instance
 * @param {string} id - skill id
 * @param {{ deleteSkill: (id: string) => Promise<unknown> }} skillsApi
 */
export async function deleteSkill(sv, id, skillsApi) {
  const skill = sv.skills.find((candidate) => candidate.id === id);
  const label = skill?.name || skill?.skillId || id;
  const ok = await showConfirmDialog(
    `Supprimer le skill "${label}" ? Cette action est irréversible.`,
    { confirmLabel: 'Supprimer', cancelLabel: 'Annuler' },
  );
  if (!ok) return;
  await skillsApi.deleteSkill(id);
  if (sv.selectedId === id) sv.selectedId = null;
  await sv.refresh();
}

/**
 * Select a skill (with dirty-check).
 * @param {import('../components/skills-view.js').SkillsView} sv - SkillsView instance
 * @param {string} id - skill id
 */
export async function selectSkill(sv, id) {
  if (sv.editorDirty) {
    const ok = await showConfirmDialog(
      'Modifications non enregistrées. Abandonner les changements en cours ?',
      { confirmLabel: 'Abandonner', cancelLabel: 'Rester' },
    );
    if (!ok) return;
  }
  sv.selectedId = id;
  sv.editorDirty = false;
  sv._renderList();
  await sv._renderEditor();
}

/**
 * Save the active skill.
 * @param {import('../components/skills-view.js').SkillsView} sv - SkillsView instance
 * @param {{ write: (path: string, content: string) => Promise<{ success: boolean }> }} skillsApi
 */
export async function save(sv, skillsApi) {
  const skill = sv.skills.find((s) => s.id === sv.selectedId);
  if (!skill) return;
  const res = await skillsApi.write(skill.path, sv.editorValue);
  if (res && res.success) {
    sv.editorDirty = false;
    updateDirtyBadge(sv._dirtyBadgeEl, false);
    await sv.refresh();
  }
}
