// DOM rendering for the header file-info area. Kept free of CDN imports so it
// can be exercised under jsdom. Takes element references explicitly rather than
// reaching for globals, which makes it straightforward to integration-test.
import { titleFor, hasResolvablePath } from './format.js';

// Update the header from a fileMeta (or null to clear). Returns the active
// folder string ('' when none) so the caller can wire "Open folder".
// `els` = { fileInfo, fileName, filePath, openFolderBtn, doc? }
export function renderFileMeta(els, meta) {
  const doc = els.doc || (typeof document !== 'undefined' ? document : null);
  if (!meta) {
    els.fileInfo.hidden = true;
    els.openFolderBtn.hidden = true;
    if (doc) doc.title = titleFor(null);
    return '';
  }
  els.fileName.textContent = meta.name;
  els.filePath.textContent =
    meta.displayPath && meta.displayPath !== meta.name ? meta.displayPath : '';
  els.filePath.title = meta.displayPath || '';
  els.fileInfo.hidden = false;
  els.openFolderBtn.hidden = !hasResolvablePath(meta.source);
  if (doc) doc.title = titleFor(meta.name);
  return meta.folder || '';
}
