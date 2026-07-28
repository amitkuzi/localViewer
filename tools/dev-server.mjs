#!/usr/bin/env node
// Zero-dependency static file server for local development. Serves the repo
// root on http://localhost:<port> so .vscode/launch.json can run/debug the
// app without any build step. Pair of console.log lines below (start/ready)
// double as markers for the VS Code background-task problem matcher.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const port = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.stl': 'application/sla',
  '.3mf': 'model/3mf',
  '.step': 'model/step',
  '.stp': 'model/step',
  '.scad': 'application/x-openscad'
};

const rootWithSep = root.endsWith('\\') || root.endsWith('/') ? root : root + '\\';

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const rel = (urlPath === '/' ? '/index.html' : urlPath).replace(/\//g, '\\');
    const filePath = normalize(join(root, rel));
    if (!filePath.startsWith(rootWithSep) && filePath !== root) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const st = await stat(filePath).catch(() => null);
    if (!st || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(500); res.end('Internal error');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Most likely a previous debug session's server is still up — treat as ready.
    console.log(`localViewer dev server ready at http://localhost:${port}/ (already running)`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

console.log(`Starting localViewer dev server on port ${port}...`);
server.listen(port, () => {
  console.log(`localViewer dev server ready at http://localhost:${port}/`);
});
