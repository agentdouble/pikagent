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
  NODE_COLOR_OPTIONS,
  NODE_SIZE,
  REFRESH_MS,
  createDefaultLoop,
  createNode,
  defaultAgentHookTrigger,
  defaultAgentSchedule,
  formatAgentTrigger,
  getNodeColor,
  getNodePreview,
  getNodeTitle,
  processMap,
  runningCount,
  selectedEdges,
} from '../utils/loop-view-helpers.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const POINTER_CLICK_THRESHOLD = 4;

class LoopView extends ComponentBase {
  constructor(container) {
    super(container);
  }

  _initState() {
    this.loop = createDefaultLoop();
    this.snapshot = null;
    this.selectedNodeId = null;
    this.linkSourceId = null;
    this.inspectorCollapsed = true;
    this.drag = null;
    this.pan = null;
    this.panOffset = { x: 0, y: 0 };
    this.zoom = 0.85;
    this.nodeLog = '';
    this.error = '';
    this.saving = false;
    this.el = _el('div', 'loop-builder');
    this.container.appendChild(this.el);
  }

  _afterInit() {
    void this.refresh();
    const snapshotTimer = window.setInterval(() => void this._refreshSnapshot(), REFRESH_MS);
    const logTimer = window.setInterval(() => void this._refreshNodeLog(), REFRESH_MS);
    const onFocus = () => void this.refresh();
    window.addEventListener('focus', onFocus);
    this._track(() => window.clearInterval(snapshotTimer));
    this._track(() => window.clearInterval(logTimer));
    this._track(() => window.removeEventListener('focus', onFocus));
  }

  async refresh() {
    if (this.disposed) return;
    await this._loadLoop();
    await this._refreshSnapshot(false);
    await this._refreshNodeLog(false);
    this._render();
  }

  render() {
    this._render();
  }

  dispose() {
    super.dispose();
    this.el.remove();
  }

  get selectedNode() {
    return this.loop.nodes.find((node) => node.id === this.selectedNodeId) || null;
  }

  async _loadLoop() {
    try {
      const next = await loopApi.get();
      this.loop = next || createDefaultLoop();
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
      this.snapshot = await loopApi.snapshot();
      if (shouldRender) this._renderUnlessEditing();
    } catch (err) {
      this._setError(err);
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
      const nextLog = (await loopApi.getNodeLog(this.selectedNodeId)) || '';
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
    const selectedNode = this.selectedNode;
    const inspectorVisible = Boolean(selectedNode && !this.inspectorCollapsed);
    this.el.replaceChildren(
      this._renderHeader(),
      this.error ? _el('div', { className: 'loop-builder-error', textContent: this.error }) : null,
      this._renderBoardLayout(inspectorVisible, selectedNode),
    );
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
    const actions = _el('div', 'loop-builder-actions',
      _el('span', { textContent: `${this.loop.nodes.length} nodes` }),
      _el('span', { textContent: `${runningCount(this.snapshot)} running` }),
      this._button('+ Agent', 'loop-secondary-btn', () => this._addNode('agent')),
      this._button('+ Executable', 'loop-secondary-btn', () => this._addNode('executable')),
      this._button('+ Fichier', 'loop-secondary-btn', () => this._addNode('display')),
      this._button(this.saving ? 'Save...' : 'Save board', 'flow-add-btn', () => void this._saveLoop(), {
        disabled: this.saving,
      }),
    );

    return _el('div', 'loop-builder-header',
      _el('div', null,
        _el('h2', { className: 'flow-title', textContent: 'Boucles' }),
        _el('p', {
          className: 'loop-builder-subtitle',
          textContent: 'Board visuel: agents, executables, liens.',
        }),
      ),
      actions,
    );
  }

  _renderBoardLayout(inspectorVisible, selectedNode) {
    const className = `loop-board-layout${inspectorVisible ? '' : ' is-inspector-collapsed'}`;
    const children = [this._renderCanvas()];
    if (inspectorVisible && selectedNode) children.push(this._renderInspector(selectedNode));
    return _el('div', className, ...children);
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

  _renderZoomControls() {
    return _el('div', 'loop-zoom-controls',
      this._button('-', '', () => this._adjustZoom(-0.1)),
      _el('span', { textContent: `${Math.round(this.zoom * 100)}%` }),
      this._button('+', '', () => this._adjustZoom(0.1)),
      this._button('Reset', '', () => {
        this.zoom = 1;
        this._render();
      }),
    );
  }

  _renderLinks() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('loop-board-links');
    for (const edge of this.loop.edges) {
      const from = this.loop.nodes.find((node) => node.id === edge.from);
      const to = this.loop.nodes.find((node) => node.id === edge.to);
      if (!from || !to) continue;
      svg.appendChild(this._renderEdgePath(edge, from, to));
    }
    return svg;
  }

  _renderEdgePath(edge, from, to) {
    const startX = from.x + NODE_SIZE;
    const startY = from.y + NODE_SIZE / 2;
    const endX = to.x;
    const endY = to.y + NODE_SIZE / 2;
    const curve = Math.max(80, Math.abs(endX - startX) / 2);
    const d = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
    const group = document.createElementNS(SVG_NS, 'g');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'loop-board-link');
    path.setAttribute('d', d);
    group.appendChild(path);
    if (edge.label) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'loop-board-link-label');
      text.setAttribute('x', String((startX + endX) / 2));
      text.setAttribute('y', String((startY + endY) / 2 - 6));
      text.textContent = edge.label;
      group.appendChild(text);
    }
    return group;
  }

  _renderNodeCard(node, process) {
    const agentRunning = node.type === 'agent' && process?.status === 'running';
    const article = _el('article', {
      className: [
        'loop-board-node',
        `loop-board-node-${node.type}`,
        node.id === this.selectedNodeId ? 'is-selected' : '',
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
    if (node.type === 'agent') {
      body.appendChild(_el('button', {
        className: `loop-node-run-btn${agentRunning ? ' is-stop' : ''}`,
        disabled: this.saving && !agentRunning,
        type: 'button',
        textContent: agentRunning ? 'Stop' : 'Run',
        onClick: (event) => {
          event.stopPropagation();
          if (agentRunning) void this._stopAgentCard(node.id);
          else void this._runAgentCard(node.id);
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
      _el('button', {
        className: 'loop-node-port',
        title: 'Creer un lien depuis ce node',
        type: 'button',
        onClick: (event) => {
          event.stopPropagation();
          this.linkSourceId = node.id;
          this._render();
        },
      }),
    );
    return article;
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
      const folder = await dialogApi.openFolder();
      if (folder) this._updateNode(node.id, { cwd: folder });
    });
    return this._label('Path', _el('div', 'loop-folder-row', input, choose));
  }

  _renderAgentFields(node) {
    const triggerType = node.triggerType || (node.hookTrigger ? 'hook' : 'schedule');
    return [
      this._label('Agent', this._select(AGENT_OPTIONS, node.agent, (value) =>
        this._updateNode(node.id, { agent: value }, false)
      )),
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
      this._label('Trigger', this._select(TRIGGER_TYPE_LABELS, triggerType, (value) =>
        this._updateNode(node.id, {
          triggerType: value,
          hookTrigger: value === 'hook' ? node.hookTrigger || defaultAgentHookTrigger() : undefined,
        })
      )),
      triggerType === 'schedule' ? this._renderScheduleFields(node) : this._renderHookFields(node),
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
    return [
      this._label('Commande executable', _el('textarea', {
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
        _el('span', { textContent: 'Watcher / run persistant' }),
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
        this._render();
      }),
    ];
    if (node.type !== 'display') {
      if (process?.status === 'running') {
        actions.push(this._button('Stop', 'loop-danger-btn', () => void this._stopSelected()));
      } else {
        actions.push(this._button(
          node.type === 'executable' && node.persistent ? 'Run watcher' : 'Run',
          'loop-primary-btn',
          () => void this._runSelected(),
        ));
      }
    }
    return _el('div', 'loop-inspector-actions', ...actions);
  }

  _renderEdgesPanel(selectedNodeId) {
    const edges = selectedEdges(this.loop, selectedNodeId);
    return _el('div', 'loop-edge-panel',
      _el('h3', { textContent: 'Liens visuels' }),
      edges.length === 0
        ? _el('div', { textContent: 'Aucun lien pour ce node.' })
        : _el('div', null, ...edges.map((edge) => {
          const from = this.loop.nodes.find((node) => node.id === edge.from);
          const to = this.loop.nodes.find((node) => node.id === edge.to);
          return _el('div', 'loop-edge-row',
            _el('span', {
              textContent: `${from ? getNodeTitle(from) : edge.from} vers ${to ? getNodeTitle(to) : edge.to}`,
            }),
            _el('button', {
              type: 'button',
              textContent: 'Supprimer',
              onClick: () => this._deleteEdge(edge.id),
            }),
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
        ? _el('pre', { textContent: this.nodeLog })
        : _el('div', { textContent: 'Aucun log pour ce node.' }),
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
    if (node.type === 'agent') return node.agent;
    if (node.type === 'executable') return node.persistent ? 'watcher' : 'exec';
    return 'fichier';
  }

  _updateLoop(updater, shouldRender = true) {
    this.loop = typeof updater === 'function' ? updater(this.loop) : updater;
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
    this._render();
  }

  _deleteNode(nodeId) {
    this._updateLoop((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== nodeId),
      edges: current.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    }), false);
    if (this.selectedNodeId === nodeId) this.selectedNodeId = null;
    if (this.linkSourceId === nodeId) this.linkSourceId = null;
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
  }

  _selectNode(nodeId) {
    if (this.linkSourceId && this.linkSourceId !== nodeId) {
      const edge = {
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: this.linkSourceId,
        to: nodeId,
      };
      this._updateLoop((current) => ({ ...current, edges: [...current.edges, edge] }), false);
      this.linkSourceId = null;
    }
    this.selectedNodeId = nodeId;
    this.inspectorCollapsed = false;
    void this._refreshNodeLog(false);
    this._render();
  }

  async _saveLoop(nextLoop = this.loop) {
    this.saving = true;
    this.error = '';
    this._render();
    try {
      this.loop = await loopApi.save(nextLoop);
      if (this.selectedNodeId && !this.loop.nodes.some((node) => node.id === this.selectedNodeId)) {
        this.selectedNodeId = null;
      }
      return this.loop;
    } catch (err) {
      this.error = err?.message || String(err);
      return null;
    } finally {
      this.saving = false;
      this._render();
    }
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
      await loopApi.runNode(node.id);
      await this._refreshSnapshot(false);
      await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    }
  }

  async _runAgentCard(nodeId) {
    const node = this.loop.nodes.find((item) => item.id === nodeId);
    if (!node || node.type !== 'agent') return;
    const saved = await this._saveLoop();
    if (!saved) return;
    try {
      await loopApi.runNode(nodeId);
      await this._refreshSnapshot(false);
      if (this.selectedNodeId === nodeId) await this._refreshNodeLog(false);
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

  async _stopAgentCard(nodeId) {
    const node = this.loop.nodes.find((item) => item.id === nodeId);
    if (!node || node.type !== 'agent') return;
    await this._stopNode(nodeId);
  }

  async _stopNode(nodeId) {
    try {
      await loopApi.stopNode(nodeId);
      await this._refreshSnapshot(false);
      if (this.selectedNodeId === nodeId) await this._refreshNodeLog(false);
      this._render();
    } catch (err) {
      this._setError(err);
    }
  }

  _handleCanvasDown(event) {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    if (
      target.closest('.loop-board-node') ||
      target.closest('.loop-zoom-controls') ||
      target.closest('.loop-inspector-reopen')
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
    if (this.canvasEl) Object.assign(this.canvasEl.style, this._canvasStyle());
    if (this.surfaceEl) Object.assign(this.surfaceEl.style, this._surfaceStyle());
  }

  _handleCanvasUp(event) {
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
        this.linkSourceId = null;
      }
    }
    this._endPointerWork();
  }

  _endPointerWork() {
    const hadWork = this.drag || this.pan;
    this.drag = null;
    this.pan = null;
    if (hadWork) this._render();
  }

  _adjustZoom(delta) {
    this.zoom = Math.min(1.4, Math.max(0.45, Number((this.zoom + delta).toFixed(2))));
    this._render();
  }
}

registerComponent('LoopView', LoopView);
