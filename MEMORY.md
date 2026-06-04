# Project Memory

- UI settings use `persistedSetting` for localStorage-backed values. Settings sections are registered through `registerComponent` and loaded via side-effect imports in `src/components/index.js`.
- Explorer file rows should reuse `src/utils/file-icons.js` as the single source of truth for file language detection and visible file-type icons.
- The Board should act as an agent control table with lightweight output previews and actions; do not embed full xterm instances in each Board card.
- Board previews should prefer the source terminal xterm buffer over raw PTY text when available, because agent TUIs redraw with carriage returns/cursor control sequences that garble lightweight raw previews.
