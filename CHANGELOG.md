# Changelog

Version and release date come from [`src/version.js`](src/version.js) (the
canonical source); `package.json` and the About dialog are kept in sync.

## 1.7.0 — 2026-11-25

### Added
- **Clickable links in Markdown.** Links no longer navigate the whole app away
  (the GitHub Pages "404 File not found" page):
  - `#heading` links scroll to the heading in the same document (headings now get
    GitHub-style ids).
  - `http(s)://` and `mailto:` links open in a new browser tab.
  - Relative links (`other.md`, `../docs/page.html#setup`) open the target in a new
    localViewer tab and jump to the `#heading`, if any. A target that is already
    open is switched to instead of being reloaded.
  - Absolute local paths (`D:\docs\a.md`, `file:///D:/docs/a.md`) open too when they
    lie inside a folder localViewer may read.
- For files opened from disk (installed app, drag-drop, **Open file**), following a
  link asks once for the containing folder; the grant is remembered.
- **HTML viewer** — `.html` / `.htm` render in a sandboxed preview tab (scripts run in
  an isolated origin). **Open in browser** is offered when the page came from a URL.
- About dialog shows the version and release date.

### Changed
- Drag-drop and **Open file** keep the file handle (Edge/Chrome), so **Save** on a
  Markdown file writes back to the original file.
- The Windows helper (`tools/open-file.ps1`) now serves the opened file's whole
  folder (and subfolders) on loopback, so relative links work there too.
- Service-worker cache bumped to `v16`.

## 1.6.0 — 2026-11-08

- Instant tab with a loading spinner while a file opens.
