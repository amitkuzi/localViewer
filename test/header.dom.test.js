// Integration test (jsdom): the header file-info area reflects fileMeta.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderFileMeta } from '../src/header.js';
import { fileMeta } from '../src/format.js';

function buildHeader() {
  document.body.innerHTML = `
    <span id="fileInfo" hidden>
      <span id="fileName"></span>
      <span id="filePath"></span>
    </span>
    <button id="openFolderBtn" hidden></button>`;
  return {
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    filePath: document.getElementById('filePath'),
    openFolderBtn: document.getElementById('openFolderBtn'),
    doc: document
  };
}

describe('renderFileMeta (DOM)', () => {
  let els;
  beforeEach(() => { els = buildHeader(); });

  it('shows name, path and folder button for a file with a real path', () => {
    const folder = renderFileMeta(els, fileMeta('part.stl', 'C:\\models\\part.stl'));
    expect(els.fileInfo.hidden).toBe(false);
    expect(els.fileName.textContent).toBe('part.stl');
    expect(els.filePath.textContent).toBe('C:\\models\\part.stl');
    expect(els.openFolderBtn.hidden).toBe(false);
    expect(folder).toBe('C:\\models');
    expect(document.title).toBe('part.stl — localViewer');
  });

  it('hides the folder button when only a bare name is known', () => {
    const folder = renderFileMeta(els, fileMeta('notes.md'));
    expect(els.fileInfo.hidden).toBe(false);
    expect(els.fileName.textContent).toBe('notes.md');
    expect(els.filePath.textContent).toBe(''); // no richer path than the name
    expect(els.openFolderBtn.hidden).toBe(true);
    expect(folder).toBe('');
  });

  it('clears the header when passed null', () => {
    renderFileMeta(els, fileMeta('x.md', '/a/x.md'));
    const folder = renderFileMeta(els, null);
    expect(els.fileInfo.hidden).toBe(true);
    expect(els.openFolderBtn.hidden).toBe(true);
    expect(folder).toBe('');
    expect(document.title).toMatch(/^localViewer/);
  });
});
