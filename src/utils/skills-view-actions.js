/**
 * SkillsView action handlers — extracted from SkillsView component.
 *
 * Each function receives the component state and API dependencies as
 * parameters, keeping the component class thin.
 */

import { showPromptDialog, showConfirmDialog } from './dom-dialogs.js';
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
 * @param {{ dialogApi: { openFolder: () => Promise<string|null> }, skillsApi: { setRoot: (path: string) => Promise<{ success: boolean, root: string }> } }} deps
 */
export async function configurePath(sv, deps) {
  const picked = await deps.dialogApi.openFolder();
  if (!picked) return;
  const res = await deps.skillsApi.setRoot(picked);
  if (res && res.success) {
    sv.rootPath = res.root;
    sv.selectedId = null;
    sv.editorDirty = false;
    await sv.refresh();
  }
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
  const ok = await showConfirmDialog(
    `Supprimer le skill "${id}" ? Cette action est irréversible.`,
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
