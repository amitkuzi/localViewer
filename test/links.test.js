import { describe, it, expect } from 'vitest';
import {
  classifyLink, resolveSegments, levelsAboveRoot, segmentsAfterRoot,
  relativeToDir, joinDiskPath, slugify, withBaseHref
} from '../src/links.js';

describe('classifyLink', () => {
  it('treats empty hrefs as nothing to follow', () => {
    expect(classifyLink('')).toEqual({ type: 'none' });
    expect(classifyLink(null)).toEqual({ type: 'none' });
  });

  it('recognises in-document anchors (decoded)', () => {
    expect(classifyLink('#setup')).toEqual({ type: 'anchor', id: 'setup' });
    expect(classifyLink('#%D7%A9%D7%9C%D7%95%D7%9D')).toEqual({ type: 'anchor', id: 'שלום' });
  });

  it('sends web and mail links to the browser', () => {
    expect(classifyLink('https://example.com/a.md')).toEqual({ type: 'external', url: 'https://example.com/a.md' });
    expect(classifyLink('mailto:a@b.c').type).toBe('external');
    expect(classifyLink('//cdn.example.com/x')).toEqual({ type: 'external', url: 'https://cdn.example.com/x' });
  });

  it('splits relative links into path, query and hash', () => {
    expect(classifyLink('docs/other.md#intro')).toEqual(
      { type: 'relative', path: 'docs/other.md', query: '', hash: 'intro' });
    expect(classifyLink('../a.md?x=1')).toEqual(
      { type: 'relative', path: '../a.md', query: '?x=1', hash: '' });
    expect(classifyLink('..\\win\\b.md').path).toBe('../win/b.md');
  });

  it('treats Windows drive paths and file:// URLs as absolute local paths', () => {
    expect(classifyLink('D:\\docs\\a.md#top')).toEqual({ type: 'absolute', path: 'D:/docs/a.md', hash: 'top' });
    expect(classifyLink('file:///D:/My%20Docs/a.md')).toEqual({ type: 'absolute', path: 'D:/My Docs/a.md', hash: '' });
  });
});

describe('resolveSegments', () => {
  it('resolves sibling, child and parent paths', () => {
    expect(resolveSegments(['docs'], 'other.md')).toEqual(['docs', 'other.md']);
    expect(resolveSegments(['docs'], './img/a.png')).toEqual(['docs', 'img', 'a.png']);
    expect(resolveSegments(['docs', 'x'], '../../README.md')).toEqual(['README.md']);
  });
  it('decodes %-escapes per segment', () => {
    expect(resolveSegments([], 'my%20file.md')).toEqual(['my file.md']);
  });
  it('treats a leading slash as the root', () => {
    expect(resolveSegments(['a', 'b'], '/c.md')).toEqual(['c.md']);
  });
  it('returns null when climbing above the root', () => {
    expect(resolveSegments([], '../a.md')).toBeNull();
    expect(resolveSegments(['docs'], '../../a.md')).toBeNull();
  });
});

describe('levelsAboveRoot', () => {
  it('counts how far a path escapes the root', () => {
    expect(levelsAboveRoot(['docs'], 'a.md')).toBe(0);
    expect(levelsAboveRoot([], '../a.md')).toBe(1);
    expect(levelsAboveRoot(['docs'], '../../../a.md')).toBe(2);
  });
});

describe('segmentsAfterRoot', () => {
  it('maps an absolute path onto a folder known by name', () => {
    expect(segmentsAfterRoot('D:/Dev/localViewer/docs/a.md', 'localviewer')).toEqual(['docs', 'a.md']);
    expect(segmentsAfterRoot('D:\\Dev\\x\\a.md', 'Dev')).toEqual(['x', 'a.md']);
  });
  it('returns null when the folder is not in the path', () => {
    expect(segmentsAfterRoot('D:/Other/a.md', 'Dev')).toBeNull();
    expect(segmentsAfterRoot('D:/Dev', 'Dev')).toBeNull();
  });
});

describe('relativeToDir / joinDiskPath', () => {
  it('relativises paths inside a folder only', () => {
    expect(relativeToDir('D:/docs/sub/a.md', 'D:\\Docs')).toBe('sub/a.md');
    expect(relativeToDir('D:/other/a.md', 'D:\\docs')).toBeNull();
    expect(relativeToDir('D:/docsX/a.md', 'D:\\docs')).toBeNull();
  });
  it('joins with the folder\'s own separator', () => {
    expect(joinDiskPath('D:\\docs\\sub', '../a%20b.md')).toBe('D:\\docs\\a b.md');
    expect(joinDiskPath('/home/u', 'x/y.md')).toBe('/home/u/x/y.md');
  });
});

describe('slugify', () => {
  it('builds GitHub-style ids', () => {
    expect(slugify('Getting Started!')).toBe('getting-started');
    expect(slugify('  API: v2 (beta) ')).toBe('api-v2-beta');
    expect(slugify('התקנה מהירה')).toBe('התקנה-מהירה');
  });
});

describe('withBaseHref', () => {
  it('injects <base> right after <head>', () => {
    expect(withBaseHref('<html><head><title>t</title></head></html>', 'http://h/f/a.html'))
      .toBe('<html><head><base href="http://h/f/a.html"><title>t</title></head></html>');
  });
  it('prepends <base> when there is no <head>, and is a no-op without a URL', () => {
    expect(withBaseHref('<p>x</p>', 'http://h/')).toBe('<base href="http://h/"><p>x</p>');
    expect(withBaseHref('<p>x</p>', '')).toBe('<p>x</p>');
  });
});
