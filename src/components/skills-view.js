import { _el } from '../utils/dom.js';
import { showPromptDialog, showConfirmDialog } from '../utils/dom-dialogs.js';
import { registerComponent } from '../utils/component-registry.js';
import { buildSkillsLayout, renderSkillList, renderSkillEditor, renderEditorEmpty } from '../utils/skills-view-renderer.js';

export class SkillsView {
  constructor(container) {
    this.container = container;
    this.skills = [];
    this.selectedId = null;
    this.rootPath = '';
    this.editorDirty = false;
    this.editorValue = '';
    this.disposed = false;

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

  render() {
    this.el.replaceChildren();

    const { header, listEl, editorEl, rootBadgeEl } = buildSkillsLayout({
      rootPath: this.rootPath,
      onConfigurePath: () => this._configurePath(),
      onOpenRoot: () => this._openRoot(),
      onImportSkill: () => this._importSkill(),
      onCreateSkill: () => this._createSkill(),
      onRefresh: () => this.refresh(),
    });
    this._rootBadgeEl = rootBadgeEl;
    this.listEl = listEl;
    this.editorEl = editorEl;

    this.el.appendChild(header);
    const body = _el('div', 'skills-body');
    body.appendChild(this.listEl);
    body.appendChild(this.editorEl);
    this.el.appendChild(body);

    this.refresh();
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

    renderSkillList(this.listEl, this.skills, this.selectedId, {
      onSelect: (id) => this._selectSkill(id),
      onDelete: (id) => this._deleteSkill(id),
    });
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

    if (!this.selectedId) {
      renderEditorEmpty(this.editorEl);
      return;
    }

    const skill = this.skills.find((s) => s.id === this.selectedId);
    if (!skill) return;

    const content = await window.api.skills.read(skill.path);
    this.editorValue = content ?? '';
    this.editorDirty = false;

    const { dirtyBadgeEl, textareaEl } = renderSkillEditor(
      this.editorEl, skill, this.editorValue, this.editorDirty,
      { onSave: () => this._save(), onEditorInput: (v) => this._onEditorInput(v) },
    );
    this._dirtyBadgeEl = dirtyBadgeEl;
    this._textareaEl = textareaEl;
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
    this.disposed = true;
    this.el.remove();
  }
}

registerComponent('SkillsView', SkillsView);
