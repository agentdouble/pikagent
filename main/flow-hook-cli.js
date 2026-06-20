const { promises: fsp } = require('fs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  FLOWS_DIR,
  LOGS_DIR,
  HOOK_STATE_FILE,
  LOOPS_DIR,
  loopBoardPath,
  loopNodeLogPath,
} = require('./paths');
const { MAX_FLOW_RUNTIME_MS, MAX_RUN_HISTORY, buildFlowCommand } = require('./flow-helpers');
const { flowMatchesHookEvent, debounceKey } = require('./flow-triggers');
const { linkedRunnableNodes, shouldTriggerLinkedTargets } = require('./loop-link-helpers');
const { beginLoopNodeRun, finishLoopNodeRun, readActiveLoopNodeRun } = require('./loop-run-state');
const { nowISO, toLogFilename, extractDateString } = require('../shared/date-utils');

const DEFAULT_PROVIDER = 'manual';

function printHelp() {
  console.log(`Usage:
  pickagent-hook emit <event> [--provider codex] [--cwd /repo] [--path src/file.js]
  pickagent-hook <event> [--provider watcher] [--cwd /repo] [--paths src/a.js,src/b.js]
  pickagent-hook --event-json -
  pickagent-hook run <flow-or-loop-target> [--cwd /repo]

Options:
  --provider, --source <name>   Event source: codex, claude, opencode, watcher, manual, ...
  --cwd <dir>                   Working directory for matching and execution
  --path <path>                 Changed path, can be repeated
  --paths <a,b>                 Comma-separated changed paths
  --tool <name>                 Tool that produced the event, if known
  --payload-json <json>         Extra payload stored on the event
  --flow <id-or-name>           Restrict emit matching to one flow or loop agent
  --event-json <path|->         Read the full hook event as JSON
  --dry-run                     Print matching targets without executing
  --json                        Print machine-readable summary
  --help                        Show this help
`);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', reject);
  });
}

function optionValue(argv, index) {
  const item = argv[index];
  const eq = item.indexOf('=');
  if (eq >= 0) return { value: item.slice(eq + 1), nextIndex: index };
  if (index + 1 >= argv.length) throw new Error(`Missing value for ${item}`);
  return { value: argv[index + 1], nextIndex: index + 1 };
}

async function parseArgs(argv) {
  const out = {
    mode: 'emit',
    eventType: '',
    targetFlow: '',
    provider: '',
    cwd: '',
    paths: [],
    tool: '',
    payload: undefined,
    eventJson: '',
    dryRun: false,
    json: false,
    help: false,
  };

  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--json') out.json = true;
    else if (arg.startsWith('--event-json')) {
      const parsed = optionValue(argv, i);
      out.eventJson = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('--provider') || arg.startsWith('--source')) {
      const parsed = optionValue(argv, i);
      out.provider = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('--cwd')) {
      const parsed = optionValue(argv, i);
      out.cwd = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('--paths')) {
      const parsed = optionValue(argv, i);
      out.paths.push(...parsed.value.split(','));
      i = parsed.nextIndex;
    } else if (arg.startsWith('--path')) {
      const parsed = optionValue(argv, i);
      out.paths.push(parsed.value);
      i = parsed.nextIndex;
    } else if (arg.startsWith('--tool')) {
      const parsed = optionValue(argv, i);
      out.tool = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('--payload-json')) {
      const parsed = optionValue(argv, i);
      out.payload = JSON.parse(parsed.value);
      i = parsed.nextIndex;
    } else if (arg.startsWith('--flow')) {
      const parsed = optionValue(argv, i);
      out.targetFlow = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals[0] === 'run') {
    out.mode = 'run';
    out.targetFlow = positionals[1] || out.targetFlow;
  } else if (positionals[0] === 'emit') {
    out.mode = 'emit';
    out.eventType = positionals[1] || '';
  } else if (positionals[0]) {
    out.mode = 'emit';
    out.eventType = positionals[0];
  }

  if (out.eventJson) {
    const raw = out.eventJson === '-' ? await readStdin() : await fsp.readFile(out.eventJson, 'utf-8');
    const parsed = JSON.parse(raw);
    out.eventType = parsed.type || parsed.event || out.eventType;
    out.provider = parsed.provider || parsed.source || out.provider;
    out.cwd = parsed.cwd || out.cwd;
    out.paths = Array.isArray(parsed.paths) ? parsed.paths : parsed.path ? [parsed.path] : out.paths;
    out.tool = parsed.tool || out.tool;
    out.payload = parsed.payload || out.payload;
  }

  if (out.mode === 'emit' && !out.eventType && !out.help) {
    throw new Error('Missing event name. Use `pickagent-hook emit file.changed ...`.');
  }
  if (out.mode === 'run' && !out.targetFlow && !out.help) {
    throw new Error('Missing flow id or name. Use `pickagent-hook run <flow>`.');
  }

  out.cwd = out.cwd || process.cwd();
  out.provider = out.provider || DEFAULT_PROVIDER;
  out.paths = out.paths.map((p) => p.trim()).filter(Boolean);
  return out;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf-8'));
  } catch {
    return null;
  }
}

async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

function flowPath(id) {
  return path.join(FLOWS_DIR, `${id}.json`);
}

function logPath(flowId, timestamp) {
  return path.join(LOGS_DIR, `${flowId}_${timestamp}.log`);
}

async function listFlows(flowsDir = FLOWS_DIR) {
  try {
    const files = await fsp.readdir(flowsDir);
    const flows = [];
    for (const file of files) {
      if (file === 'categories.json' || !file.endsWith('.json')) continue;
      const data = await readJson(path.join(flowsDir, file));
      if (data?.id && data?.prompt) flows.push(data);
    }
    return flows;
  } catch {
    return [];
  }
}

function loopTargetId(boardId, nodeId) {
  return `loop:${boardId}:${nodeId}`;
}

function loopNodeToHookTarget(board, node) {
  const boardId = board.id || 'main';
  const nodeType = node.type || 'agent';
  return {
    id: loopTargetId(boardId, node.id),
    name: `${board.name || 'Boucles'} / ${node.title || (nodeType === 'executable' ? 'Executable' : 'Agent')}`,
    nodeType,
    prompt: node.prompt || '',
    command: node.command || '',
    agent: node.agent || 'codex',
    cwd: node.cwd || '',
    enabled: node.enabled !== false,
    persistent: Boolean(node.persistent || node.watcher),
    triggerType: node.triggerType || (node.hookTrigger ? 'hook' : 'schedule'),
    hookTrigger: node.triggerType === 'hook' || (!node.triggerType && node.hookTrigger) ? node.hookTrigger : undefined,
    dangerouslySkipPermissions: Boolean(node.dangerouslySkipPermissions),
    source: 'loop',
    boardId,
    boardName: board.name || 'Boucles',
    nodeId: node.id,
    nodeTitle: node.title || (nodeType === 'executable' ? 'Executable' : 'Agent'),
  };
}

async function listLoopAgentTargets(loopsDir = LOOPS_DIR) {
  try {
    const files = (await fsp.readdir(loopsDir)).filter((file) => file.endsWith('.json'));
    const targets = [];
    for (const file of files) {
      const board = await readJson(path.join(loopsDir, file));
      if (!board || !Array.isArray(board.nodes)) continue;
      const boardWithId = {
        ...board,
        id: board.id || path.basename(file, '.json'),
      };
      for (const node of board.nodes) {
        if (!isHookTriggeredLoopAgent(node)) continue;
        targets.push(loopNodeToHookTarget(boardWithId, node));
      }
    }
    return targets;
  } catch {
    return [];
  }
}

function isHookTriggeredLoopAgent(node) {
  return node?.type === 'agent'
    && Boolean(node.id)
    && node.enabled !== false
    && Boolean(node.hookTrigger)
    && (node.triggerType === 'hook' || !node.triggerType);
}

async function listHookTargets({ flowsDir = FLOWS_DIR, loopsDir = LOOPS_DIR } = {}) {
  const [flows, loopTargets] = await Promise.all([listFlows(flowsDir), listLoopAgentTargets(loopsDir)]);
  return [
    ...flows.map((flow) => ({ ...flow, source: 'flow' })),
    ...loopTargets,
  ];
}

function targetMatches(flow, target) {
  return flow.id === target ||
    flow.name === target ||
    flow.nodeTitle === target ||
    `${flow.boardName}/${flow.nodeTitle}` === target ||
    `${flow.boardName} / ${flow.nodeTitle}` === target;
}

function findFlow(flows, target) {
  return flows.find((flow) => targetMatches(flow, target)) || null;
}

async function readState() {
  return (await readJson(HOOK_STATE_FILE)) || { debounce: {} };
}

async function shouldDebounce(flow, event, state, now) {
  const seconds = Math.max(0, Number(flow.hookTrigger?.debounceSeconds || 0));
  if (!seconds) return false;
  const key = debounceKey(flow, event);
  const last = state.debounce?.[key] || 0;
  if (now - last < seconds * 1000) return true;
  state.debounce[key] = now;
  return false;
}

function safeCwd(cwd) {
  if (cwd) {
    try {
      if (fs.statSync(cwd).isDirectory()) return cwd;
    } catch {}
  }
  return os.homedir();
}

function writeInitialLog(flowId, runTimestamp, output) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(logPath(flowId, runTimestamp), output, 'utf-8');
}

function appendLog(flowId, runTimestamp, data) {
  try {
    fs.appendFileSync(logPath(flowId, runTimestamp), data, 'utf-8');
  } catch (err) {
    process.stderr.write(`[pickagent-hook] failed to append log: ${err.message}\n`);
  }
}

async function beginRun(flowId, runTimestamp) {
  const flow = await readJson(flowPath(flowId));
  if (!flow) return;
  const now = nowISO();
  const runs = flow.runs || [];
  runs.push({
    date: extractDateString(now),
    timestamp: now,
    logTimestamp: runTimestamp,
    status: 'running',
  });
  flow.runs = runs.length > MAX_RUN_HISTORY ? runs.slice(-MAX_RUN_HISTORY) : runs;
  flow.updatedAt = now;
  await writeJson(flowPath(flowId), flow);
}

async function finishRun(flowId, status, runTimestamp) {
  const flow = await readJson(flowPath(flowId));
  if (!flow) return;
  const now = nowISO();
  const runs = flow.runs || [];
  const idx = runs.findIndex((run) => run.logTimestamp === runTimestamp);
  if (idx >= 0) {
    runs[idx] = {
      ...runs[idx],
      date: extractDateString(now),
      timestamp: now,
      status,
    };
  } else {
    runs.push({
      date: extractDateString(now),
      timestamp: now,
      logTimestamp: runTimestamp,
      status,
    });
  }
  flow.runs = runs.length > MAX_RUN_HISTORY ? runs.slice(-MAX_RUN_HISTORY) : runs;
  flow.updatedAt = now;
  await writeJson(flowPath(flowId), flow);
}

function isLoopTarget(flow) {
  return flow.source === 'loop';
}

function loopTargetLogPath(flow) {
  return loopNodeLogPath(flow.boardId || 'main', flow.nodeId);
}

function writeInitialTargetLog(flow, runTimestamp, output) {
  if (!isLoopTarget(flow)) {
    writeInitialLog(flow.id, runTimestamp, output);
    return;
  }
  const file = loopTargetLogPath(flow);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `\n[pickagent-hook] ${runTimestamp}\n${output}`, 'utf-8');
}

function appendTargetLog(flow, runTimestamp, data) {
  if (!isLoopTarget(flow)) {
    appendLog(flow.id, runTimestamp, data);
    return;
  }
  try {
    fs.appendFileSync(loopTargetLogPath(flow), data, 'utf-8');
  } catch (err) {
    process.stderr.write(`[pickagent-hook] failed to append loop log: ${err.message}\n`);
  }
}

async function beginTargetRun(flow, runTimestamp, child) {
  if (!isLoopTarget(flow)) {
    await beginRun(flow.id, runTimestamp);
    return;
  }
  await beginLoopNodeRun({
    boardId: flow.boardId || 'main',
    nodeId: flow.nodeId,
    pid: child?.pid,
    runTimestamp,
    logFile: loopTargetLogPath(flow),
    source: 'hook',
  });
}

async function finishTargetRun(flow, status, runTimestamp) {
  if (!isLoopTarget(flow)) {
    await finishRun(flow.id, status, runTimestamp);
    return;
  }
  await finishLoopNodeRun({
    boardId: flow.boardId || 'main',
    nodeId: flow.nodeId,
    status,
  });
}

async function runLinkedLoopTargets(flow, event, context = {}) {
  if (!isLoopTarget(flow)) return [];
  const boardId = flow.boardId || 'main';
  const board = await readJson(loopBoardPath(boardId));
  if (!board) return [];
  const boardWithId = { ...board, id: board.id || boardId };
  const visited = normalizeVisited(context.visited, flow.nodeId);
  const targets = linkedRunnableNodes(boardWithId, flow.nodeId, visited);
  const results = [];

  for (const node of targets) {
    const target = loopNodeToHookTarget(boardWithId, node);
    if (await readActiveLoopNodeRun(boardId, node.id)) {
      appendTargetLog(flow, '', `[pickagent-hook] skip linked trigger ${target.nodeTitle}: already running\n`);
      results.push({
        flowId: target.id,
        flowName: target.name,
        source: target.source,
        exitCode: 0,
        status: 'skipped',
        skipped: true,
      });
      continue;
    }
    appendTargetLog(flow, '', `[pickagent-hook] linked trigger ${target.nodeTitle}\n`);
    const nextVisited = normalizeVisited(visited, node.id);
    results.push(await runCommand(
      target,
      {
        ...event,
        trigger: 'link',
        upstreamNodeId: flow.nodeId,
        upstreamNodeTitle: flow.nodeTitle,
      },
      { visited: nextVisited },
    ));
  }

  return results;
}

function normalizeVisited(value, nodeId) {
  const visited = value instanceof Set ? new Set(value) : new Set(Array.isArray(value) ? value : []);
  if (nodeId) visited.add(nodeId);
  return visited;
}

async function runCommand(flow, event, context = {}) {
  const cwd = safeCwd(event.cwd || flow.cwd);
  const runTimestamp = toLogFilename();
  const command = buildHookTargetCommand(flow).trim();
  const initialOutput = [
    'Pickagent headless run',
    `target: ${flow.name} (${flow.id})`,
    `cwd: ${cwd}`,
    `event: ${JSON.stringify(event)}`,
    '',
  ].join('\n');

  writeInitialTargetLog(flow, runTimestamp, initialOutput);
  const child = spawn(command, {
    cwd,
    shell: true,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  const result = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {}
    }, MAX_FLOW_RUNTIME_MS);

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      appendTargetLog(flow, runTimestamp, data.toString());
    });
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      appendTargetLog(flow, runTimestamp, data.toString());
    });
    child.on('error', (err) => {
      const msg = `\n[pickagent-hook] failed to start: ${err.message}\n`;
      appendTargetLog(flow, runTimestamp, msg);
      process.stderr.write(msg);
    });
    child.on('close', async (code, signal) => {
      clearTimeout(timeout);
      const status = code === 0 ? 'success' : 'error';
      appendTargetLog(flow, runTimestamp, `\n[pickagent-hook] exit code: ${code ?? 'unknown'}\n`);
      let linkedResults = [];
      try {
        await finishTargetRun(flow, status, runTimestamp);
        if (shouldTriggerLinkedTargets(code, signal)) {
          linkedResults = await runLinkedLoopTargets(flow, event, context);
        }
      } catch (err) {
        process.stderr.write(`[pickagent-hook] failed to record run: ${err.message}\n`);
      }
      const linkedFailed = linkedResults.some((result) => result.exitCode !== 0);
      resolve({
        flowId: flow.id,
        flowName: flow.name,
        source: flow.source || 'flow',
        exitCode: (code ?? 1) || (linkedFailed ? 1 : 0),
        status: linkedFailed ? 'error' : status,
        linkedResults,
      });
    });
  });
  try {
    await beginTargetRun(flow, runTimestamp, child);
  } catch (err) {
    process.stderr.write(`[pickagent-hook] failed to record run start: ${err.message}\n`);
  }
  return result;
}

function buildHookTargetCommand(flow) {
  if (flow.source === 'loop' && flow.nodeType === 'executable') {
    const command = String(flow.command || '').trim();
    if (!command) throw new Error(`Executable node command is empty: ${flow.nodeTitle || flow.name}`);
    return command;
  }
  return buildFlowCommand(flow);
}

function toEvent(options) {
  return {
    type: options.eventType,
    provider: options.provider,
    cwd: options.cwd,
    paths: options.paths,
    tool: options.tool || undefined,
    payload: options.payload,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = await parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const flows = await listHookTargets();
  const event = toEvent(options);
  let matched = [];
  const skipped = [];

  if (options.mode === 'run') {
    const flow = findFlow(flows, options.targetFlow);
    if (!flow) throw new Error(`Flow not found: ${options.targetFlow}`);
    matched = [flow];
  } else {
    matched = flows.filter((flow) => flowMatchesHookEvent(flow, event));
    if (options.targetFlow) {
      matched = matched.filter((flow) => targetMatches(flow, options.targetFlow));
    }

    const state = await readState();
    const now = Date.now();
    const runnable = [];
    for (const flow of matched) {
      if (await shouldDebounce(flow, event, state, now)) {
        skipped.push({ flowId: flow.id, flowName: flow.name, reason: 'debounce' });
      } else {
        runnable.push(flow);
      }
    }
    matched = runnable;
    if (!options.dryRun) await writeJson(HOOK_STATE_FILE, state);
  }

  if (options.dryRun) {
    const summary = {
      event,
      matched: matched.map((flow) => ({ id: flow.id, name: flow.name, source: flow.source || 'flow' })),
      skipped,
    };
    if (options.json) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`Matched ${summary.matched.length} target(s).`);
      for (const flow of summary.matched) console.log(`- ${flow.name} (${flow.id})`);
      for (const item of skipped) console.log(`- skipped ${item.flowName} (${item.reason})`);
    }
    return 0;
  }

  if (!matched.length) {
    if (options.json) console.log(JSON.stringify({ event, matched: [], skipped }, null, 2));
    else console.log('No matching Pickagent hook targets.');
    return 0;
  }

  const results = [];
  for (const flow of matched) {
    process.stderr.write(`[pickagent-hook] running ${flow.name} (${flow.id})\n`);
    results.push(await runCommand(flow, event));
  }

  if (options.json) console.log(JSON.stringify({ event, results, skipped }, null, 2));
  return results.some((result) => result.exitCode !== 0) ? 1 : 0;
}

module.exports = {
  main,
  parseArgs,
  flowPath,
  listFlows,
  listHookTargets,
  listLoopAgentTargets,
  loopNodeToHookTarget,
  runLinkedLoopTargets,
  targetMatches,
  shouldDebounce,
  buildHookTargetCommand,
  runCommand,
};
