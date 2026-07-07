import { describe, expect, it } from 'vitest';

const { createStreamParser } = require('../../main/flow-stream-parser');

describe('flow-stream-parser', () => {
  it('formats Codex response_item message events instead of leaking JSON', () => {
    const parser = createStreamParser();
    const output = parser.push(`${JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Fichier cree.' }],
      },
    })}\n`);

    expect(output).toContain('Fichier cree.');
    expect(output).not.toContain('response_item');
  });

  it('formats Codex result events', () => {
    const parser = createStreamParser();
    const output = parser.push(`${JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'Termine',
      duration_ms: 1200,
    })}\n`);

    expect(output).toContain('Terminé');
    expect(output).toContain('Termine');
    expect(output).not.toContain('"type":"result"');
  });
});
