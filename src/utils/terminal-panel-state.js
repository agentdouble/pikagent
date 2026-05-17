/**
 * Terminal panel state/serialization facade.
 * Encapsulates terminal-serializer and terminal-split
 * to reduce coupling in terminal-panel.js.
 */
import { serializeLayout, serializeElement } from './terminal-serializer.js';
import {
  moveTerminal,
  splitTerminal,
  focusDirection,
} from './terminal-split.js';

export { serializeLayout, serializeElement, moveTerminal, splitTerminal, focusDirection };
