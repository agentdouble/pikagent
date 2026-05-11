/**
 * Domain facade for skills-api, shell-api and dialog-api services
 * used by the SkillsView component.
 *
 * Exposes a single flat interface so the component never imports more than
 * one service module.  The previous named re-exports are kept for
 * backward-compatibility but components should prefer `skillsFacade`.
 *
 * All three service instances are produced by createApiService, which returns
 * a Proxy that delegates every call to window.api[domain][method](...args).
 * The facade composes those proxies into one flat object via a routing map,
 * eliminating the previous hand-written (...a) => proxy.method(...a) wrappers.
 */
import { createApiService } from '../services/create-api-service.js';

// ── service instances (via createApiService) ────────────────────────
const skillsApi = createApiService('skills', { importSkill: 'import', deleteSkill: 'delete' });
const shellApi  = createApiService('shell');
const dialogApi = createApiService('dialog');

// ── method → service routing ────────────────────────────────────────
const routing = {
  // skills
  list:        skillsApi,
  getRoot:     skillsApi,
  read:        skillsApi,
  write:       skillsApi,
  importSkill: skillsApi,
  create:      skillsApi,
  deleteSkill: skillsApi,
  setRoot:     skillsApi,
  // shell
  openPath:    shellApi,
  // dialog
  openFolder:  dialogApi,
};

// ── unified facade (kept for non-component consumers) ───────────────
export const skillsFacade = new Proxy(/** @type {Record<string, (...args: unknown[]) => unknown>} */ ({}), {
  get: (_target, method) => {
    const service = routing[method];
    if (service) return service[method];
    return undefined;
  },
});
