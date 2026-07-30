import { describe, expect, it, vi } from 'vitest';
import { createExternalLinkHandler } from '../../src/utils/terminal-links.js';
import { setupTerminalWebLinks } from '../../src/utils/terminal-factory.js';

describe('createExternalLinkHandler', () => {
  it('delegates link activation to the operating system', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const preventDefault = vi.fn();
    const handler = createExternalLinkHandler(openExternal);

    await handler.activate({ preventDefault }, 'https://example.com/docs');

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('keeps non-HTTP OSC 8 protocols disabled', () => {
    const handler = createExternalLinkHandler(vi.fn());

    expect(handler.allowNonHttpProtocols).toBe(false);
  });

  it('requires an injected external opener', () => {
    expect(() => createExternalLinkHandler(null))
      .toThrowError('openExternal must be a function');
  });
});

describe('setupTerminalWebLinks', () => {
  it('uses the external opener for xterm OSC 8 links and loads plain URL support', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const term = { options: {}, loadAddon: vi.fn() };

    setupTerminalWebLinks(term, openExternal);
    await term.options.linkHandler.activate(null, 'https://example.com/osc-8');

    expect(term.options.linkHandler.allowNonHttpProtocols).toBe(false);
    expect(term.loadAddon).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/osc-8');
  });
});
