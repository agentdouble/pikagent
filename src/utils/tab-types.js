/**
 * Tab type definitions — canonical home of the WorkspaceTab class.
 *
 * This file is the canonical home of the WorkspaceTab class.
 */

// ── Pure data model ──
export class WorkspaceTab {
  constructor(id, name, cwd) {
    this.id = id;
    this.name = name;
    this.cwd = cwd;
    this.userNamed = false;
    this.noShortcut = false;
    this.colorGroup = null;
    this.fileTree = null;
    this.terminalPanel = null;
    this.fileViewer = null;
    this.layoutElement = null;
    this.pathTextEl = null;
    this.branchBadgeEl = null;
    this._panelWidths = null;
    /**
     * When set, this tab owns a git worktree and should offer cleanup on close.
     * Shape: { mainRepoCwd: string, worktreePath: string }
     * @type {{ mainRepoCwd: string, worktreePath: string } | null}
     */
    this.worktree = null;
  }
}
