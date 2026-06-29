import { describe, it, expect } from 'vitest';
import {
  detectKind, splitPath, basename, dirname,
  containingFolder, hasResolvablePath, titleFor, fileMeta
} from '../src/format.js';

describe('detectKind', () => {
  it('recognises markdown variants', () => {
    expect(detectKind('readme.md')).toBe('md');
    expect(detectKind('notes.MARKDOWN')).toBe('md');
    expect(detectKind('log.txt')).toBe('md');
  });
  it('recognises yaml variants', () => {
    expect(detectKind('config.yaml')).toBe('yaml');
    expect(detectKind('config.YML')).toBe('yaml');
  });
  it('recognises 3d formats', () => {
    expect(detectKind('part.stl')).toBe('stl');
    expect(detectKind('Part.3MF')).toBe('3mf');
  });
  it('returns null for unsupported / empty', () => {
    expect(detectKind('photo.png')).toBeNull();
    expect(detectKind('')).toBeNull();
    expect(detectKind(undefined)).toBeNull();
  });
});

describe('splitPath', () => {
  it('splits posix paths', () => {
    expect(splitPath('/home/me/file.md')).toEqual({ dir: '/home/me', base: 'file.md' });
  });
  it('splits windows paths', () => {
    expect(splitPath('C:\\Users\\me\\file.stl')).toEqual({ dir: 'C:\\Users\\me', base: 'file.stl' });
  });
  it('splits urls and strips query/hash', () => {
    expect(splitPath('https://x.com/a/b/part.3mf?v=2#top'))
      .toEqual({ dir: 'https://x.com/a/b', base: 'part.3mf' });
  });
  it('handles a bare name', () => {
    expect(splitPath('file.yaml')).toEqual({ dir: '', base: 'file.yaml' });
  });
  it('ignores trailing separators', () => {
    expect(splitPath('/a/b/')).toEqual({ dir: '/a', base: 'b' });
  });
});

describe('basename / dirname / containingFolder', () => {
  it('extracts components', () => {
    expect(basename('C:\\d\\x.md')).toBe('x.md');
    expect(dirname('C:\\d\\x.md')).toBe('C:\\d');
    expect(containingFolder('/a/b/c.txt')).toBe('/a/b');
  });
  it('returns empty folder for a bare name', () => {
    expect(containingFolder('x.md')).toBe('');
    expect(hasResolvablePath('x.md')).toBe(false);
    expect(hasResolvablePath('/a/x.md')).toBe(true);
  });
});

describe('titleFor', () => {
  it('includes the file name when present', () => {
    expect(titleFor('a.md')).toBe('a.md — localViewer');
  });
  it('falls back to a generic title', () => {
    expect(titleFor('')).toMatch(/^localViewer/);
  });
});

describe('fileMeta', () => {
  it('uses the source as display path when richer than the name', () => {
    const m = fileMeta('part.stl', 'C:\\models\\part.stl');
    expect(m.name).toBe('part.stl');
    expect(m.displayPath).toBe('C:\\models\\part.stl');
    expect(m.folder).toBe('C:\\models');
    expect(m.kind).toBe('stl');
  });
  it('falls back to the bare name when no source is given', () => {
    const m = fileMeta('a.yaml');
    expect(m.source).toBe('a.yaml');
    expect(m.displayPath).toBe('a.yaml');
    expect(m.folder).toBe('');
  });
});
