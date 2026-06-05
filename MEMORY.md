# Project Memory

- UI settings use `persistedSetting` for localStorage-backed values. Settings sections are registered through `registerComponent` and loaded via side-effect imports in `src/components/index.js`.
- Explorer file rows should reuse `src/utils/file-icons.js` as the single source of truth for file language detection and visible file-type icons.
- The Board should act as an agent control table with lightweight output previews and actions; do not embed full xterm instances in each Board card.
- Board previews should prefer the source terminal xterm buffer over raw PTY text when available, because agent TUIs redraw with carriage returns/cursor control sequences that garble lightweight raw previews.
- Branch badge sync: terminal branch refresh is wired through `src/utils/terminal-events.js` as `terminal:branchCheck`; `tab-lifecycle.js` performs the injected `gitBranch` lookup. Keep terminal code free of direct `window.api.git` calls.
- Workspace numeric shortcuts: default direct tab shortcuts are `control+1` through `control+9` with action ids `goToTab1` through `goToTab9`. Direct lookup uses visible tab order and skips tabs marked `NoShortcut`; xterm must let these combos bubble to `ShortcutManager`.
- Linear-inspired theme: global restyle overrides live in `src/styles/linear-theme.css`, loaded last from `src/index.html`. Keep future visual polish there when possible, and keep the default `Pikagent` terminal theme aligned with the same neutral graphite palette in `src/utils/terminal-themes.js`.
- Theme color preference: Jeremy found the first Linear-inspired dark background too black. Prefer a softer pastel slate/lavender dark palette over near-black graphite for app backgrounds.
- Theme border preference: Jeremy found the Linear-inspired UI too boxed in when separators were highly visible. Prefer low-alpha subtle borders and softer active terminal/tab accents instead of strong panel outlines.
- Self-update uses `electron-updater` against GitHub Releases (`agentdouble/pikagent`) and should consume published macOS artifacts (`dmg`, `zip`, `latest-mac.yml`), not rebuild locally from a source checkout.
- macOS release builds must keep `build.mac.notarize: true` and `hardenedRuntime: true`; GitHub release workflow expects signing/notarization secrets before pushing a public `v*` tag.
- PTY agent detection uses `pgrep -P <pid>`; exit code `1` means no child process was found and should be treated as an empty result, not logged as `_checkAgent failed`.
- Board replies should send terminal Enter as `\r`, not `\n`, and each Board-sent message should create a compact response card that streams the following agent output without turning the Board into a full terminal.
- Dev Electron must use a checkout-scoped `Pickagent Dev/<checkout>` userData profile and `npm run dev` must stay foreground-managed; backgrounding `node build.js --watch & electron . &` leaves orphan watchers and can collide with production Chromium storage.
