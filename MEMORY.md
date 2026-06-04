# Project Memory

## 2026-06-04

- Branch badge sync: the workspace header branch badge is refreshed through renderer terminal polling even when `cwd` does not change. `TerminalInstance` emits `terminal:branchCheck`; `tab-lifecycle.js` performs the injected `gitBranch` lookup and updates the badge. Keep terminal code free of direct `window.api.git` calls.
