/**
 * Skills view rendering helpers — extracted from SkillsView component.
 *
 * Pure DOM-construction functions. State is passed in, never owned here.
 */

import { _el, renderList } from './workspace-dom.js';

/**
 * Build the top header bar with action buttons.
 * @param {string} rootPath
 * @param {{ onConfigurePath: () => void, onOpenRoot: () => void, onImport: () => void, onCreate: () => void, onRefresh: () => void }} handlers
 * @returns {{ header: HTMLElement, rootBadgeEl: HTMLElement }}
 */
export function renderHeader(rootPath, handlers) {
  const rootBadgeEl = _el('div', {
    className: 'skills-root-badge',
    title: 'Dossier des skills utilisateur',
    textContent: rootPath || '…',
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
        onClick: handlers.onConfigurePath,
      }),
      _el('button', {
        className: 'skills-btn skills-btn-secondary',
        textContent: 'Ouvrir le dossier',
        onClick: handlers.onOpenRoot,
      }),
      _el('button', {
        className: 'skills-btn skills-btn-secondary',
        textContent: 'Importer',
        onClick: handlers.onImport,
      }),
      _el('button', {
        className: 'skills-btn skills-btn-primary',
        textContent: '+ Nouveau skill',
        onClick: handlers.onCreate,
      }),
      _el('button', {
        className: 'skills-btn skills-btn-secondary',
        textContent: 'Rafraîchir',
        onClick: handlers.onRefresh,
      }),
    ),
  );

  return { header, rootBadgeEl };
}

/**
 * Render the skill list into the given container.
 * @param {HTMLElement} listEl
 * @param {Array<{id: string, name: string, description?: string, source: string}>} skills
 * @param {string|null} selectedId
 * @param {{ onSelect: (id: string) => void, onDelete: (id: string) => void }} handlers
 */
export function renderSkillList(listEl, skills, selectedId, handlers) {
  renderList(listEl, skills, (skill) => _el('div', {
    className: `skills-item ${selectedId === skill.id ? 'skills-item-active' : ''}`,
    onClick: () => handlers.onSelect(skill.id),
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
      textContent: '\u2715',
      onClick: (e) => { e.stopPropagation(); handlers.onDelete(skill.id); },
    }),
  ));

  if (skills.length === 0) {
    listEl.appendChild(_el('div', 'skills-empty', 'Aucun skill. Créez-en un pour commencer.'));
  }
}

/**
 * Render the editor panel for a selected skill.
 * @param {HTMLElement} editorEl
 * @param {{ name: string, path: string }} skill
 * @param {string} content
 * @param {{ onSave: () => void, onInput: (value: string) => void }} handlers
 * @param {boolean} isDirty
 * @returns {{ dirtyBadgeEl: HTMLElement, textareaEl: HTMLElement }}
 */
export function renderEditorContent(editorEl, skill, content, handlers, isDirty) {
  editorEl.replaceChildren();

  const dirtyBadgeEl = createDirtyBadge(isDirty);

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
        onClick: handlers.onSave,
      }),
    ),
  );

  const textareaEl = _el('textarea', {
    className: 'skills-editor-textarea',
    spellcheck: false,
    value: content,
    onInput: (e) => handlers.onInput(e.target.value),
  });

  editorEl.appendChild(toolbar);
  editorEl.appendChild(textareaEl);

  return { dirtyBadgeEl, textareaEl };
}

/**
 * Render the empty editor placeholder.
 * @param {HTMLElement} editorEl
 */
export function renderEditorEmpty(editorEl) {
  editorEl.replaceChildren();
  editorEl.appendChild(_el('div', 'skills-editor-empty',
    _el('div', 'skills-editor-empty-title', 'Sélectionnez un skill'),
    _el('div', 'skills-editor-empty-sub', 'Cliquez sur un skill à gauche pour l\'éditer, ou créez-en un nouveau.'),
  ));
}

/**
 * Create a dirty/saved badge element.
 * @param {boolean} isDirty
 * @returns {HTMLElement}
 */
export function createDirtyBadge(isDirty) {
  return _el('div', {
    className: `skills-editor-dirty ${isDirty ? 'is-dirty' : ''}`,
    textContent: isDirty ? 'Modifié' : 'Enregistré',
  });
}

/**
 * Update the dirty badge state.
 * @param {HTMLElement} el
 * @param {boolean} isDirty
 */
export function updateDirtyBadge(el, isDirty) {
  if (!el) return;
  el.textContent = isDirty ? 'Modifié' : 'Enregistré';
  el.classList.toggle('is-dirty', isDirty);
}
