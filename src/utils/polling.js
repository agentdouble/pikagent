/**
 * Re-exports the shared PollingTimer for the renderer process.
 * Implementation lives in shared/polling-timer.js.
 *
 * The class is aliased as RendererPollingTimer to preserve the existing
 * public API used by renderer components.
 */
import { PollingTimer } from '../../shared/polling-timer.js';

export { PollingTimer as RendererPollingTimer };
