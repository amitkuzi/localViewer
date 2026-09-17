# localViewer

> **Built by [Amit Kuzi](https://amitkuzi.com)** — Software Architect & Engineering Consultant, Holon, Israel
> [Live app](https://amitkuzi.github.io/localViewer/) · [Architecture case study](https://amitkuzi.com/projects/localviewer/) · [GitHub](https://github.com/amitkuzi) · [OneWall](https://amitkuzi.github.io/OneWall/)

A tiny, install-free viewer for **Markdown (`.md`)**, **YAML (`.yaml` / `.yml`)**, **CSV (`.csv`)**, **STL (`.stl`)**, **3MF (`.3mf`)**, **STEP (`.step` / `.stp`)**, **OpenSCAD (`.scad`)**, **glTF/GLB (`.gltf`, `.glb`)**, and **images (`.svg`, `.png`, `.jpg`, `.gif`, `.webp`, `.bmp`, `.ico`, `.avif`)** files.

- Runs as a single static page in Edge / Chrome / any modern browser.
- Same URL works on Windows and Android — installable as a PWA, works offline after first load.
- On Windows you can right-click a file in File Explorer → **Open with → localViewer**.
- The header shows the current file's name and path, with an **Open folder** button.
  When you open a file through the Windows helper (*Open with → localViewer*), the button
  **reveals the file in Explorer** and the full on-disk path is shown. When you instead
  drag-drop or pick a file, the browser only exposes the file *name* (it hides local paths
  for security), so the button explains how to get the Explorer integration.
- **Multiple files open at once** — each opens in its own tab; drop or pick several at a time,
  click a tab to switch, click × to close. Re-opening the same file re-uses its tab.
- **YAML viewer** — `.yaml`/`.yml` render as a foldable tree with collapsible sections.
  Deep or large blocks start collapsed; **Expand all** / **Collapse all** toggle everything.
- **CSV viewer** — `.csv` renders as a scrollable table with a sticky header row.
  The delimiter (comma, semicolon, or tab) is auto-detected, and **First row is header**
  toggles whether the first row renders as column headers or as data.
- **Markdown editing** — **Edit** toggles the rendered view to the raw Markdown source;
  **Save** writes straight back to the original file (installed-app / File System Access API)
  or opens a Save-As dialog otherwise. **New MD** creates a blank file. Ctrl/Cmd+S saves
  while editing; unsaved tabs are marked and confirm before closing.
- **Markdown RTL/LTR** — by default each rendered block (paragraph, heading, list item, table
  cell) automatically aligns right-to-left or left-to-right based on its own content, so
  Hebrew/Arabic and English text render correctly even mixed in the same document. A
  **Direction** dropdown (Auto/LTR/RTL) lets you override this and force one direction for
  the whole document, in both preview and edit. Code blocks always stay left-to-right.
- **Image viewer** — SVG and raster images with pan (drag), zoom (wheel or **+**/**−**),
  **Fit** / **100%**, and a dark / checker / light background toggle to inspect transparency.
- **STEP viewer** — `.step`/`.stp` CAD files are tessellated client-side (via
  [occt-import-js](https://github.com/kovacsv/occt-import-js), a WASM build of OpenCascade) and
  shown in the same 3D viewer as STL/3MF, with color/wireframe/grid controls and fit-to-view.
- **3MF viewer** — including slicer projects (Bambu Studio, OrcaSlicer, PrusaSlicer) that use
  the 3MF *production extension* and split objects across `3D/Objects/*.model`. three.js's
  `ThreeMFLoader` ignores those cross-part `p:path` references, so multi-object / multi-plate
  files came up empty; `src/threemf.js` resolves them per part instead.
- **OpenSCAD viewer** — `.scad` files are compiled in the browser by
  [openscad-wasm](https://www.npmjs.com/package/openscad-wasm) and shown in the same 3D viewer.
  `include <>` / `use <>` of other files is not resolved — only the opened file is compiled.
- **glTF/GLB viewer** — `.gltf`/`.glb` files render via three.js's `GLTFLoader`, keeping their
  own materials and textures instead of the uniform color/wireframe styling used for
  STL/3MF/STEP. Self-contained `.glb` is recommended; a `.gltf` referencing external
  `.bin`/texture files can't be resolved from a single dropped file.

## Try it

After the repo is pushed and GitHub Pages is enabled, the viewer lives at:

```
https://amitkuzi.github.io/localViewer/
```

Open it, drop a file in, or pass `?src=https://…/your.stl` to auto-load.

## Install as an app

- **Windows / Edge desktop**: open the URL → click **Install app** in the header (or use the address-bar install icon).
- **Android / Edge or Chrome**: open the URL → menu → **Add to Home screen**.

The PWA caches everything (app shell + three.js + marked) on first load, so subsequent launches work offline.
The STEP importer (`occt-import-js`, ~7 MB WASM) and the OpenSCAD compiler (`openscad-wasm`, ~14 MB) are fetched lazily on first use rather than at page load, and are cached from then on.

## File Explorer integration on Windows

The viewer ships with a tiny PowerShell helper that:
1. Spins up a loopback HTTP server (random port, no admin needed).
2. Serves both the viewer and the file you double-clicked on the *same* origin (so the browser can fetch it freely).
3. Opens Edge in app-window mode pointed at the viewer.
4. Auto-exits after 15 minutes of idle.

### Install
From a regular (non-admin) PowerShell prompt:

```powershell
cd <path to viewer>\tools
.\register-windows.ps1
```

This registers a per-user "Open with → localViewer" entry for `.md`, `.stl`, `.3mf`, `.step`, `.stp`, `.scad`, `.gltf`, `.glb`.

### Use
In File Explorer: right-click a supported file → **Open with → localViewer**.
To make it the default for that extension: **Open with → Choose another app → localViewer → Always**.

### Uninstall

```powershell
.\unregister-windows.ps1
```

## Layout

| File | Purpose |
|---|---|
| `index.html` | UI shell + import map + PWA hooks |
| `app.js` | Orchestration: tabs, loaders (STL via three.js, 3MF via threemf.js, STEP via occt-import-js, glTF/GLB via GLTFLoader, MD via marked, YAML via js-yaml, CSV via csvview) |
| `src/format.js` | Pure helpers: file-kind detection, path/title parsing |
| `src/header.js` | Header file-info rendering (name / path / Open folder) |
| `src/tabs.js` | `TabStore` — open/activate/close document tabs |
| `src/tabbar.js` | Tab strip DOM rendering |
| `src/yamlview.js` | YAML → collapsible tree renderer |
| `src/csvview.js` | CSV → delimiter detection, parsing, table renderer |
| `src/mdview.js` | Per-block RTL/LTR direction for rendered markdown |
| `src/threemf.js` | 3MF geometry reader with production-extension (`p:path`) support |
| `test/` | Vitest unit + jsdom integration tests (`npm test`) |
| `sw.js` | Service worker — caches shell + CDN deps for offline |
| `manifest.webmanifest` | PWA manifest |
| `icons/icon.svg` | App icon |
| `tools/open-file.ps1` | Loopback HTTP server + Edge launcher |
| `tools/register-windows.ps1` | HKCU file association installer |
| `tools/unregister-windows.ps1` | Reverses the above |
| `tools/dev-server.mjs` | Zero-dependency static server for local dev (`npm start` / VS Code F5) |

## Enabling GitHub Pages

In `amitkuzi/localViewer`:
- **Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: `main` / `(root)`

After a minute the site goes live at the URL above.

## Development & tests

The viewer ships as plain static files (no build step). The framework-free logic
in `src/` is covered by [Vitest](https://vitest.dev) — unit tests plus jsdom
integration tests for the DOM-rendering pieces:

```bash
npm install
npm test
```

To run the viewer locally instead of relying on the Windows helper or GitHub Pages:

```bash
npm start
```

serves the repo on `http://localhost:8080/`. In VS Code, press **F5** (or Run and Debug →
**Launch Edge against localhost**) — it starts the dev server automatically via
`.vscode/tasks.json` and opens Edge with the debugger attached, so breakpoints in `app.js`
and the `src/` modules work directly.

## Roadmap

- Web Share Target so Android can "Share to localViewer" from any file picker.
- Optional offline vendor bundle (drop the CDN dependency entirely).
- More formats: `.obj`, `.amf`.

## License

Apache-2.0 — see [LICENSE](LICENSE).

## Author

**Amit Kuzi** — Software Architect & Engineering Consultant, Holon, Israel.
Building software since 1997.
[amitkuzi.com](https://amitkuzi.com) · [Case study](https://amitkuzi.com/projects/localviewer/) · [GitHub](https://github.com/amitkuzi)
