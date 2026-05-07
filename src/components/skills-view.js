import { _el } from '../utils/workspace-dom.js';
import { showPromptDialog, showConfirmDialog } from '../utils/dom-dialogs.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import {
  renderHeader, renderSkillList, renderEditorContent, renderEditorEmpty, updateDirtyBadge,
} from '../utils/skills-view-renderer.js';
import { skillsApi, shellApi, dialogApi } from '../utils/skills-api-facade.js';

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
    this.skills = await skillsApi.list();
    if (!this.rootPath) this.rootPath = await skillsApi.getRoot();
    if (this.selectedId && !this.skills.find((s) => s.id === this.selectedId)) {
      this.selectedId = null;
    }
    this._renderList();
    await this._renderEditor();
  }

  render() {
    this.el.replaceChildren();

    const { header, rootBadgeEl } = renderHeader(this.rootPath, {
      onConfigurePath: () => this._configurePath(),
      onOpenRoot: () => this._openRoot(),
      onImport: () => this._importSkill(),
      onCreate: () => this._createSkill(),
      onRefresh: () => this.refresh(),
    });
    this._rootBadgeEl = rootBadgeEl;
    this.el.appendChild(header);

    const body = _el('div', 'skills-body');
    this.listEl = _el('div', 'skills-list');
    this.editorEl = _el('div', 'skills-editor');
    body.appendChild(this.listEl);
    body.appendChild(this.editorEl);
    this.el.appendChild(body);

    this.refresh();
  }

  _renderList() {
    if (!this.listEl) return;
    if (this._rootBadgeEl) this._rootBadgeEl.textContent = this.rootPath;
    renderSkillList(this.listEl, this.skills, this.selectedId, {
      onSelect: (id) => this._selectSkill(id),
      onDelete: (id) => this._deleteSkill(id),
    });
  }

  async _renderEditor() {
    if (!this.editorEl) return;
    if (!this.selectedId) { renderEditorEmpty(this.editorEl); return; }

    const skill = this.skills.find((s) => s.id === this.selectedId);
    if (!skill) return;

    const content = await skillsApi.read(skill.path);
    this.editorValue = content ?? '';
    this.editorDirty = false;

    const { dirtyBadgeEl } = renderEditorContent(this.editorEl, skill, this.editorValue, {
      onSave: () => this._save(),
      onInput: (value) => this._onEditorInput(value),
    }, this.editorDirty);
    this._dirtyBadgeEl = dirtyBadgeEl;
  }

  _onEditorInput(value) {
    this.editorValue = value;
    if (!this.editorDirty) {
      this.editorDirty = true;
      updateDirtyBadge(this._dirtyBadgeEl, true);
    }
  }

  // --- Actions ---

  async _openRoot() {
    if (!this.rootPath) return;
    await shellApi.openPath(this.rootPath);
  }

  async _configurePath() {
    const picked = await dialogApi.openFolder();
    if (!picked) return;
    const res = await skillsApi.setRoot(picked);
    if (res && res.success) {
      this.rootPath = res.root;
      this.selectedId = null;
      this.editorDirty = false;
      await this.refresh();
    }
  }

  async _importSkill() {
    const picked = await dialogApi.openFolder();
    if (!picked) return;
    const res = await skillsApi.importSkill(picked);
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
    const res = await skillsApi.create({ id, description: description || '' });
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
    await skillsApi.deleteSkill(id);
    if (this.selectedId === id) this.selectedId = null;
    await this.refresh();
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

  async _save() {
    const skill = this.skills.find((s) => s.id === this.selectedId);
    if (!skill) return;
    const res = await skillsApi.write(skill.path, this.editorValue);
    if (res && res.success) {
      this.editorDirty = false;
      updateDirtyBadge(this._dirtyBadgeEl, false);
      await this.refresh();
    }
  }

  dispose() {
    super.dispose();
    this.el.remove();
  }
}

registerComponent('SkillsView', SkillsView);
