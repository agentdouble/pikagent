---
name: pickagent
description: Use when Codex works with Pickagent or Pikagent as a workflow builder, including designing Boucles or Flows, teaching an AI agent how to create reusable workflows, wiring hooks schedules links agents and executable nodes, inspecting workflow config, or maintaining Pickagent automation.
---

# Pickagent Workflow Builder

## Core Model

Treat a Pickagent workflow as a reusable operational object, not as a one-off prompt.
Define these fields before implementation:

- Goal: the visible user outcome.
- Trigger: manual run, schedule, hook event, file change, upstream link, or human action.
- Context: files, cwd, paths, payload fields, project ids, task ids, and state files the agent may read.
- Actor/action: Codex, Claude, Opencode, shell command, watcher script, or file node.
- Success condition: the concrete state, file, PR, report, test, or handoff that proves completion.
- Continuation: stop, notify, launch the next linked node, emit another hook, or wait for a human.
- Memory/output: where durable output is written and what future agents must be able to reload.
- Human gate: when the workflow must ask before editing, merging, deleting, spending money, or exposing secrets.

## Pick The Surface

- Use **Boucles** for visual multi-step automation, branching, linked nodes, hook-triggered agents, watchers, and workflows that users should inspect or remix.
- Use **Flows** for simpler reusable single-agent or linear prompts.
- Use **Skills** when an agent needs repeatable knowledge or procedures across projects or machines.
- Use normal terminal tabs when the work is interactive and should not become repeatable yet.

## Workflow Design Procedure

1. Inspect the current machine before assuming paths or ids.
   - User flow config normally lives in `~/.config/.pickagent/flows/`.
   - User Boucles boards normally live in `~/.config/.pickagent/loops/`.
   - Boucles logs normally live in `~/.config/.pickagent/loops/logs/<boardId>/`.
   - If the app repo is available, inspect `bin/pickagent-hook.cjs`, `main/flow-helpers.js`, and loop-related helpers before changing runtime behavior.
2. Name the workflow from the user outcome, not from internal plumbing.
3. Choose the trigger contract.
   - Event name: stable and grep-able, for example `journey.test` or `lanceur.coder`.
   - Provider/source: `manual`, `watcher`, `codex`, `claude`, `opencode`, or a specific watcher name.
   - Cwd: the project root or orchestrator root the agent should run from.
   - Payload: pass compact ids and paths; let the skill or script reload large files from disk.
4. Create the smallest useful graph.
   - Agent nodes do judgment, writing, review, or synthesis.
   - Executable nodes run watchers, scripts, build commands, or deterministic actions.
   - File nodes expose durable artifacts users or agents must open quickly.
   - Link nodes only when upstream success should automatically continue the workflow.
5. Give each agent a narrow prompt.
   - State its source of truth.
   - State what it may edit.
   - State exact success/failure outputs.
   - Tell it when to stop instead of guessing.
6. Validate before claiming the workflow works.
   - Run hook checks with `pickagent-hook ... --dry-run --json`.
   - Validate JSON boards with `jq empty`.
   - Run deterministic scripts directly before wiring them into Boucles.
   - Check logs and resulting state files after a real run.

## Hook Patterns

Use the bundled hook CLI when connecting external tools, watchers, or agents to Pickagent:

```bash
pickagent-hook emit <event> --provider watcher --cwd /path/to/project --dry-run --json
pickagent-hook emit <event> --source watcher --cwd /path/to/project --payload-json '{"task_id":"T1"}' --dry-run --json
pickagent-hook run loop:<boardId>:<nodeId> --cwd /path/to/project
```

Prefer `--dry-run --json` first so the matched Flow or Boucles target is visible before execution.
Use `--payload-json` for compact structured context, not full specs, logs, or large task files.

## Boucles Rules

- Treat the board JSON as user-owned config. Preserve unrelated nodes, positions, labels, and settings.
- Prefer adding a small lane over rewriting a working board.
- Keep event names, node ids, cwd, and watcher entrypoints explicit in the final answer.
- For scheduled or hook launchers, keep launcher reasoning cheap and delegate high-quality work to the real worker agent or skill.
- For linked agents, make downstream prompts able to reload the upstream artifact from disk.
- Avoid storing transient viewport state in board JSON; UI-only state belongs in renderer local storage.
- When publishing or moving a board to another machine, copy the board JSON plus any referenced scripts, skills, and expected filesystem roots.

## Agent Prompt Contract

When creating a Pickagent agent node, include:

```text
Use the relevant skill if it exists.
Read the configured source files before acting.
Do only the scoped action for this node.
Write durable output to <path or system>.
If required inputs are missing, report the missing item and stop.
When done, state the exact artifact, status, or next event.
```

Do not make agent prompts depend on chat history. Put durable instructions in a Skill, repo `AGENTS.md`, project `MEMORY.md`, or a file node.

## Product Framing

Explain Pickagent workflows from the user's visible loop:

1. Create a reusable workflow.
2. Launch it manually, by schedule, by hook, or from another node.
3. Observe logs, running agents, outputs, and failures.
4. Improve prompts, scripts, and gates.
5. Reuse, remix, export, import, or share the workflow.

Avoid leading with watcher internals unless the user is debugging wiring. For product or onboarding answers, lead with workflow templates, remixability, human-in-the-loop control, and repeatable outcomes.
