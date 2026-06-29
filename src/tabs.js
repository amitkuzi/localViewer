// Framework-free model for the set of open documents ("tabs").
// Pure state + subscription; no DOM. Unit-testable in isolation.

export class TabStore {
  constructor() {
    this.tabs = [];
    this.activeId = null;
    this._seq = 0;
    this._subs = new Set();
  }

  get count() { return this.tabs.length; }

  get active() {
    return this.tabs.find(t => t.id === this.activeId) || null;
  }

  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  _emit() { for (const fn of this._subs) fn(this); }

  // Open a document. If a tab with the same (truthy) `source` already exists,
  // its payload is refreshed and it is activated instead of duplicating it.
  open(tab) {
    const existing = tab.source
      ? this.tabs.find(t => t.source === tab.source)
      : null;
    if (existing) {
      Object.assign(existing, tab, { id: existing.id });
      this.activeId = existing.id;
      this._emit();
      return existing;
    }
    const rec = { ...tab, id: `t${++this._seq}` };
    this.tabs.push(rec);
    this.activeId = rec.id;
    this._emit();
    return rec;
  }

  activate(id) {
    if (id !== this.activeId && this.tabs.some(t => t.id === id)) {
      this.activeId = id;
      this._emit();
    }
    return this.active;
  }

  // Close a tab; the neighbour to the right (else left) becomes active.
  close(id) {
    const idx = this.tabs.findIndex(t => t.id === id);
    if (idx < 0) return this.active;
    this.tabs.splice(idx, 1);
    if (this.activeId === id) {
      const next = this.tabs[idx] || this.tabs[idx - 1] || null;
      this.activeId = next ? next.id : null;
    }
    this._emit();
    return this.active;
  }
}
