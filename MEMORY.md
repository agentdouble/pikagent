# Project Memory

- UI settings use `persistedSetting` for localStorage-backed values. Settings sections are registered through `registerComponent` and loaded via side-effect imports in `src/components/index.js`.
- Explorer file rows should reuse `src/utils/file-icons.js` as the single source of truth for file language detection and visible file-type icons.
