import { _el } from '../utils/workspace-dom.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import {
  renderHeader, renderSkillList, renderEditorContent, renderEditorEmpty, updateDirtyBadge,
} from '../utils/skills-view-renderer.js';
import {
  openRoot, configurePath, importSkill, createSkill,
  deleteSkill, selectSkill, save,
} from '../utils/skills-view-actions.js';
import { skillsApi, shellApi, dialogApi } from '../utils/skills-services.js';

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
    if (!this.editorDirty) { this.editorDirty = true; updateDirtyBadge(this._dirtyBadgeEl, true); }
  }

  // --- Actions (delegated) ---
  async _openRoot() { await openRoot(this.rootPath, shellApi); }
  async _configurePath() { await configurePath(this, { dialogApi, skillsApi }); }
  async _importSkill() { await importSkill(this, { dialogApi, skillsApi }); }
  async _createSkill() { await createSkill(this, skillsApi); }
  async _deleteSkill(id) { await deleteSkill(this, id, skillsApi); }
  async _selectSkill(id) { await selectSkill(this, id); }
  async _save() { await save(this, skillsApi); }

  dispose() { super.dispose(); this.el.remove(); }
}

registerComponent('SkillsView', SkillsView);
