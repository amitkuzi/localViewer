// DOM rendering for the tab strip. CDN-free so it runs under jsdom.
// Rebuilds the bar from the store on each call; wires per-tab activate/close.

export function renderTabBar(container, store, handlers = {}) {
  const { onActivate, onClose } = handlers;
  container.textContent = '';
  container.hidden = store.count === 0;
  if (store.count === 0) return container;

  for (const tab of store.tabs) {
    const el = container.ownerDocument.createElement('div');
    el.className = 'tab' + (tab.id === store.activeId ? ' active' : '');
    el.dataset.id = tab.id;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', String(tab.id === store.activeId));
    el.title = tab.meta?.displayPath || tab.name;

    const label = container.ownerDocument.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.name;
    el.appendChild(label);

    const close = container.ownerDocument.createElement('button');
    close.className = 'tab-close';
    close.type = 'button';
    close.setAttribute('aria-label', `Close ${tab.name}`);
    close.textContent = '×';
    el.appendChild(close);

    el.addEventListener('click', (e) => {
      if (e.target === close) return;
      onActivate?.(tab.id);
    });
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      onClose?.(tab.id);
    });

    container.appendChild(el);
  }
  return container;
}
