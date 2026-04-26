import { _el } from '../utils/dom.js';
import { showPromptDialog, showConfirmDialog } from '../utils/dom-dialogs.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';

export class SkillsView extends ComponentBase {
  constructor(container) {
    super(container);
    this.skills = [];
    this.selectedId = null;
    this.rootPath = '';
    this.editorDirty = false;
    this.editorValue = '';

    this.el = _el('div', 'skills-container');
    container.appendChild(this.el);
    this.render();
  }

  async refresh() {
    if (this.disposed) return;
    this.skills = await window.api.skills.list();
    if (!this.rootPath) this.rootPath = await window.api.skills.getRoot();
    if (this.selectedId && !this.skills.find((s) => s.id === this.selectedId)) {
      this.selectedId = null;
    }
    this._renderList();
    await this._renderEditor();
  }

  async render() {
    this.el.replaceChildren();

    const header = _el('div', 'skills-header',
      _el('div', 'skills-header-left',
        _el('h2', 'skills-title', 'Skills'),
        this._rootBadge(),
      ),
      _el('div', 'skills-header-right',
        _el('button', {
          className: 'skills-btn skills-btn-secondary',
          textContent: 'Configurer le chemin…',
          onClick: () => this._configurePath(),
        }),
        _el('button', {
          className: 'skills-btn skills-btn-secondary',
          textContent: 'Ouvrir le dossier',
          onClick: () => this._openRoot(),
        }),
        _el('button', {
          className: 'skills-btn skills-btn-secondary',
          textContent: 'Importer',
          onClick: () => this._importSkill(),
        }),
        _el('button', {
          className: 'skills-btn skills-btn-primary',
          textContent: '+ Nouveau skill',
          onClick: () => this._createSkill(),
        }),
        _el('button', {
          className: 'skills-btn skills-btn-secondary',
          textContent: 'Rafraîchir',
          onClick: () => this.refresh(),
        }),
      ),
    );
    this.el.appendChild(header);

    const body = _el('div', 'skills-body');
    this.listEl = _el('div', 'skills-list');
    this.editorEl = _el('div', 'skills-editor');
    body.appendChild(this.listEl);
    body.appendChild(this.editorEl);
    this.el.appendChild(body);

    await this.refresh();
  }

  _rootBadge() {
    this._rootBadgeEl = _el('div', {
      className: 'skills-root-badge',
      title: 'Dossier des skills utilisateur',
      textContent: this.rootPath || '…',
    });
    return this._rootBadgeEl;
  }

  async _openRoot() {
    if (!this.rootPath) return;
    await window.api.shell.openPath(this.rootPath);
  }

  async _configurePath() {
    const picked = await window.api.dialog.openFolder();
    if (!picked) return;
    const res = await window.api.skills.setRoot(picked);
    if (res && res.success) {
      this.rootPath = res.root;
      this.selectedId = null;
      this.editorDirty = false;
      await this.refresh();
    }
  }

  async _importSkill() {
    const picked = await window.api.dialog.openFolder();
    if (!picked) return;
    const res = await window.api.skills.import(picked);
    if (res && res.success) {
      this.selectedId = res.id;
      await this.refresh();
    } else {
      await showConfirmDialog(
        `Import impossible : ${res?.error || 'erreur inconnue'}. Le dossier doit contenir un fichier SKILL.md.`,
        { confirmLabel: 'OK', cancelLabel: 'Fermer' },
      );
    }
  }

  async _createSkill() {
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
    const res = await window.api.skills.create({ id, description: description || '' });
    if (res && res.success) {
      this.selectedId = res.id;
      await this.refresh();
    }
  }

  async _deleteSkill(id) {
    const ok = await showConfirmDialog(
      `Supprimer le skill "${id}" ? Cette action est irréversible.`,
      { confirmLabel: 'Supprimer', cancelLabel: 'Annuler' },
    );
    if (!ok) return;
    await window.api.skills.delete(id);
    if (this.selectedId === id) this.selectedId = null;
    await this.refresh();
  }

  _renderList() {
    if (!this.listEl) return;
    if (this._rootBadgeEl) this._rootBadgeEl.textContent = this.rootPath;

    this.listEl.replaceChildren();

    if (this.skills.length === 0) {
      this.listEl.appendChild(_el('div', 'skills-empty', 'Aucun skill. Créez-en un pour commencer.'));
      return;
    }

    for (const skill of this.skills) {
      const item = _el('div', {
        className: `skills-item ${this.selectedId === skill.id ? 'skills-item-active' : ''}`,
        onClick: () => this._selectSkill(skill.id),
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
          onClick: (e) => { e.stopPropagation(); this._deleteSkill(skill.id); },
        }),
      );
      this.listEl.appendChild(item);
    }
  }

  async _selectSkill(id) {
    if (this.editorDirty) {
      const ok = await showConfirmDialog(
        'Modifications non enregistrées. Abandonner les changements en cours ?',
        { confirmLabel: 'Abandonner', cancelLabel: 'Rester' },
      );
      if (!ok) return;
    }
    this.selectedId = id;
    this.editorDirty = false;
    this._renderList();
    await this._renderEditor();
  }

  async _renderEditor() {
    if (!this.editorEl) return;
    this.editorEl.replaceChildren();

    if (!this.selectedId) {
      this.editorEl.appendChild(_el('div', 'skills-editor-empty',
        _el('div', 'skills-editor-empty-title', 'Sélectionnez un skill'),
        _el('div', 'skills-editor-empty-sub', 'Cliquez sur un skill à gauche pour l\'éditer, ou créez-en un nouveau.'),
      ));
      return;
    }

    const skill = this.skills.find((s) => s.id === this.selectedId);
    if (!skill) return;

    const content = await window.api.skills.read(skill.path);
    this.editorValue = content ?? '';
    this.editorDirty = false;

    const toolbar = _el('div', 'skills-editor-toolbar',
      _el('div', 'skills-editor-toolbar-left',
        _el('div', 'skills-editor-name', skill.name),
        _el('div', 'skills-editor-path', skill.path),
      ),
      _el('div', 'skills-editor-toolbar-right',
        this._dirtyBadge(),
        _el('button', {
          className: 'skills-btn skills-btn-primary',
          textContent: 'Enregistrer',
          onClick: () => this._save(),
        }),
      ),
    );

    const textarea = _el('textarea', {
      className: 'skills-editor-textarea',
      spellcheck: false,
      value: this.editorValue,
      onInput: (e) => this._onEditorInput(e.target.value),
    });
    this._textareaEl = textarea;

    this.editorEl.appendChild(toolbar);
    this.editorEl.appendChild(textarea);
  }

  _dirtyBadge() {
    this._dirtyBadgeEl = _el('div', {
      className: `skills-editor-dirty ${this.editorDirty ? 'is-dirty' : ''}`,
      textContent: this.editorDirty ? 'Modifié' : 'Enregistré',
    });
    return this._dirtyBadgeEl;
  }

  _onEditorInput(value) {
    this.editorValue = value;
    const nextDirty = true;
    if (this.editorDirty !== nextDirty) {
      this.editorDirty = nextDirty;
      this._updateDirtyBadge();
    }
  }

  _updateDirtyBadge() {
    if (!this._dirtyBadgeEl) return;
    this._dirtyBadgeEl.textContent = this.editorDirty ? 'Modifié' : 'Enregistré';
    this._dirtyBadgeEl.classList.toggle('is-dirty', this.editorDirty);
  }

  async _save() {
    const skill = this.skills.find((s) => s.id === this.selectedId);
    if (!skill) return;
    const res = await window.api.skills.write(skill.path, this.editorValue);
    if (res && res.success) {
      this.editorDirty = false;
      this._updateDirtyBadge();
      await this.refresh();
    }
  }

  dispose() {
    super.dispose();
    this.el.remove();
  }
}

registerComponent('SkillsView', SkillsView);
