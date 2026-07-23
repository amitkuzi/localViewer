// Integration test (jsdom): CSV rows render as a table, with/without a header row.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderCsvTable } from '../src/csvview.js';

describe('renderCsvTable (DOM)', () => {
  let container;
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c');
  });

  it('renders the first row as a <thead> by default', () => {
    renderCsvTable(container, [['name', 'age'], ['ann', '30'], ['bo', '40']]);
    const headers = [...container.querySelectorAll('thead th')].map(th => th.textContent);
    expect(headers).toEqual(['name', 'age']);
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(2);
  });

  it('renders every row as data when headerRow is false', () => {
    renderCsvTable(container, [['ann', '30'], ['bo', '40']], { headerRow: false });
    expect(container.querySelector('thead')).toBeNull();
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('replaces previous content on re-render', () => {
    renderCsvTable(container, [['a'], ['1']]);
    renderCsvTable(container, [['b'], ['2']]);
    const headers = [...container.querySelectorAll('thead th')].map(th => th.textContent);
    expect(headers).toEqual(['b']);
    expect(container.querySelectorAll('table').length).toBe(1);
  });

  it('renders an empty table for no rows', () => {
    renderCsvTable(container, []);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('tr').length).toBe(0);
  });
});
