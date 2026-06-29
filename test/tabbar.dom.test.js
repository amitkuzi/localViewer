// Integration test (jsdom): the tab strip reflects the store and wires events.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderTabBar } from '../src/tabbar.js';
import { TabStore } from '../src/tabs.js';

const doc = (name, source) => ({
  name, source: source || name, kind: 'md',
  meta: { displayPath: source || name }, payload: { text: name }
});

function wire(container, store) {
  renderTabBar(container, store, {
    onActivate: (id) => store.activate(id),
    onClose:    (id) => store.close(id)
  });
}

describe('renderTabBar (DOM)', () => {
  let container, store;
  beforeEach(() => {
    document.body.innerHTML = '<nav id="tabbar" hidden></nav>';
    container = document.getElementById('tabbar');
    store = new TabStore();
    // keep the bar in sync after every store change
    store.subscribe(() => wire(container, store));
  });

  it('is hidden with no tabs and shown once a tab opens', () => {
    wire(container, store);
    expect(container.hidden).toBe(true);
    store.open(doc('a.md'));
    expect(container.hidden).toBe(false);
    expect(container.querySelectorAll('.tab').length).toBe(1);
  });

  it('marks the active tab', () => {
    store.open(doc('a.md'));
    store.open(doc('b.md'));
    const tabs = container.querySelectorAll('.tab');
    expect(tabs.length).toBe(2);
    expect(tabs[1].classList.contains('active')).toBe(true);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('clicking a tab activates it', () => {
    store.open(doc('a.md'));
    store.open(doc('b.md'));
    const firstTab = container.querySelector('.tab'); // a.md
    firstTab.click();
    expect(store.active.name).toBe('a.md');
    expect(container.querySelectorAll('.tab')[0].classList.contains('active')).toBe(true);
  });

  it('clicking the close button removes the tab without activating it', () => {
    const a = store.open(doc('a.md'));
    store.open(doc('b.md'));        // b is active
    // close a (the non-active tab) via its × button
    const aEl = [...container.querySelectorAll('.tab')].find(el => el.dataset.id === a.id);
    aEl.querySelector('.tab-close').click();
    expect(store.count).toBe(1);
    expect(store.active.name).toBe('b.md');
  });

  it('closing the last tab hides the bar again', () => {
    const a = store.open(doc('a.md'));
    container.querySelector('.tab-close').click();
    expect(store.count).toBe(0);
    expect(container.hidden).toBe(true);
  });
});
