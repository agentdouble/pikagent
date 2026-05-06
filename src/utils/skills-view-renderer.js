/**
 * DOM construction helpers for SkillsView.
 * Extracted from skills-view.js to reduce component size.
 */

import { _el } from './dom.js';

/**
 * Build the main layout: header + body (list + editor panels).
 *
 * @param {{ rootPath: string, onConfigurePath: () => void, onOpenRoot: () => void, onImportSkill: () => void, onCreateSkill: () => void, onRefresh: () => void }} deps
 * @returns {{ header: HTMLElement, listEl: HTMLElement, editorEl: HTMLElement, rootBadgeEl: HTMLElement }}
 */
export function buildSkillsLayout(deps) {
  const rootBadgeEl = _el('div', {
    className: 'skills-root-badge',
    title: 'Dossier des skills utilisateur',
    textContent: deps.rootPath || '…',
  });

  const header = _el('div', 'skills-header',
    _el('div', 'skills-header-left',
      _el('h2', 'skills-title', 'Skills'),
      rootBadgeEl,
    ),
    _el('div', 'skills-header-right',
      _el('button', {
        className: 'skills-btn skills-btn-secondary',
        textContent: 'Configurer le chemin…',
        onClick: () => deps.onConfigurePath(),
      }),
      _el('button', {
        className: 'skills-btn skills-btn-secondary',
        textContent: 'Ouvrir le dossier',
        onClick: () => deps.onOpenRoot(),
      }),
      _el('button', {
        className: 'skills-btn skills-btn-secondary',
        textContent: 'Importer',
        onClick: () => deps.onImportSkill(),
      }),
      _el('button', {
        className: 'skills-btn skills-btn-primary',
        textContent: '+ Nouveau skill',
        onClick: () => deps.onCreateSkill(),
      }),
      _el('button', {
        className: 'skills-btn skills-btn-secondary',
        textContent: 'Rafraîchir',
        onClick: () => deps.onRefresh(),
      }),
    ),
  );

  const listEl = _el('div', 'skills-list');
  const editorEl = _el('div', 'skills-editor');

  return { header, listEl, editorEl, rootBadgeEl };
}

/**
 * Rebuild the skill list items inside `listEl`.
 *
 * @param {HTMLElement} listEl
 * @param {Array<{ id: string, name: string, description?: string, source: string }>} skills
 * @param {string|null} selectedId
 * @param {{ onSelect: (id: string) => void, onDelete: (id: string) => void }} callbacks
 */
export function renderSkillList(listEl, skills, selectedId, callbacks) {
  listEl.replaceChildren();

  if (skills.length === 0) {
    listEl.appendChild(_el('div', 'skills-empty', 'Aucun skill. Créez-en un pour commencer.'));
    return;
  }

  for (const skill of skills) {
    const item = _el('div', {
      className: `skills-item ${selectedId === skill.id ? 'skills-item-active' : ''}`,
      onClick: () => callbacks.onSelect(skill.id),
    },
      _el('div', 'skills-item-main',
        _el('div', 'skills-item-name', skill.name),
        skill.description && _el('div', 'skills-item-desc', skill.description),
      ),
      _el('div', 'skills-item-meta',
        _el('div', 'skills-item-source', skill.source),
      ),
      _el('button', {
        className: 'skills-item-delete',
        title: 'Supprimer',
        textContent: '✕',
        onClick: (e) => { e.stopPropagation(); callbacks.onDelete(skill.id); },
      }),
    );
    listEl.appendChild(item);
  }
}

/**
 * Build the editor panel for a selected skill.
 *
 * @param {HTMLElement} editorEl
 * @param {{ name: string, path: string }} skill
 * @param {string} editorValue
 * @param {boolean} editorDirty
 * @param {{ onSave: () => void, onEditorInput: (value: string) => void }} callbacks
 * @returns {{ dirtyBadgeEl: HTMLElement, textareaEl: HTMLTextAreaElement }}
 */
export function renderSkillEditor(editorEl, skill, editorValue, editorDirty, callbacks) {
  editorEl.replaceChildren();

  const dirtyBadgeEl = _el('div', {
    className: `skills-editor-dirty ${editorDirty ? 'is-dirty' : ''}`,
    textContent: editorDirty ? 'Modifié' : 'Enregistré',
  });

  const toolbar = _el('div', 'skills-editor-toolbar',
    _el('div', 'skills-editor-toolbar-left',
      _el('div', 'skills-editor-name', skill.name),
      _el('div', 'skills-editor-path', skill.path),
    ),
    _el('div', 'skills-editor-toolbar-right',
      dirtyBadgeEl,
      _el('button', {
        className: 'skills-btn skills-btn-primary',
        textContent: 'Enregistrer',
        onClick: () => callbacks.onSave(),
      }),
    ),
  );

  const textareaEl = _el('textarea', {
    className: 'skills-editor-textarea',
    spellcheck: false,
    value: editorValue,
    onInput: (e) => callbacks.onEditorInput(e.target.value),
  });

  editorEl.appendChild(toolbar);
  editorEl.appendChild(textareaEl);

  return { dirtyBadgeEl, textareaEl };
}

/**
 * Render the empty editor placeholder.
 *
 * @param {HTMLElement} editorEl
 */
export function renderEditorEmpty(editorEl) {
  editorEl.replaceChildren();
  editorEl.appendChild(_el('div', 'skills-editor-empty',
    _el('div', 'skills-editor-empty-title', 'Sélectionnez un skill'),
    _el('div', 'skills-editor-empty-sub', 'Cliquez sur un skill à gauche pour l\'éditer, ou créez-en un nouveau.'),
  ));
}
