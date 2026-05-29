# C64 Dev Library — Web Viewer

A small, zero-build, **offline-capable** web viewer for the markdown docs in
[`../docs/`](../docs/). Renders Markdown, **Mermaid diagrams**, and the inline
**SVGs**, with a C64-themed UI, sidebar navigation, an on-page table of contents,
prev/next paging, and an optional CRT-scanline effect.

## Run it

The viewer loads the docs with `fetch("../docs/…")`, so it must be served over
HTTP **from the repository root** (not opened as a `file://` URL). Easiest way:

```sh
# from the c64-tools/ directory
python3 viewer/serve.py            # serves repo root, opens the viewer
# -> http://localhost:8000/viewer/
```

Any static server rooted at the repo works too, e.g.:

```sh
# from the c64-tools/ directory
python3 -m http.server 8000        # then open http://localhost:8000/viewer/
```

> If you serve from *inside* `viewer/`, `../docs/` is above the server root and
> won't load — serve from the repo root.

## How it works

- **`index.html`** — shell: top bar, sidebar, content, TOC. Loads the two
  vendored libraries as plain `<script>` tags.
- **`app.js`** — fetches each `.md`, renders with `marked`, converts
  ```` ```mermaid ```` fences into Mermaid diagrams, generates heading IDs + TOC,
  handles hash routing (`#cpu-6510`), and rewrites internal `*.md` links to route
  within the app. External links open in a new tab.
- **`style.css`** — the C64 boot-screen-inspired theme. Diagrams/SVGs sit on a
  light card so the light-themed hand-drawn SVGs stay legible.
- **`vendor/`** — pinned local copies of [`marked`](https://marked.js.org/)
  (v13) and [`mermaid`](https://mermaid.js.org/) (v11). No internet needed at
  runtime.

## Adding or reordering pages

Edit the `DOCS` array at the top of [`app.js`](app.js) — each entry is
`{ file, title }`, in the order shown in the sidebar. The route key is the
filename without `.md` (e.g. `vic-ii.md` → `#vic-ii`).

## Updating the vendored libraries

```sh
curl -fsSL -o viewer/vendor/marked.min.js \
  https://cdn.jsdelivr.net/npm/marked@13.0.3/marked.min.js
curl -fsSL -o viewer/vendor/mermaid.min.js \
  https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js
```
