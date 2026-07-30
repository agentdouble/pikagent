---
name: software-engineering-daily-report
description: Report what the local software engineering pipeline did today by reading the orch workspace, especially merged GitHub PRs grouped by project. Use when the user asks for today's software engineering pipeline status, what PRs were merged today, a concise daily engineering recap, or a human-readable report for an orch workspace.
---

# Software Engineering Daily Report

## Purpose

Use this skill to produce a read-only, human-facing recap of the local software engineering pipeline.

The default report answers: "Which PRs were merged today, grouped by project?" It may also mention currently running pipeline work when that helps explain what is still in progress.

## Source Files

Default root: `$PICKAGENT_ORCH_ROOT` when set, otherwise `~/lab/orch`.

Read:

- `projet.yaml` for project ids and paths
- `orchestre-finished.yaml` for merged PRs and archived tasks
- `orchestre.yaml` for currently running tasks

Use the Europe/Paris local date unless the user gives another date or timezone. Always state the concrete date used.

## Workflow

1. Run the bundled reporter from this skill directory. In the default Codex install:

   ```bash
   ruby ~/.codex/skills/software-engineering-daily-report/scripts/software_engineering_daily_report.rb
   ```

2. For another date:

   ```bash
   ruby ~/.codex/skills/software-engineering-daily-report/scripts/software_engineering_daily_report.rb --date 2026-06-26
   ```

3. For one project:

   ```bash
   ruby ~/.codex/skills/software-engineering-daily-report/scripts/software_engineering_daily_report.rb --project avis
   ```

4. Rewrite the output into a concise, friendly recap:

   - group by project
   - lead with merged PRs
   - include PR numbers and short titles
   - mention merge time or commit only when useful
   - keep empty days short: "Aucune PR mergee aujourd'hui."

## Rules

- Do not edit `task.yaml`, `orchestre.yaml`, `orchestre-finished.yaml`, or `projet.yaml`.
- Do not relaunch hooks, watchers, agents, reviewers, or merge jobs.
- Count a merge when a task has `merge_result: MERGED`, `merged_at`, or `merge_commit`.
- Prefer `merged_at` for the merge date; fall back to `merge_completed_at`, `merge_started_at`, then `completed_at`.
- Treat `status: running` and statuses ending in `_running` as currently executing.
- If the script cannot parse a file, say which file failed and do not guess the report.

## Reporter Options

```bash
ruby ~/.codex/skills/software-engineering-daily-report/scripts/software_engineering_daily_report.rb --help
```

Useful options:

- `--date YYYY-MM-DD`
- `--project PROJECT_ID`
- `--timezone TZ`
- `--root PATH`
- `--json`
- `PICKAGENT_ORCH_ROOT=/path/to/orch` environment override
