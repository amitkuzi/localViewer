// The release version/date live in src/version.js; everything that displays
// or publishes them must agree with it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION, RELEASE_DATE } from '../src/version.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

describe('release version', () => {
  it('is semver with an ISO release date', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(RELEASE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('matches package.json', () => {
    expect(JSON.parse(read('package.json')).version).toBe(VERSION);
  });
  it('has a CHANGELOG entry with the same date', () => {
    expect(read('CHANGELOG.md')).toContain(`## ${VERSION} — ${RELEASE_DATE}`);
  });
  it('matches the static About fallback in index.html', () => {
    expect(read('index.html')).toContain(`v${VERSION} · ${RELEASE_DATE}`);
  });
});
