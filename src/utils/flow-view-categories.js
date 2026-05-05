/**
 * Flow view category management — extracted from FlowView component.
 *
 * Handles creation, renaming, deletion, and inline rename of flow categories.
 */

import { showPromptDialog } from './dom-dialogs.js';
import { generateId } from './id.js';
import { deleteCategoryData, startInlineRename } from './flow-view-subsystem.js';

/**
 * Prompt the user to create a new category, add it to catData, and persist.
 * @param {{ categories: Array<{id: string, name: string}>, order: Record<string, string[]> }} catData
 * @param {() => Promise<void>} persistFn
 * @param {() => void} renderFn
 */
export async function addCategory(catData, persistFn, renderFn) {
  const name = await showPromptDialog({
    title: 'Nouvelle catégorie',
    placeholder: 'Nom de la catégorie',
    confirmLabel: 'Créer',
    cancelLabel: 'Annuler',
  });
  if (!name) return;
  const cat = { id: generateId('cat'), name };
  catData.categories.push(cat);
  catData.order[cat.id] = [];
  await persistFn();
  renderFn();
}

/**
 * Start inline rename for a category.
 * @param {{ categories: Array<{id: string, name: string}> }} catData
 * @param {string} catId
 * @param {HTMLElement} nameEl
 * @param {() => Promise<void>} persistFn
 * @param {() => void} renderFn
 */
export function renameCategoryInline(catData, catId, nameEl, persistFn, renderFn) {
  const cat = catData.categories.find(c => c.id === catId);
  if (!cat) return;

  const finish = async (newName) => {
    if (newName && newName !== cat.name) cat.name = newName;
    await persistFn();
    renderFn();
  };

  startInlineRename(nameEl, {
    className: 'flow-category-name-input',
    value: cat.name,
    onCommit: finish,
    onCancel: () => finish(null),
  });
}

/**
 * Delete a category from catData and persist.
 * @param {{ categories: Array<{id: string, name: string}>, order: Record<string, string[]> }} catData
 * @param {string} catId
 * @param {() => Promise<void>} persistFn
 * @param {() => void} renderFn
 */
export async function deleteCategory(catData, catId, persistFn, renderFn) {
  if (!deleteCategoryData(catData, catId)) return;
  await persistFn();
  renderFn();
}
