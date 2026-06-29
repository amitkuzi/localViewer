# localViewer

A tiny, install-free viewer for **Markdown (`.md`)**, **STL (`.stl`)**, and **3MF (`.3mf`)** files.

- Runs as a single static page in Edge / Chrome / any modern browser.
- Same URL works on Windows and Android — installable as a PWA, works offline after first load.
- On Windows you can right-click a file in File Explorer → **Open with → localViewer**.
- The header shows the current file's name and path, with an **Open folder** button that
  copies the containing folder to the clipboard (browsers can't open Explorer directly).

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

This registers a per-user "Open with → localViewer" entry for `.md`, `.stl`, `.3mf`.

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
| `app.js` | File loaders (STL/3MF via three.js, MD via marked + DOMPurify) |
| `sw.js` | Service worker — caches shell + CDN deps for offline |
| `manifest.webmanifest` | PWA manifest |
| `icons/icon.svg` | App icon |
| `tools/open-file.ps1` | Loopback HTTP server + Edge launcher |
| `tools/register-windows.ps1` | HKCU file association installer |
| `tools/unregister-windows.ps1` | Reverses the above |

## Enabling GitHub Pages

In `amitkuzi/localViewer`:
- **Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: `main` / `(root)`

After a minute the site goes live at the URL above.

## Roadmap

- Web Share Target so Android can "Share to localViewer" from any file picker.
- Optional offline vendor bundle (drop the CDN dependency entirely).
- More formats: `.obj`, `.glb`, `.amf`.
