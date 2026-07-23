import { describe, it, expect } from 'vitest';
import { detectDelimiter, parseCSV, columnCount } from '../src/csvview.js';

describe('detectDelimiter', () => {
  it('picks comma for standard CSV', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });
  it('picks semicolon when it dominates the header line', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  });
  it('picks tab for TSV', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });
  it('defaults to comma for empty input', () => {
    expect(detectDelimiter('')).toBe(',');
  });
});

describe('parseCSV', () => {
  it('parses simple rows', () => {
    expect(parseCSV('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('handles a trailing newline without an extra blank row', () => {
    expect(parseCSV('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('handles CRLF line endings', () => {
    expect(parseCSV('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('handles quoted fields with embedded delimiters', () => {
    expect(parseCSV('a,"b,c",d\n1,2,3')).toEqual([['a', 'b,c', 'd'], ['1', '2', '3']]);
  });
  it('handles quoted fields with embedded newlines', () => {
    expect(parseCSV('a,"line1\nline2"\n1,2')).toEqual([['a', 'line1\nline2'], ['1', '2']]);
  });
  it('unescapes doubled quotes inside quoted fields', () => {
    expect(parseCSV('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']]);
  });
  it('respects a custom delimiter', () => {
    expect(parseCSV('a;b\n1;2', ';')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('returns an empty array for empty input', () => {
    expect(parseCSV('')).toEqual([]);
  });
  it('treats a blank line as a single empty field', () => {
    expect(parseCSV('a,b\n\n1,2')).toEqual([['a', 'b'], [''], ['1', '2']]);
  });
});

describe('columnCount', () => {
  it('returns the widest row width', () => {
    expect(columnCount([['a', 'b'], ['1', '2', '3']])).toBe(3);
  });
  it('returns 0 for no rows', () => {
    expect(columnCount([])).toBe(0);
  });
});
