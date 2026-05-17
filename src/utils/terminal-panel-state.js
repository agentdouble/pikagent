/**
 * Terminal panel state/serialization facade.
 * Encapsulates terminal-serializer, terminal-split and the
 * terminal-removed event so that terminal-panel.js does not need
 * to import them directly.
 */
import { serializeLayout, serializeElement } from './terminal-serializer.js';
import {
  moveTerminal,
  splitTerminal,
  focusDirection,
} from './terminal-split.js';
import { emitTerminalRemoved } from './terminal-events.js';

export {
  serializeLayout,
  serializeElement,
  moveTerminal,
  splitTerminal,
  focusDirection,
  emitTerminalRemoved,
};
