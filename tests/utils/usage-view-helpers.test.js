import { describe, it, expect, vi } from 'vitest';

/**
 * Minimal DOM stub so buildTableRow can run without happy-dom.
 *
 * _el() from src/utils/dom.js calls document.createElement, so we mock
 * it to return plain objects that expose the same properties the tests
 * inspect (tagName, children, textContent, className, style, title).
 */
function makeElement(tag, attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    textContent: attrs.textContent != null ? String(attrs.textContent) : '',
    className: attrs.className ?? '',
    style: {},
    title: attrs.title ?? '',
    appendChild(child) { el.children.push(child); return child; },
  };
  if (attrs.style && typeof attrs.style === 'object') Object.assign(el.style, attrs.style);
  return el;
}

vi.mock('../../src/utils/dom.js', () => ({
  _el(tag, attrs = {}, ...children) {
    const el = makeElement(tag, attrs);
    for (const child of children) {
      if (child) el.children.push(child);
    }
    return el;
  },
}));

// Stub Node so the `col instanceof Node` guard in buildTableRow works
// for raw element stubs passed by the tests.
class FakeNode {}
globalThis.Node = globalThis.Node ?? FakeNode;

const { _internals } = await import('../../src/utils/usage-view-helpers.js');
const { buildTableRow } = _internals;

describe('buildTableRow', () => {
  it('creates a <tr> with one <td> for a single column descriptor', () => {
    const row = buildTableRow([{ value: 'hello' }]);
    expect(row.tagName).toBe('TR');
    expect(row.children).toHaveLength(1);
    expect(row.children[0].tagName).toBe('TD');
    expect(row.children[0].textContent).toBe('hello');
  });

  it('applies className to a cell', () => {
    const row = buildTableRow([{ value: 'text', className: 'my-class' }]);
    expect(row.children[0].className).toBe('my-class');
  });

  it('applies inline style to a cell', () => {
    const row = buildTableRow([{ value: 'styled', style: { color: 'red' } }]);
    expect(row.children[0].style.color).toBe('red');
  });

  it('applies title attribute to a cell', () => {
    const row = buildTableRow([{ value: 'with-title', title: 'tooltip text' }]);
    expect(row.children[0].title).toBe('tooltip text');
  });

  it('creates multiple <td> cells from multiple descriptors', () => {
    const row = buildTableRow([
      { value: 'first' },
      { value: 'second', className: 'second-cls' },
      { value: 'third' },
    ]);
    expect(row.children).toHaveLength(3);
    expect(row.children[0].textContent).toBe('first');
    expect(row.children[1].textContent).toBe('second');
    expect(row.children[1].className).toBe('second-cls');
    expect(row.children[2].textContent).toBe('third');
  });

  it('inserts a raw DOM Node as-is', () => {
    // Create an object that passes `instanceof Node`
    const td = Object.create(FakeNode.prototype);
    td.textContent = 'raw-cell';
    td.className = 'raw-cls';
    const row = buildTableRow([{ value: 'first' }, td]);
    expect(row.children).toHaveLength(2);
    expect(row.children[1].className).toBe('raw-cls');
    expect(row.children[1].textContent).toBe('raw-cell');
  });

  it('handles numeric values', () => {
    const row = buildTableRow([{ value: 42 }]);
    expect(row.children[0].textContent).toBe('42');
  });

  it('omits className/style/title attrs when not provided', () => {
    const row = buildTableRow([{ value: 'plain' }]);
    const td = row.children[0];
    expect(td.className).toBe('');
    expect(td.title).toBe('');
  });
});
