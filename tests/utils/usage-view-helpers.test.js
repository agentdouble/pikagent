/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { _internals } from '../../src/utils/usage-view-helpers.js';

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
    const td = document.createElement('td');
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
