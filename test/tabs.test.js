import { describe, it, expect } from 'vitest';
import { TabStore } from '../src/tabs.js';

const doc = (name, source) => ({ name, source: source || name, kind: 'md', payload: { text: name } });

describe('TabStore', () => {
  it('opens tabs and activates the newest', () => {
    const s = new TabStore();
    s.open(doc('a.md'));
    s.open(doc('b.md'));
    expect(s.count).toBe(2);
    expect(s.active.name).toBe('b.md');
  });

  it('assigns unique ids', () => {
    const s = new TabStore();
    const a = s.open(doc('a.md'));
    const b = s.open(doc('b.md'));
    expect(a.id).not.toBe(b.id);
  });

  it('de-dupes by source: re-opening refreshes and activates the existing tab', () => {
    const s = new TabStore();
    const a = s.open(doc('a.md', '/x/a.md'));
    s.open(doc('b.md', '/x/b.md'));
    const again = s.open({ ...doc('a.md', '/x/a.md'), payload: { text: 'new' } });
    expect(s.count).toBe(2);
    expect(again.id).toBe(a.id);
    expect(again.payload.text).toBe('new');
    expect(s.active.id).toBe(a.id);
  });

  it('does not de-dupe when source is empty/falsy', () => {
    const s = new TabStore();
    s.open({ name: 'x', kind: 'md', payload: {} });
    s.open({ name: 'x', kind: 'md', payload: {} });
    expect(s.count).toBe(2);
  });

  it('activates an existing tab by id', () => {
    const s = new TabStore();
    const a = s.open(doc('a.md'));
    s.open(doc('b.md'));
    expect(s.activate(a.id).name).toBe('a.md');
  });

  it('closing the active tab activates the right neighbour', () => {
    const s = new TabStore();
    const a = s.open(doc('a.md'));
    const b = s.open(doc('b.md'));
    const c = s.open(doc('c.md'));
    s.activate(b.id);
    s.close(b.id);
    expect(s.count).toBe(2);
    expect(s.active.id).toBe(c.id);
  });

  it('closing the last tab falls back to the left neighbour', () => {
    const s = new TabStore();
    s.open(doc('a.md'));
    const b = s.open(doc('b.md'));
    s.close(b.id);
    expect(s.active.name).toBe('a.md');
  });

  it('closing the only tab leaves no active tab', () => {
    const s = new TabStore();
    const a = s.open(doc('a.md'));
    s.close(a.id);
    expect(s.count).toBe(0);
    expect(s.active).toBeNull();
  });

  it('closing a non-active tab keeps the active one', () => {
    const s = new TabStore();
    const a = s.open(doc('a.md'));
    const b = s.open(doc('b.md'));
    s.close(a.id);
    expect(s.active.id).toBe(b.id);
  });

  it('notifies subscribers on open/activate/close', () => {
    const s = new TabStore();
    let n = 0;
    const off = s.subscribe(() => n++);
    const a = s.open(doc('a.md'));   // 1
    const b = s.open(doc('b.md'));   // 2
    s.activate(a.id);                // 3
    s.activate(a.id);                // no-op, already active
    s.close(b.id);                   // 4
    expect(n).toBe(4);
    off();
    s.open(doc('c.md'));
    expect(n).toBe(4); // unsubscribed
  });
});
