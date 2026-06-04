# Project Memory

- UI settings use `persistedSetting` for localStorage-backed values. Settings sections are registered through `registerComponent` and loaded via side-effect imports in `src/components/index.js`.
- Explorer file rows should reuse `src/utils/file-icons.js` as the single source of truth for file language detection and visible file-type icons.
- The Board should act as an agent control table with lightweight output previews and actions; do not embed full xterm instances in each Board card.
- Board previews should prefer the source terminal xterm buffer over raw PTY text when available, because agent TUIs redraw with carriage returns/cursor control sequences that garble lightweight raw previews.
- Branch badge sync: terminal branch refresh is wired through `src/utils/terminal-events.js` as `terminal:branchCheck`; `tab-lifecycle.js` performs the injected `gitBranch` lookup. Keep terminal code free of direct `window.api.git` calls.
- Workspace numeric shortcuts: default direct tab shortcuts are `control+1` through `control+9` with action ids `goToTab1` through `goToTab9`. Direct lookup uses visible tab order and skips tabs marked `NoShortcut`; xterm must let these combos bubble to `ShortcutManager`.
- Linear-inspired theme: global restyle overrides live in `src/styles/linear-theme.css`, loaded last from `src/index.html`. Keep future visual polish there when possible, and keep the default `Pikagent` terminal theme aligned with the same neutral graphite palette in `src/utils/terminal-themes.js`.
