import { _el } from '../utils/dom-api.js';
import { buildSelect } from '../utils/form-helpers.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import { loopFacade as loopApi } from '../facades/loop-facade.js';
import { dialogFacade as dialogApi } from '../facades/dialog-facade.js';
import {
  DAY_NAMES,
  DEFAULT_TIME,
  INTERVAL_HOURS,
  SCHEDULE_LABELS,
  SCHEDULE_TYPE_CONFIG,
  WEEKDAY_INDICES,
  buildScheduleData,
} from '../utils/flow-schedule-helpers.js';
import {
  DEFAULT_HOOK_DEBOUNCE_SECONDS,
  DEFAULT_HOOK_EVENT,
  HOOK_PROVIDER_OPTIONS,
  TRIGGER_TYPE_LABELS,
  buildHookTrigger,
  joinPathPatterns,
} from '../utils/flow-trigger-helpers.js';
import {
  AGENT_OPTIONS,
  CODEX_MODEL_SUGGESTIONS,
  CODEX_REASONING_EFFORT_OPTIONS,
  CODEX_SERVICE_TIER_OPTIONS,
  DEFAULT_LOOP_VIEWPORT,
  EDGE_PORTS,
  NODE_COLOR_OPTIONS,
  NODE_SIZE,
  REFRESH_MS,
  captureLogScrollState,
  clampZoom,
  createDefaultLoop,
  createNode,
  defaultAgentHookTrigger,
  defaultAgentSchedule,
  defaultEdgePorts,
  edgeGeometry,
  formatAgentTrigger,
  formatHeadlessAgentLabel,
  formatHeadlessAgentPreview,
  getNodeColor,
  getNodePreview,
  getNodeTitle,
  isWatcherNode,
  normalizeLoopViewport,
  processMap,
  restoreLogScrollState,
  runningCount,
  selectedEdges,
  splitHeadlessAgentsForBoard,
  zoomAtPoint,
} from '../utils/loop-view-helpers.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const POINTER_CLICK_THRESHOLD = 4;
const ACTIVE_BOARD_STORAGE_KEY = 'pickagent.loop.activeBoardId';
const HEADLESS_PANEL_STORAGE_KEY = 'pickagent.loop.headlessPanelCollapsed';
const EDGE_ROUTING_STORAGE_KEY = 'pickagent.loop.edgeRoutingMode';
const BOARD_VIEWPORT_STORAGE_PREFIX = 'pickagent.loop.boardViewport.';
const LINK_ARROW_MARKER_ID = 'loop-board-link-arrow';
const LOOP_TRIGGER_TYPE_LABELS = {
  ...TRIGGER_TYPE_LABELS,
  link: 'Lien',
};

class LoopView extends ComponentBase {
  constructor(container) {
    super(container);
  }

  _initState() {
    this.boards = [];
    this.activeBoardId = readStoredActiveBoardId();
    this.loop = createDefaultLoop();
    this.snapshot = null;
    this.headlessSnapshot = { generatedAt: '', agents: [], errors: [] };
    this.killingHeadlessAgentIds = new Set();
    this.headlessPanelCollapsed = readStoredBoolean(HEADLESS_PANEL_STORAGE_KEY, false);
    this.selectedNodeId = null;
    this.selectedEdgeId = null;
    this.linkSourceId = null;
    this.linkSourcePort = 'right';
    this.edgeRoutingMode = readStoredEdgeRoutingMode();
    this.inspectorCollapsed = true;
    this.drag = null;
    this.edgeDrag = null;
    this.pan = null;
    const viewport = readStoredBoardViewport(this.activeBoardId);
    this.panOffset = viewport.panOffset;
    this.zoom = viewport.zoom;
    this.nodeLog = '';
    this.error = '';
    this.saving = false;
    this._autoSaveTimer = null;
    this.el = _el('div', 'loop-builder');
    this.container.appendChild(this.el);
  }

  _afterInit() {
    void this.refresh();
    const snapshotTimer = window.setInterval(() => void this._refreshSnapshot(), REFRESH_MS);
    const headlessTimer = window.setInterval(() => void this._refreshHeadlessAgents(), REFRESH_MS);
    const logTimer = window.setInterval(() => void this._refreshNodeLog(), REFRESH_MS);
    const onFocus = () => void this.refresh();
    window.addEventListener('focus', onFocus);
    this._track(() => window.clearInterval(snapshotTimer));
    this._track(() => window.clearInterval(headlessTimer));
    this._track(() => window.clearInterval(logTimer));
    this._track(() => window.removeEventListener('focus', onFocus));
  }

  async refresh() {
    if (this.disposed) return;
    await this._loadBoards();
    await this._loadLoop();
    await this._refreshSnapshot(false);
    await this._refreshHeadlessAgents(false);
    await this._refreshNodeLog(false);
    this._render();
  }

  render() {
    this._render();
  }

  dispose() {
    this._persistBoardViewport();
    super.dispose();
    this._clearAutoSave();
    this.el.remove();
  }

  get selectedNode() {
    return this.loop.nodes.find((node) => node.id === this.selectedNodeId) || null;
  }

  async _loadBoards() {
    try {
      this.boards = await loopApi.list();
      if (!this.boards.length) this.boards = [{ id: 'main', name: 'Boucles', nodeCount: 0 }];
      if (!this.boards.some((board) => board.id === this.activeBoardId)) {
        this.activeBoardId = this.boards[0].id;
        writeStoredActiveBoardId(this.activeBoardId);
        this._restoreBoardViewport();
      }
    } catch (err) {
      this._setError(err);
    }
  }

  async _loadLoop() {
    try {
      const next = await loopApi.get(this.activeBoardId);
      const previousBoardId = this.activeBoardId;
      this.loop = next || createDefaultLoop();
      this.activeBoardId = this.loop.id || 'main';
      writeStoredActiveBoardId(this.activeBoardId);
      if (this.activeBoardId !== previousBoardId) this._restoreBoardViewport();
      if (this.selectedNodeId && !this.loop.nodes.some((node) => node.id === this.selectedNodeId)) {
        this.selectedNodeId = null;
      }
    } catch (err) {
      this._setError(err);
    }
  }

  async _refreshSnapshot(shouldRender = true) {
    if (this.disposed) return;
    try {
      this.snapshot = await loopApi.snapshot(this.loop.id || this.activeBoardId || 'main');
      if (shouldRender) this._renderUnlessEditing();
    } catch (err) {
      this._setError(err);
    }
  }

  async _refreshHeadlessAgents(shouldRender = true) {
    if (this.disposed) return;
    try {
      this.headlessSnapshot = await loopApi.headlessList();
      if (shouldRender) this._renderUnlessEditing();
    } catch (err) {
      this.headlessSnapshot = {
        generatedAt: '',
        agents: [],
        errors: [err?.message || String(err)],
      };
      if (shouldRender) this._renderUnlessEditing();
    }
  }

  async _refreshNodeLog(shouldRender = true) {
    if (this.disposed) return;
    if (!this.selectedNodeId) {
      if (this.nodeLog) {
        this.nodeLog = '';
        if (shouldRender) this._renderUnlessEditing();
      }
      return;
    }
    try {
      const nextLog = (await loopApi.getNodeLog({
        boardId: this.loop.id || this.activeBoardId || 'main',
        nodeId: this.selectedNodeId,
      })) || '';
      if (nextLog !== this.nodeLog) {
        this.nodeLog = nextLog;
        if (shouldRender) this._renderUnlessEditing();
      }
    } catch (err) {
      this._setError(err);
    }
  }

  _setError(err) {
    this.error = err?.message || String(err);
    this._render();
  }

  _render() {
    if (!this.el || this.disposed) return;
    const inspectorScrollTop = this.el.querySelector('.loop-inspector')?.scrollTop ?? 0;
    const headlessScrollTop = this.el.querySelector('.loop-headless-panel')?.scrollTop ?? 0;
    const logScrollState = captureLogScrollState(this.el.querySelector('.loop-log-output'));
    const previousSelectedNodeId = this.selectedNodeId;
    const selectedNode = this.selectedNode;
    const inspectorVisible = Boolean(selectedNode && !this.inspectorCollapsed);
    this.el.replaceChildren(
      this._renderHeader(),
      this.error ? _el('div', { className: 'loop-builder-error', textContent: this.error }) : null,
      this._renderBoardLayout(inspectorVisible, selectedNode),
    );
    const headlessPanel = this.el.querySelector('.loop-headless-panel');
    if (headlessPanel) headlessPanel.scrollTop = headlessScrollTop;
    if (previousSelectedNodeId && previousSelectedNodeId === this.selectedNodeId) {
      const inspector = this.el.querySelector('.loop-inspector');
      if (inspector) inspector.scrollTop = inspectorScrollTop;
      restoreLogScrollState(this.el.querySelector('.loop-log-output'), logScrollState);
    }
  }

  _renderUnlessEditing() {
    if (this._hasFocusedEditorControl()) return;
    this._render();
  }

  _hasFocusedEditorControl() {
    const active = document.activeElement;
    return active instanceof HTMLElement
      && this.el?.contains(active)
      && Boolean(active.closest('input, textarea, select'));
  }

  _renderHeader() {
    const runningNodes = runningCount(this.snapshot);
    const headlessCount = this.headlessSnapshot?.agents?.length || 0;
    const actions = _el('div', 'loop-builder-actions',
      _el('span', { textContent: `${this.loop.nodes.length} nodes` }),
      _el('span', { textContent: `${runningNodes} running` }),
      _el('span', { textContent: `${headlessCount} headless` }),
      this._button(
        this.edgeRoutingMode === 'elbow' ? 'Liens angles' : 'Liens courbes',
        'loop-secondary-btn',
        () => this._toggleEdgeRoutingMode(),
        { title: 'Changer le rendu des liens' },
      ),
      this._button(
        this.headlessPanelCollapsed ? 'Afficher headless' : 'Masquer headless',
        'loop-secondary-btn',
        () => this._setHeadlessPanelCollapsed(!this.headlessPanelCollapsed),
      ),
      this._button('Run pipeline', 'loop-primary-btn', () => void this._runPipeline(), {
        disabled: this.saving,
      }),
      this._button('Run watchers', 'loop-secondary-btn', () => void this._runWatchers(), {
        disabled: this.saving,
        title: 'Lancer uniquement les cartes Watcher',
      }),
      this._button('Run executables', 'loop-secondary-btn', () => void this._runExecutables(), {
        disabled: this.saving,
        title: 'Lancer toutes les cartes Executable, watchers inclus',
      }),
      this._button('Stop pipeline', 'loop-danger-btn', () => void this._stopPipeline(), {
        disabled: this.saving || runningNodes === 0,
      }),
      this._button('+ Agent', 'loop-secondary-btn', () => this._addNode('agent')),
      this._button('+ Executable', 'loop-secondary-btn', () => this._addNode('executable')),
      this._button('+ Watcher', 'loop-secondary-btn', () => this._addNode('watcher')),
      this._button('+ Fichier', 'loop-secondary-btn', () => this._addNode('display')),
      this._button('+ Board', 'loop-secondary-btn', () => void this._createBoard()),
      this._button('Supprimer board', 'loop-danger-btn', () => void this._deleteBoard(), {
        disabled: this.boards.length <= 1,
      }),
      this._button(this.saving ? 'Save...' : 'Save board', 'flow-add-btn', () => void this._saveLoop(), {
        disabled: this.saving,
      }),
    );

    return _el('div', 'loop-builder-header',
      _el('div', 'loop-builder-title-block',
        _el('h2', { className: 'flow-title', textContent: 'Boucles' }),
        this._renderBoardControls(),
      ),
      actions,
    );
  }

  _renderBoardControls() {
    const boardSelect = buildSelect(
      this.boards.map((board) => ({
        value: board.id,
        label: `${board.name || 'Sans nom'} (${board.nodeCount || 0})`,
      })),
      { className: 'loop-board-select', selected: this.loop.id || this.activeBoardId || 'main' },
    );
    boardSelect.addEventListener('change', (event) => void this._switchBoard(event.target.value));

    const nameInput = _el('input', {
      className: 'loop-board-name-input',
      value: this.loop.name || '',
      placeholder: 'Nom du board',
      onInput: (event) => {
        this.loop = { ...this.loop, name: event.target.value };
        this._scheduleAutoSave();
      },
      onBlur: () => void this._saveLoop(),
    });

    return _el('div', 'loop-board-controls', boardSelect, nameInput);
  }

  _renderBoardLayout(inspectorVisible, selectedNode) {
    const hasSideRail = !this.headlessPanelCollapsed || Boolean(inspectorVisible && selectedNode);
    const children = [this._renderCanvas()];
    if (hasSideRail) children.push(this._renderSideRail(inspectorVisible, selectedNode));
    return _el('div', `loop-board-layout${hasSideRail ? '' : ' is-side-rail-hidden'}`, ...children);
  }

  _renderSideRail(inspectorVisible, selectedNode) {
    const children = [];
    if (!this.headlessPanelCollapsed) children.push(this._renderHeadlessPanel());
    if (inspectorVisible && selectedNode) children.push(this._renderInspector(selectedNode));
    return _el('div', `loop-side-rail${inspectorVisible ? ' has-inspector' : ''}`, ...children);
  }

  _renderCanvas() {
    const map = processMap(this.snapshot);
    const canvas = _el('main', {
      className: `loop-board-canvas${this.linkSourceId ? ' is-linking' : ''}${this.pan ? ' is-panning' : ''}`,
      style: this._canvasStyle(),
      onMouseDown: (event) => this._handleCanvasDown(event),
      onMouseMove: (event) => this._handleCanvasMove(event),
      onMouseUp: (event) => this._handleCanvasUp(event),
      onMouseLeave: () => this._endPointerWork(),
      onWheel: (event) => this._handleCanvasWheel(event),
    });
    this.canvasEl = canvas;

    canvas.appendChild(this._renderZoomControls());

    if (this.selectedNode && this.inspectorCollapsed) {
      canvas.appendChild(_el('button', {
        className: 'loop-inspector-reopen',
        title: 'Ouvrir le panneau',
        type: 'button',
        textContent: '<',
        onClick: (event) => {
          event.stopPropagation();
          this.inspectorCollapsed = false;
          this._render();
        },
      }));
    }

    const surface = _el('div', {
      className: 'loop-board-surface',
      style: this._surfaceStyle(),
    });
    this.surfaceEl = surface;
    surface.appendChild(this._renderLinks());
    for (const node of this.loop.nodes) {
      surface.appendChild(this._renderNodeCard(node, map.get(node.id)));
    }
    canvas.appendChild(surface);
    return canvas;
  }

  _canvasStyle() {
    return {
      backgroundPosition: `${this.panOffset.x}px ${this.panOffset.y}px`,
      backgroundSize: `${36 * this.zoom}px ${36 * this.zoom}px`,
    };
  }

  _surfaceStyle() {
    return {
      transform: `translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${this.zoom})`,
    };
  }

  _applyBoardViewport() {
    if (this.canvasEl) Object.assign(this.canvasEl.style, this._canvasStyle());
    if (this.surfaceEl) Object.assign(this.surfaceEl.style, this._surfaceStyle());
    const zoomLabel = this.canvasEl?.querySelector('.loop-zoom-controls span');
    if (zoomLabel) zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  _renderZoomControls() {
    return _el('div', 'loop-zoom-controls',
      this._button('-', '', () => this._adjustZoom(-0.1)),
      _el('span', { textContent: `${Math.round(this.zoom * 100)}%` }),
      this._button('+', '', () => this._adjustZoom(0.1)),
      this._button('Reset', '', () => {
        this.zoom = 1;
        this._persistBoardViewport();
        this._render();
      }),
    );
  }

  _renderLinks() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('loop-board-links');
    svg.appendChild(this._renderLinkDefs());
    for (const edge of this.loop.edges) {
      const from = this.loop.nodes.find((node) => node.id === edge.from);
      const to = this.loop.nodes.find((node) => node.id === edge.to);
      if (!from || !to) continue;
      svg.appendChild(this._renderEdgePath(edge, from, to));
    }
    return svg;
  }

  _renderLinkDefs() {
    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', LINK_ARROW_MARKER_ID);
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('markerUnits', 'strokeWidth');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '4');
    marker.setAttribute('viewBox', '0 0 8 8');
    const arrow = document.createElementNS(SVG_NS, 'path');
    arrow.setAttribute('class', 'loop-board-link-arrow');
    arrow.setAttribute('d', 'M 0 0 L 8 4 L 0 8 z');
    marker.appendChild(arrow);
    defs.appendChild(marker);
    return defs;
  }

  _renderEdgePath(edge, from, to) {
    const geometry = edgeGeometry({ ...edge, pathType: this.edgeRoutingMode }, from, to);
    const selected = this.selectedEdgeId === edge.id;
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', `loop-board-link-group${selected ? ' is-selected' : ''}`);
    group.dataset.edgeId = edge.id;
    group.addEventListener('click', (event) => {
      event.stopPropagation();
      this._selectEdge(edge.id);
    });
    const hitPath = document.createElementNS(SVG_NS, 'path');
    hitPath.setAttribute('class', 'loop-board-link-hit');
    hitPath.setAttribute('d', geometry.d);
    group.appendChild(hitPath);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'loop-board-link');
    path.setAttribute('d', geometry.d);
    path.setAttribute('marker-end', `url(#${LINK_ARROW_MARKER_ID})`);
    group.appendChild(path);
    if (geometry.hasHandle) {
      const handle = document.createElementNS(SVG_NS, 'circle');
      handle.setAttribute('class', 'loop-board-link-handle');
      handle.setAttribute('cx', String(geometry.handle.x));
      handle.setAttribute('cy', String(geometry.handle.y));
      handle.setAttribute('r', '7');
      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.edgeDrag = {
          id: edge.id,
          startX: event.clientX,
          startY: event.clientY,
          originBendX: Number(edge.bendX || 0),
          originBendY: Number(edge.bendY || 0),
        };
      });
      group.appendChild(handle);
    }
    if (edge.label) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'loop-board-link-label');
      text.setAttribute('x', String(geometry.handle.x));
      text.setAttribute('y', String(geometry.handle.y - 12));
      text.textContent = edge.label;
      group.appendChild(text);
    }
    return group;
  }

  _renderNodeCard(node, process) {
    const nodeRunning = node.type !== 'display' && process?.status === 'running';
    const article = _el('article', {
      className: [
        'loop-board-node',
        `loop-board-node-${node.type}`,
        node.id === this.selectedNodeId ? 'is-selected' : '',
        nodeRunning ? 'is-running' : '',
        this.linkSourceId === node.id ? 'is-link-source' : '',
        `is-color-${getNodeColor(node)}`,
      ].filter(Boolean).join(' '),
      style: {
        left: `${node.x}px`,
        top: `${node.y}px`,
        width: `${NODE_SIZE}px`,
        height: `${NODE_SIZE}px`,
      },
      onClick: () => this._selectNode(node.id),
      onMouseDown: (event) => {
        if (event.target instanceof Element && event.target.closest('button')) return;
        const rect = event.currentTarget.getBoundingClientRect();
        this.drag = {
          id: node.id,
          startX: event.clientX,
          startY: event.clientY,
          originNodeX: node.x,
          originNodeY: node.y,
          dx: (event.clientX - rect.left) / this.zoom,
          dy: (event.clientY - rect.top) / this.zoom,
        };
      },
    });
    article.dataset.nodeId = node.id;

    const controls = _el('div', 'loop-board-node-controls');
    if (node.type !== 'display') {
      controls.appendChild(_el('span', {
        className: `loop-run-dot ${process?.status === 'running' ? 'is-running' : ''}`,
      }));
    }
    controls.appendChild(_el('button', {
      className: 'loop-node-close',
      title: 'Fermer la carte',
      type: 'button',
      textContent: 'x',
      onClick: (event) => {
        event.stopPropagation();
        this._deleteNode(node.id);
      },
    }));

    const body = _el('div', 'loop-board-node-body',
      node.type === 'display'
        ? _el('code', { textContent: node.filePath || 'path du fichier' })
        : node.cwd
          ? _el('code', { textContent: node.cwd })
          : _el('span', { textContent: 'path non defini' }),
    );
    if (node.type === 'agent') {
      body.appendChild(_el('span', {
        className: 'loop-node-trigger',
        textContent: formatAgentTrigger(node),
      }));
    }
    body.appendChild(_el('p', { textContent: getNodePreview(node) }));
    if (node.type === 'agent' || node.type === 'executable') {
      body.appendChild(_el('button', {
        className: `loop-node-run-btn${nodeRunning ? ' is-stop' : ''}`,
        disabled: this.saving && !nodeRunning,
        type: 'button',
        textContent: nodeRunning ? 'Stop' : isWatcherNode(node) ? 'Run watcher' : 'Run',
        onClick: (event) => {
          event.stopPropagation();
          if (nodeRunning) void this._stopNodeCard(node.id);
          else void this._runNodeCard(node.id);
        },
      }));
    } else if (node.type === 'display') {
      body.appendChild(_el('button', {
        className: 'loop-node-open-btn',
        disabled: !String(node.filePath || '').trim(),
        type: 'button',
        textContent: 'Ouvrir',
        onClick: (event) => {
          event.stopPropagation();
          void this._openDisplayFile(node);
        },
      }));
    }

    article.append(
      _el('div', 'loop-board-node-header',
        _el('div', null,
          _el('strong', { textContent: getNodeTitle(node) }),
          _el('span', { textContent: this._nodeKindLabel(node) }),
        ),
        controls,
      ),
      body,
      ...Object.keys(EDGE_PORTS).map((port) => this._renderNodePort(node, port)),
    );
    return article;
  }

  _renderNodePort(node, port) {
    const isSource = this.linkSourceId === node.id && this.linkSourcePort === port;
    return _el('button', {
      className: `loop-node-port loop-node-port-${port}${isSource ? ' is-link-source' : ''}`,
      title: `Lien ${EDGE_PORTS[port].toLowerCase()}`,
      type: 'button',
      onClick: (event) => {
        event.stopPropagation();
        this._handleNodePortClick(node.id, port);
      },
    });
  }

  _renderInspector(node) {
    const process = processMap(this.snapshot).get(node.id);
    const header = _el('div', 'loop-inspector-header',
      _el('h3', { textContent: getNodeTitle(node) }),
      _el('div', 'loop-inspector-header-actions',
        _el('span', { textContent: node.type }),
        _el('button', {
          className: 'loop-inspector-toggle',
          title: 'Replier le panneau',
          type: 'button',
          textContent: '>',
          onClick: () => {
            this.inspectorCollapsed = true;
            this._render();
          },
        }),
      ),
    );

    const children = [
      header,
      this._renderInspectorForm(node),
      this._renderInspectorActions(node, process),
      this._renderEdgesPanel(node.id),
    ];
    if (node.type !== 'display') children.push(this._renderLogBlock(process));
    return _el('aside', 'loop-inspector', ...children);
  }

  _renderInspectorForm(node) {
    const form = _el('div', 'loop-inspector-form');
    if (node.type === 'display') {
      form.append(this._renderColorField(node), ...this._renderDisplayFields(node));
      return form;
    }

    form.append(
      this._label('Nom', _el('input', {
        value: node.title,
        onInput: (event) => this._updateNode(node.id, { title: event.target.value }, false),
      })),
      this._renderColorField(node),
      this._renderFolderField(node),
    );

    if (node.type === 'agent') form.append(...this._renderAgentFields(node));
    else form.append(...this._renderExecutableFields(node));
    return form;
  }

  _renderColorField(node) {
    return _el('div', 'loop-color-field',
      _el('span', { textContent: 'Couleur' }),
      _el('div', 'loop-color-swatches',
        ...NODE_COLOR_OPTIONS.map((option) => _el('button', {
          className: `loop-color-swatch is-color-${option.value}${getNodeColor(node) === option.value ? ' is-selected' : ''}`,
          title: option.label,
          type: 'button',
          onClick: () => this._updateNode(node.id, { color: option.value }),
        }, _el('span', { textContent: option.label }))),
      ),
    );
  }

  _renderFolderField(node) {
    const input = _el('input', {
      value: node.cwd || '',
      placeholder: '/Users/jeremy/projet/...',
      onInput: (event) => this._updateNode(node.id, { cwd: event.target.value }, false),
    });
    const choose = this._button('Choisir', 'loop-secondary-btn', async () => {
      await this._saveLoop(this.loop, { render: false, reloadBoards: false });
      const folder = await dialogApi.openFolder();
      if (folder) {
        this._updateNode(node.id, { cwd: folder });
        await this._saveLoop(this.loop, { render: false });
      }
    });
    return this._label('Path', _el('div', 'loop-folder-row', input, choose));
  }

  _renderAgentFields(node) {
    const triggerType = node.triggerType || (node.hookTrigger ? 'hook' : 'schedule');
    return [
      this._label('Agent', this._select(AGENT_OPTIONS, node.agent, (value) =>
        this._updateNode(node.id, { agent: value })
      )),
      ...this._renderAgentRuntimeFields(node),
      this._label('Prompt', _el('textarea', {
        className: 'loop-inspector-textarea',
        value: node.prompt || '',
        onInput: (event) => this._updateNode(node.id, { prompt: event.target.value }, false),
      })),
      _el('label', 'loop-toggle-row',
        _el('input', {
          type: 'checkbox',
          checked: Boolean(node.dangerouslySkipPermissions),
          onChange: (event) => this._updateNode(node.id, {
            dangerouslySkipPermissions: event.target.checked,
          }, false),
        }),
        _el('span', { textContent: 'Full auto / skip permissions' }),
      ),
      this._label('Trigger', this._select(LOOP_TRIGGER_TYPE_LABELS, triggerType, (value) =>
        this._updateNode(node.id, {
          triggerType: value,
          hookTrigger: value === 'hook' ? node.hookTrigger || defaultAgentHookTrigger() : undefined,
        })
      )),
      triggerType === 'schedule'
        ? this._renderScheduleFields(node)
        : triggerType === 'hook'
          ? this._renderHookFields(node)
          : null,
    ];
  }

  _renderAgentRuntimeFields(node) {
    if ((node.agent || 'codex') !== 'codex') return [];
    const modelListId = `loop-codex-models-${node.id}`;
    return [
      this._label('Modele Codex', _el('div', 'loop-model-input-row',
        _el('input', {
          list: modelListId,
          value: node.model || '',
          placeholder: 'Config par defaut',
          onInput: (event) => this._updateNode(node.id, { model: event.target.value }, false),
        }),
        _el('datalist', { id: modelListId },
          ...CODEX_MODEL_SUGGESTIONS.map((model) => _el('option', { value: model })),
        ),
      )),
      this._label('Effort Codex', this._select(
        CODEX_REASONING_EFFORT_OPTIONS,
        node.reasoningEffort || '',
        (value) => this._updateNode(node.id, { reasoningEffort: value }, false),
      )),
      this._label('Mode fast Codex', this._select(
        CODEX_SERVICE_TIER_OPTIONS,
        node.serviceTier || '',
        (value) => this._updateNode(node.id, { serviceTier: value }, false),
      )),
    ];
  }

  _renderScheduleFields(node) {
    const schedule = node.schedule || defaultAgentSchedule();
    const scheduleType = schedule.type || 'weekdays';
    const chips = SCHEDULE_TYPE_CONFIG[scheduleType]?.chips || SCHEDULE_TYPE_CONFIG.weekdays.chips;
    const selectedDaysSet = new Set(schedule.days || WEEKDAY_INDICES);
    const currentSchedule = () => {
      const currentNode = this.loop.nodes.find((item) => item.id === node.id);
      return currentNode?.schedule || schedule;
    };
    const updateSchedule = (patch = {}, rerender = true) => {
      const current = currentSchedule();
      const nextType = patch.type || current.type || scheduleType;
      const nextDays = patch.days || new Set(current.days || WEEKDAY_INDICES);
      this._updateNode(node.id, {
        schedule: buildScheduleData(
          nextType,
          patch.time ?? current.time ?? DEFAULT_TIME,
          patch.intervalHours ?? current.intervalHours ?? 1,
          nextDays,
        ),
      }, rerender);
    };

    const fields = [
      this._label('Schedule', this._select(SCHEDULE_LABELS, scheduleType, (value) =>
        updateSchedule({ type: value })
      )),
    ];
    if (chips.time) {
      fields.push(this._label('Heure', _el('input', {
        type: 'time',
        value: schedule.time || DEFAULT_TIME,
        onInput: (event) => updateSchedule({ time: event.target.value }, false),
      })));
    }
    if (chips.interval) {
      fields.push(this._label('Intervalle', buildSelect(
        INTERVAL_HOURS.map((hours) => ({ value: String(hours), label: `${hours}h` })),
        { selected: String(schedule.intervalHours || 1) },
      )));
      fields.at(-1).querySelector('select').addEventListener('change', (event) =>
        updateSchedule({ intervalHours: event.target.value }, false)
      );
    }
    if (chips.days) {
      fields.push(_el('div', 'loop-days-field',
        _el('span', { textContent: 'Jours' }),
        _el('div', 'loop-day-buttons',
          ...DAY_NAMES.map((day, index) => _el('button', {
            className: selectedDaysSet.has(index) ? 'is-active' : '',
            type: 'button',
            textContent: day,
            onClick: (event) => {
              if (selectedDaysSet.has(index)) selectedDaysSet.delete(index);
              else selectedDaysSet.add(index);
              event.currentTarget.classList.toggle('is-active');
              updateSchedule({ days: selectedDaysSet }, false);
            },
          })),
        ),
      ));
    }
    return _el('div', 'loop-agent-trigger-fields', ...fields);
  }

  _renderHookFields(node) {
    const hook = node.hookTrigger || defaultAgentHookTrigger();
    const hookPaths = joinPathPatterns(hook.paths);
    const currentHook = () => {
      const currentNode = this.loop.nodes.find((item) => item.id === node.id);
      return currentNode?.hookTrigger || hook;
    };
    const updateHook = (patch = {}) => {
      const current = currentHook();
      const paths = patch.paths ?? joinPathPatterns(current.paths);
      this._updateNode(node.id, {
        triggerType: 'hook',
        hookTrigger: buildHookTrigger(
          patch.event ?? current.event ?? DEFAULT_HOOK_EVENT,
          patch.provider ?? current.provider ?? 'any',
          paths,
          patch.debounceSeconds ?? current.debounceSeconds ?? DEFAULT_HOOK_DEBOUNCE_SECONDS,
        ),
      }, false);
    };

    return _el('div', 'loop-agent-trigger-fields',
      this._label('Event', _el('input', {
        value: hook.event,
        placeholder: DEFAULT_HOOK_EVENT,
        onInput: (event) => updateHook({ event: event.target.value }),
      })),
      this._label('Source', this._select(
        Object.fromEntries(HOOK_PROVIDER_OPTIONS.map((provider) => [provider, provider])),
        hook.provider || 'any',
        (value) => updateHook({ provider: value }),
      )),
      this._label('Paths', _el('input', {
        value: hookPaths,
        placeholder: 'src/**/*.js, src/**/*.css',
        onInput: (event) => updateHook({ paths: event.target.value }),
      })),
      this._label('Debounce', _el('div', 'loop-number-row',
        _el('input', {
          min: 0,
          type: 'number',
          value: hook.debounceSeconds ?? DEFAULT_HOOK_DEBOUNCE_SECONDS,
          onInput: (event) => updateHook({ debounceSeconds: event.target.value }),
        }),
        _el('span', { textContent: 's' }),
      )),
    );
  }

  _renderExecutableFields(node) {
    const watcher = isWatcherNode(node);
    return [
      this._label(watcher ? 'Commande watcher' : 'Commande executable', _el('textarea', {
        className: 'loop-inspector-textarea',
        value: node.command || '',
        onInput: (event) => this._updateNode(node.id, { command: event.target.value }, false),
      })),
      _el('label', 'loop-toggle-row',
        _el('input', {
          type: 'checkbox',
          checked: Boolean(node.persistent),
          onChange: (event) => this._updateNode(node.id, { persistent: event.target.checked }),
        }),
        _el('span', { textContent: 'Watcher / process persistant' }),
      ),
    ];
  }

  _renderDisplayFields(node) {
    return [
      this._label('Path du fichier', _el('input', {
        value: node.filePath || '',
        placeholder: 'dist/output.json',
        onInput: (event) => this._updateNode(node.id, { filePath: event.target.value }, false),
      })),
      this._label('Description', _el('textarea', {
        className: 'loop-inspector-textarea',
        value: node.description || '',
        onInput: (event) => this._updateNode(node.id, { description: event.target.value }, false),
      })),
    ];
  }

  _renderInspectorActions(node, process) {
    const actions = [
      this._button('Supprimer', 'loop-secondary-btn', () => this._deleteSelected()),
      this._button('Lier', 'loop-secondary-btn', () => {
        this.linkSourceId = node.id;
        this.linkSourcePort = 'right';
        this._render();
      }),
    ];
    if (node.type !== 'display') {
      if (process?.status === 'running') {
        actions.push(this._button('Stop', 'loop-danger-btn', () => void this._stopSelected()));
      } else {
        actions.push(this._button(
          isWatcherNode(node) ? 'Run watcher' : 'Run',
          'loop-primary-btn',
          () => void this._runSelected(),
        ));
      }
    } else {
      actions.push(this._button('Ouvrir', 'loop-primary-btn', () => void this._openDisplayFile(node), {
        disabled: !String(node.filePath || '').trim(),
      }));
    }
    return _el('div', 'loop-inspector-actions', ...actions);
  }

  _renderEdgesPanel(selectedNodeId) {
    const edges = selectedEdges(this.loop, selectedNodeId);
    return _el('div', 'loop-edge-panel',
      _el('h3', { textContent: 'Liens orientes' }),
      edges.length === 0
        ? _el('div', { textContent: 'Aucun lien pour ce node.' })
        : _el('div', null, ...edges.map((edge) => {
          const from = this.loop.nodes.find((node) => node.id === edge.from);
          const to = this.loop.nodes.find((node) => node.id === edge.to);
          return _el('div', 'loop-edge-row',
            _el('div', 'loop-edge-row-main',
              _el('span', {
                className: `loop-edge-direction${this.selectedEdgeId === edge.id ? ' is-selected' : ''}`,
                textContent: `${from ? getNodeTitle(from) : edge.from} -> ${to ? getNodeTitle(to) : edge.to}`,
                onClick: () => this._selectEdge(edge.id),
              }),
              _el('div', 'loop-edge-row-actions',
                _el('button', {
                  type: 'button',
                  textContent: 'Inverser',
                  onClick: () => this._reverseEdge(edge.id),
                }),
                _el('button', {
                  type: 'button',
                  textContent: 'Supprimer',
                  onClick: () => this._deleteEdge(edge.id),
                }),
              ),
            ),
          );
        })),
    );
  }

  _renderLogBlock(process) {
    return _el('div', 'loop-log-block',
      _el('div', 'loop-log-header',
        _el('h3', { textContent: 'Logs' }),
        process?.pid ? _el('span', { textContent: `PID ${process.pid}` }) : null,
      ),
      this.nodeLog
        ? _el('pre', { className: 'loop-log-output', textContent: this.nodeLog })
        : _el('div', { className: 'loop-log-output', textContent: 'Aucun log pour ce node.' }),
    );
  }

  _renderHeadlessPanel() {
    const boardId = this.loop.id || this.activeBoardId || 'main';
    const agents = this.headlessSnapshot?.agents || [];
    const { current, other } = splitHeadlessAgentsForBoard(agents, boardId);
    const errors = this.headlessSnapshot?.errors || [];

    return _el('section', 'loop-headless-panel',
      _el('div', 'loop-headless-header',
        _el('div', null,
          _el('h3', { textContent: 'Agents headless' }),
          _el('span', { textContent: `${agents.length} running` }),
        ),
        _el('div', 'loop-headless-header-actions',
          this._button('Refresh', 'loop-secondary-btn loop-headless-refresh', () =>
            void this._refreshHeadlessAgents()
          ),
          this._button('Masquer', 'loop-secondary-btn loop-headless-refresh', () =>
            this._setHeadlessPanelCollapsed(true)
          ),
        ),
      ),
      errors.length
        ? _el('div', 'loop-headless-errors', ...errors.map((error) =>
          _el('div', { textContent: error }),
        ))
        : null,
      current.length || other.length
        ? _el('div', 'loop-headless-groups',
          current.length ? this._renderHeadlessGroup('Board actif', current) : null,
          other.length ? this._renderHeadlessGroup('Autres headless', other) : null,
        )
        : _el('div', { className: 'loop-headless-empty', textContent: 'Aucun agent headless actif.' }),
    );
  }

  _renderHeadlessGroup(title, agents) {
    return _el('div', 'loop-headless-group',
      _el('h4', { textContent: title }),
      ...agents.map((agent) => this._renderHeadlessAgent(agent)),
    );
  }

  _renderHeadlessAgent(agent) {
    const linkedNode = agent.loopBoardId === (this.loop.id || this.activeBoardId || 'main')
      ? this.loop.nodes.find((node) => node.id === agent.loopNodeId)
      : null;
    const killing = this.killingHeadlessAgentIds.has(agent.id);
    const pids = (agent.pids || []).join(', ');
    return _el('article', {
      className: `loop-headless-agent${linkedNode ? ' is-linked' : ''}`,
      tabIndex: linkedNode ? 0 : -1,
      title: linkedNode ? 'Selectionner le node lie' : 'Agent headless',
      onClick: () => {
        if (linkedNode) this._selectNode(agent.loopNodeId);
      },
      onKeyDown: (event) => {
        if (!linkedNode || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        this._selectNode(agent.loopNodeId);
      },
    },
      _el('div', 'loop-headless-agent-header',
        _el('div', null,
          _el('strong', { textContent: linkedNode ? getNodeTitle(linkedNode) : formatHeadlessAgentLabel(agent) }),
          _el('span', { textContent: agent.agent || 'agent' }),
        ),
        _el('button', {
          className: 'loop-headless-stop',
          disabled: killing,
          title: 'Stopper cet agent headless',
          type: 'button',
          textContent: killing ? '...' : 'Stop',
          onClick: (event) => {
            event.stopPropagation();
            void this._killHeadlessAgent(agent.id);
          },
        }),
      ),
      _el('div', 'loop-headless-agent-meta',
        pids ? _el('span', { textContent: `PID ${pids}` }) : null,
        agent.cwd ? _el('code', { textContent: agent.cwd }) : null,
      ),
      _el('pre', { className: 'loop-headless-agent-preview', textContent: formatHeadlessAgentPreview(agent) }),
    );
  }

  _button(text, cls, onClick, extra = {}) {
    return _el('button', {
      className: cls,
      type: 'button',
      textContent: text,
      onClick,
      ...extra,
    });
  }

  _setHeadlessPanelCollapsed(collapsed) {
    this.headlessPanelCollapsed = Boolean(collapsed);
    writeStoredBoolean(HEADLESS_PANEL_STORAGE_KEY, this.headlessPanelCollapsed);
    if (!this.headlessPanelCollapsed) void this._refreshHeadlessAgents(false);
    this._render();
  }

  _label(text, control) {
    return _el('label', null, _el('span', { textContent: text }), control);
  }

  _select(options, value, onChange) {
    const select = buildSelect(
      Object.entries(options).map(([optionValue, label]) => ({ value: optionValue, label })),
      { selected: String(value || '') },
    );
    select.addEventListener('change', (event) => onChange(event.target.value));
    return select;
  }

  _nodeKindLabel(node) {
    if (node.type === 'agent') {
      if (node.agent !== 'codex') return node.agent;
      return [
        node.agent,
        String(node.model || '').trim(),
        String(node.reasoningEffort || '').trim(),
        String(node.serviceTier || '').trim(),
      ].filter(Boolean).join(' / ');
    }
    if (node.type === 'executable') return isWatcherNode(node) ? 'watcher' : 'exec';
    return 'fichier';
  }

  _updateLoop(updater, shouldRender = true) {
    this.loop = typeof updater === 'function' ? updater(this.loop) : updater;
    this._scheduleAutoSave();
    if (shouldRender) this._render();
  }

  _updateNode(nodeId, patch, shouldRender = true) {
    const now = new Date().toISOString();
    this._updateLoop((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId ? { ...node, ...patch, updatedAt: now } : node
      ),
    }), shouldRender);
  }

  _addNode(type) {
    const nextNode = createNode(type, this.loop.nodes.length);
    this._updateLoop((current) => ({
      ...current,
      nodes: [...current.nodes, nextNode],
    }), false);
    this.selectedNodeId = nextNode.id;
    this.inspectorCollapsed = false;
    this.linkSourceId = null;
    this.linkSourcePort = 'right';
    this._render();
    this._scheduleAutoSave(0);
  }

  _deleteNode(nodeId) {
    this._updateLoop((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== nodeId),
      edges: current.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    }), false);
    if (this.selectedNodeId === nodeId) this.selectedNodeId = null;
    if (this.selectedEdgeId && !this.loop.edges.some((edge) => edge.id === this.selectedEdgeId)) {
      this.selectedEdgeId = null;
    }
    if (this.linkSourceId === nodeId) {
      this.linkSourceId = null;
      this.linkSourcePort = 'right';
    }
    this._render();
  }

  _deleteSelected() {
    if (this.selectedNode) this._deleteNode(this.selectedNode.id);
  }

  _deleteEdge(edgeId) {
    this._updateLoop((current) => ({
      ...current,
      edges: current.edges.filter((edge) => edge.id !== edgeId),
    }));
    if (this.selectedEdgeId === edgeId) this.selectedEdgeId = null;
  }

  _reverseEdge(edgeId) {
    this._updateLoop((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === edgeId
          ? {
            ...edge,
            from: edge.to,
            to: edge.from,
            fromPort: edge.toPort,
            toPort: edge.fromPort,
            bendX: -Number(edge.bendX || 0),
            bendY: -Number(edge.bendY || 0),
          }
          : edge
      ),
    }));
  }

  _updateEdge(edgeId, patch, shouldRender = true) {
    this._updateLoop((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === edgeId ? { ...edge, ...patch } : edge
      ),
    }), shouldRender);
  }

  _selectEdge(edgeId) {
    const edge = this.loop.edges.find((item) => item.id === edgeId);
    if (!edge) return;
    this.selectedEdgeId = edge.id;
    this.selectedNodeId = edge.from;
    this.inspectorCollapsed = false;
    this.linkSourceId = null;
    this.linkSourcePort = 'right';
    this._render();
  }

  _toggleEdgeRoutingMode() {
    this.edgeRoutingMode = this.edgeRoutingMode === 'elbow' ? 'curve' : 'elbow';
    writeStoredString(EDGE_ROUTING_STORAGE_KEY, this.edgeRoutingMode);
    this._render();
  }

  _handleNodePortClick(nodeId, port) {
    if (!this.linkSourceId || this.linkSourceId === nodeId) {
      this.linkSourceId = nodeId;
      this.linkSourcePort = port;
      this._render();
      return;
    }

    const created = this._createEdge({
      from: this.linkSourceId,
      to: nodeId,
      fromPort: this.linkSourcePort,
      toPort: port,
    });
    this.linkSourceId = null;
    this.linkSourcePort = 'right';
    this.selectedEdgeId = created?.id || null;
    this.selectedNodeId = nodeId;
    this.inspectorCollapsed = false;
    this._render();
  }

  _createEdge(edgeInput) {
    const from = this.loop.nodes.find((node) => node.id === edgeInput.from);
    const to = this.loop.nodes.find((node) => node.id === edgeInput.to);
    if (!from || !to || from.id === to.id) return;
    const defaults = defaultEdgePorts(from, to);
    const edge = {
      id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: from.id,
      to: to.id,
      fromPort: edgeInput.fromPort || defaults.fromPort,
      toPort: edgeInput.toPort || defaults.toPort,
      bendX: 0,
      bendY: 0,
    };
    let selectedEdge = edge;
    this._updateLoop((current) => {
      const exists = current.edges.find((item) =>
        item.from === edge.from
        && item.to === edge.to
        && item.fromPort === edge.fromPort
        && item.toPort === edge.toPort
      );
      if (exists) selectedEdge = exists;
      return exists ? current : { ...current, edges: [...current.edges, edge] };
    }, false);
    return selectedEdge;
  }

  _selectNode(nodeId) {
    if (this.linkSourceId && this.linkSourceId !== nodeId) {
      const from = this.loop.nodes.find((node) => node.id === this.linkSourceId);
      const to = this.loop.nodes.find((node) => node.id === nodeId);
      const defaults = from && to ? defaultEdgePorts(from, to) : {};
      const created = this._createEdge({
        from: this.linkSourceId,
        to: nodeId,
        fromPort: this.linkSourcePort || defaults.fromPort,
        toPort: defaults.toPort,
      });
      this.linkSourceId = null;
      this.linkSourcePort = 'right';
      this.selectedEdgeId = created?.id || null;
    } else {
      this.selectedEdgeId = null;
    }
    this.selectedNodeId = nodeId;
    this.inspectorCollapsed = false;
    void this._refreshNodeLog(false);
    this._render();
  }

  _resetBoardInteraction() {
    this.selectedNodeId = null;
    this.selectedEdgeId = null;
    this.linkSourceId = null;
    this.linkSourcePort = 'right';
    this.inspectorCollapsed = true;
    this.drag = null;
    this.edgeDrag = null;
    this.pan = null;
    this.nodeLog = '';
    this.snapshot = null;
    this._restoreBoardViewport();
  }

  async _switchBoard(boardId) {
    if (!boardId || boardId === this.activeBoardId) return;
    this._clearAutoSave();
    this._persistBoardViewport();
    const saved = await this._saveLoop(this.loop, { render: false, reloadBoards: false });
    if (!saved) return;
    this.activeBoardId = boardId;
    writeStoredActiveBoardId(boardId);
    this._resetBoardInteraction();
    await this.refresh();
  }

  async _createBoard() {
    const defaultName = `Board ${this.boards.length + 1}`;
    const name = window.prompt('Nom du board', defaultName);
    if (name === null) return;
    this._clearAutoSave();
    const saved = await this._saveLoop(this.loop, { render: false, reloadBoards: false });
    if (!saved) return;
    try {
      const board = await loopApi.create(name);
      this.activeBoardId = board.id;
      writeStoredActiveBoardId(board.id);
      this._resetBoardInteraction();
      await this.refresh();
    } catch (err) {
      this._setError(err);
    }
  }

  async _deleteBoard() {
    if (this.boards.length <= 1) return;
    const boardName = this.loop.name || 'ce board';
    if (!window.confirm(`Supprimer "${boardName}" ?`)) return;
    this._clearAutoSave();
    try {
      const nextBoard = await loopApi.delete(this.loop.id || this.activeBoardId || 'main');
      this.activeBoardId = nextBoard.id || 'main';
      writeStoredActiveBoardId(this.activeBoardId);
      this._resetBoardInteraction();
      await this.refresh();
    } catch (err) {
      this._setError(err);
    }
  }

  async _saveLoop(nextLoop = this.loop, options = {}) {
    const { render = true, reloadBoards = true } = options;
    this._clearAutoSave();
    this.saving = true;
    this.error = '';
    if (render) this._render();
    try {
      this.loop = await loopApi.save(nextLoop);
      this.activeBoardId = this.loop.id || 'main';
      writeStoredActiveBoardId(this.activeBoardId);
      if (reloadBoards) await this._loadBoards();
      if (this.selectedNodeId && !this.loop.nodes.some((node) => node.id === this.selectedNodeId)) {
        this.selectedNodeId = null;
      }
      return this.loop;
    } catch (err) {
      this.error = err?.message || String(err);
      return null;
    } finally {
      this.saving = false;
      if (render) this._render();
    }
  }

  _scheduleAutoSave(delay = 600) {
    if (this.disposed) return;
    this._clearAutoSave();
    this._autoSaveTimer = window.setTimeout(() => {
      this._autoSaveTimer = null;
      void this._saveLoop(this.loop, { render: false });
    }, delay);
  }

  _clearAutoSave() {
    if (!this._autoSaveTimer) return;
    window.clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = null;
  }

  async _runSelected() {
    const node = this.selectedNode;
    if (!node) return;
    if (node.type === 'display') {
      this.error = 'Cette carte est visuelle uniquement.';
      this._render();
      return;
    }
    const saved = await this._saveLoop();
    if (!saved) return;
    try {
      await loopApi.runNode({ boardId: this.loop.id, nodeId: node.id });
      await this._refreshSnapshot(false);
      await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    }
  }

  async _runNodeCard(nodeId) {
    const node = this.loop.nodes.find((item) => item.id === nodeId);
    if (!node || node.type === 'display') return;
    const saved = await this._saveLoop();
    if (!saved) return;
    try {
      await loopApi.runNode({ boardId: this.loop.id, nodeId });
      await this._refreshSnapshot(false);
      if (this.selectedNodeId === nodeId) await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    }
  }

  async _runPipeline() {
    const saved = await this._saveLoop();
    if (!saved) return;
    try {
      await loopApi.runPipeline({ boardId: this.loop.id || this.activeBoardId || 'main' });
      await this._refreshSnapshot(false);
      await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    }
  }

  async _runExecutables() {
    const saved = await this._saveLoop();
    if (!saved) return;
    try {
      await loopApi.runExecutables({ boardId: this.loop.id || this.activeBoardId || 'main' });
      await this._refreshSnapshot(false);
      await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    }
  }

  async _runWatchers() {
    const saved = await this._saveLoop();
    if (!saved) return;
    try {
      await loopApi.runWatchers({ boardId: this.loop.id || this.activeBoardId || 'main' });
      await this._refreshSnapshot(false);
      await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    }
  }

  async _stopPipeline() {
    try {
      await loopApi.stopPipeline({ boardId: this.loop.id || this.activeBoardId || 'main' });
      await this._refreshSnapshot(false);
      await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    }
  }

  async _stopSelected() {
    const node = this.selectedNode;
    if (!node) return;
    await this._stopNode(node.id);
  }

  async _stopNodeCard(nodeId) {
    const node = this.loop.nodes.find((item) => item.id === nodeId);
    if (!node || node.type === 'display') return;
    await this._stopNode(nodeId);
  }

  async _stopNode(nodeId) {
    try {
      await loopApi.stopNode({ boardId: this.loop.id, nodeId });
      await this._refreshSnapshot(false);
      if (this.selectedNodeId === nodeId) await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    }
  }

  async _killHeadlessAgent(agentId) {
    if (!agentId || this.killingHeadlessAgentIds.has(agentId)) return;
    this.killingHeadlessAgentIds.add(agentId);
    this._render();
    try {
      await loopApi.headlessKill(agentId);
      await this._refreshSnapshot(false);
      await this._refreshHeadlessAgents(false);
      if (this.selectedNodeId) await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    } finally {
      this.killingHeadlessAgentIds.delete(agentId);
      this._renderUnlessEditing();
    }
  }

  async _openDisplayFile(node) {
    if (!node || node.type !== 'display') return;
    const filePath = String(node.filePath || '').trim();
    if (!filePath) {
      this._setError('Path du fichier manquant.');
      return;
    }
    try {
      const result = await loopApi.openPath(filePath);
      if (typeof result === 'string' && result.trim()) {
        this._setError(result);
      }
    } catch (err) {
      this._setError(err);
    }
  }

  _handleCanvasDown(event) {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    if (
      target.closest('.loop-board-node') ||
      target.closest('.loop-board-link-group') ||
      target.closest('.loop-zoom-controls') ||
      target.closest('.loop-inspector-reopen') ||
      target.closest('.loop-board-link-handle')
    ) {
      return;
    }
    this.pan = {
      x: event.clientX,
      y: event.clientY,
      originX: this.panOffset.x,
      originY: this.panOffset.y,
    };
    this.canvasEl?.classList.add('is-panning');
  }

  _handleCanvasMove(event) {
    if (this.edgeDrag) {
      this._updateEdge(this.edgeDrag.id, {
        bendX: this.edgeDrag.originBendX + (event.clientX - this.edgeDrag.startX) / this.zoom,
        bendY: this.edgeDrag.originBendY + (event.clientY - this.edgeDrag.startY) / this.zoom,
      }, false);
      this._render();
      return;
    }
    if (this.drag) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left - this.panOffset.x) / this.zoom - this.drag.dx;
      const y = (event.clientY - rect.top - this.panOffset.y) / this.zoom - this.drag.dy;
      this._updateNode(this.drag.id, { x, y }, false);
      const nodeEl = this.surfaceEl?.querySelector(`[data-node-id="${this.drag.id}"]`);
      if (nodeEl) {
        nodeEl.style.left = `${x}px`;
        nodeEl.style.top = `${y}px`;
      }
      return;
    }
    if (!this.pan) return;
    this.panOffset = {
      x: this.pan.originX + event.clientX - this.pan.x,
      y: this.pan.originY + event.clientY - this.pan.y,
    };
    this._applyBoardViewport();
  }

  _handleCanvasWheel(event) {
    if (!(event.currentTarget instanceof Element)) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const factor = Math.min(1.22, Math.max(0.82, Math.exp(-event.deltaY * 0.001)));
    const nextZoom = clampZoom(Number((this.zoom * factor).toFixed(3)));
    if (nextZoom === this.zoom) return;
    const next = zoomAtPoint({
      zoom: this.zoom,
      panOffset: this.panOffset,
      point,
      nextZoom,
    });
    this.zoom = next.zoom;
    this.panOffset = next.panOffset;
    this._applyBoardViewport();
    this._persistBoardViewport();
  }

  _handleCanvasUp(event) {
    if (this.edgeDrag) {
      this.edgeDrag = null;
      this._scheduleAutoSave();
      this._render();
      return;
    }

    if (this.drag) {
      const drag = this.drag;
      const movement = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      this.drag = null;
      this.pan = null;
      if (movement < POINTER_CLICK_THRESHOLD) {
        this._updateNode(drag.id, { x: drag.originNodeX, y: drag.originNodeY }, false);
        this._selectNode(drag.id);
        return;
      }
      this._render();
      return;
    }

    if (this.pan) {
      const movement = Math.hypot(event.clientX - this.pan.x, event.clientY - this.pan.y);
      if (movement < POINTER_CLICK_THRESHOLD) {
        this.selectedNodeId = null;
        this.selectedEdgeId = null;
        this.linkSourceId = null;
      }
    }
    this._endPointerWork();
  }

  _endPointerWork() {
    const hadWork = this.drag || this.edgeDrag || this.pan;
    const hadPan = Boolean(this.pan);
    this.drag = null;
    this.edgeDrag = null;
    this.pan = null;
    if (hadPan) this._persistBoardViewport();
    if (hadWork) this._render();
  }

  _adjustZoom(delta) {
    this.zoom = clampZoom(Number((this.zoom + delta).toFixed(2)));
    this._persistBoardViewport();
    this._render();
  }

  _restoreBoardViewport() {
    const viewport = readStoredBoardViewport(this.activeBoardId);
    this.zoom = viewport.zoom;
    this.panOffset = viewport.panOffset;
  }

  _persistBoardViewport() {
    writeStoredBoardViewport(this.activeBoardId, {
      zoom: this.zoom,
      panOffset: this.panOffset,
    });
  }
}

function readStoredActiveBoardId() {
  try {
    return window.localStorage.getItem(ACTIVE_BOARD_STORAGE_KEY) || 'main';
  } catch {
    return 'main';
  }
}

function writeStoredActiveBoardId(boardId) {
  try {
    window.localStorage.setItem(ACTIVE_BOARD_STORAGE_KEY, boardId || 'main');
  } catch {}
}

function boardViewportStorageKey(boardId) {
  return `${BOARD_VIEWPORT_STORAGE_PREFIX}${boardId || 'main'}`;
}

function readStoredBoardViewport(boardId) {
  try {
    const raw = window.localStorage.getItem(boardViewportStorageKey(boardId));
    if (!raw) return normalizeLoopViewport(DEFAULT_LOOP_VIEWPORT);
    return normalizeLoopViewport(JSON.parse(raw));
  } catch {
    return normalizeLoopViewport(DEFAULT_LOOP_VIEWPORT);
  }
}

function writeStoredBoardViewport(boardId, viewport) {
  try {
    window.localStorage.setItem(
      boardViewportStorageKey(boardId),
      JSON.stringify(normalizeLoopViewport(viewport)),
    );
  } catch {}
}

function readStoredBoolean(key, fallback = false) {
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) return fallback;
    return value === '1';
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key, value) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {}
}

function readStoredEdgeRoutingMode() {
  try {
    const value = window.localStorage.getItem(EDGE_ROUTING_STORAGE_KEY);
    return value === 'elbow' ? 'elbow' : 'curve';
  } catch {
    return 'curve';
  }
}

function writeStoredString(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

registerComponent('LoopView', LoopView);
