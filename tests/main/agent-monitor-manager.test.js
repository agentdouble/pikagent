import { describe, expect, it } from 'vitest';

const { _internals } = require('../../main/agent-monitor-manager');

describe('agent-monitor-manager', () => {
  it('parses ps rows with command and start date', () => {
    const rows = _internals.parsePsOutput([
      '  123   1 Sat Jun 20 10:11:12 2026 codex exec --cwd /repo',
      'bad line',
    ].join('\n'));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pid: 123,
      ppid: 1,
      command: 'codex exec --cwd /repo',
    });
    expect(rows[0].startedAt).toContain('2026');
  });

  it('detects headless commands without matching interactive terminal agents', () => {
    expect(_internals.isHeadlessAgentCommand('python run_headless_agent.py --agent codex')).toBe(true);
    expect(_internals.isHeadlessAgentCommand('codex --sandbox danger-full-access exec --cwd /repo')).toBe(true);
    expect(_internals.isHeadlessAgentCommand('claude --print --cwd /repo')).toBe(true);
    expect(_internals.isHeadlessAgentCommand('opencode -p hello --cwd /repo')).toBe(true);
    expect(_internals.isHeadlessAgentCommand('codex')).toBe(false);
    expect(_internals.isHeadlessAgentCommand('opencode')).toBe(false);
    expect(_internals.isHeadlessAgentCommand('rg codex exec')).toBe(false);
  });

  it('groups related headless processes by derived log file', () => {
    const rows = [
      {
        pid: 10,
        ppid: 1,
        startedAt: '2026-06-20T08:00:00.000Z',
        command: 'python run_headless_agent.py --agent codex --cwd /orch/worktree/task-a --log-file /tmp/task-a/agent.log',
      },
      {
        pid: 11,
        ppid: 10,
        startedAt: '2026-06-20T08:00:01.000Z',
        command: 'codex exec --cwd /orch/worktree/task-a --log-file /tmp/task-a/agent.log',
      },
    ];

    const groups = _internals.groupAgentProcesses(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: '/tmp/task-a/agent.log',
      agent: 'codex',
      cwd: '/orch/worktree/task-a',
      logFile: '/tmp/task-a/agent.log',
      helper: true,
    });
    expect(groups[0].pids).toEqual([10, 11]);
  });

  it('groups shell, node wrapper, and binary from the same codex exec tree', () => {
    const rows = [
      {
        pid: 15309,
        ppid: 82468,
        startedAt: '2026-06-20T17:08:47.000Z',
        command: "/bin/sh -c codex --sandbox workspace-write --ask-for-approval never exec --skip-git-repo-check 'task'",
      },
      {
        pid: 15310,
        ppid: 15309,
        startedAt: '2026-06-20T17:08:47.000Z',
        command: 'node /opt/homebrew/bin/codex --sandbox workspace-write --ask-for-approval never exec --skip-git-repo-check task',
      },
      {
        pid: 15311,
        ppid: 15310,
        startedAt: '2026-06-20T17:08:47.000Z',
        command: '/opt/homebrew/bin/codex --sandbox workspace-write --ask-for-approval never exec --skip-git-repo-check task',
      },
    ];

    const groups = _internals.groupAgentProcesses(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('codex:15309');
    expect(groups[0].pids).toEqual([15309, 15310, 15311]);
    expect(_internals.findHeadlessRootPid(rows[2], new Map(rows.map((row) => [row.pid, row])))).toBe(15309);
  });

  it('collects process descendants before killing a group', () => {
    const rows = [
      { pid: 1, ppid: 0, command: 'root' },
      { pid: 2, ppid: 1, command: 'child' },
      { pid: 3, ppid: 2, command: 'grandchild' },
      { pid: 4, ppid: 1, command: 'sibling' },
    ];

    expect(_internals.collectDescendantPids(rows, [1])).toEqual([2, 4, 3]);
  });
});
