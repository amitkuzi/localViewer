import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    environmentMatchGlobs: [
      // Integration tests that touch the DOM run under jsdom.
      ['test/**/*.dom.test.js', 'jsdom']
    ]
  }
});
