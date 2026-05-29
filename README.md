# c64-tools

A self-contained **Commodore 64 development library** — reference docs, an offline
web viewer, a BASIC build/run + live-reload workflow, and emulator tooling. Focus:
**demoscene & game development**, covering the classic C64 and the new
**C64 Ultimate**, in both assembly (KickAssembler) and BASIC V2.

## Layout

| Path | What |
|------|------|
| `docs/` | The library. Start at [`docs/README.md`](docs/README.md) or the syllabus [`docs/CURRICULUM.md`](docs/CURRICULUM.md). |
| `docs/appendix-*.md` | Reference appendices (opcodes, registers, memory map, KERNAL, PETSCII, timing, glossary). |
| `docs/reference/` | Primary-source documents (the Programmer's Reference Guide — searchable `.txt` tracked; PDF re-downloadable). |
| `viewer/` | Offline web viewer (Markdown + Mermaid + SVG, C64-themed). |
| `basic/` | BASIC V2 build/run loop (`make run`, `make watch`). |
| `tools/` | `vice_reload.py` — VICE binary-monitor client for live reload / asset hot-swap. |

## Quick start

```sh
# Read the library in the viewer
python3 viewer/serve.py            # -> http://localhost:8000/viewer/

# Write & run a BASIC program (needs VICE installed)
cd basic && make run               # tokenize hello.bas + launch x64sc
cd basic && make watch             # live-reload loop on save
```

Tooling expected on PATH: **VICE** (`x64sc`, `petcat`), `python3`. See
[`basic/README.md`](basic/README.md) and [`docs/toolchain.md`](docs/toolchain.md).

## Status

The library is being built out against [`docs/CURRICULUM.md`](docs/CURRICULUM.md);
the reference appendices and topic overviews are in place, with teaching parts and
two capstone projects (a game and a demo) in progress.
