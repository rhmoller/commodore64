# VICE C64 IDE + Web Debugger

A browser-based **remote development IDE** for the C64, backed by the
[VICE](https://vice-emu.sourceforge.io/) emulator. Source files live locally on
your PC; you edit them in a CodeMirror editor with C64-BASIC and KickAssembler
syntax highlighting, then **build & inject** them straight into a running VICE
over its binary monitor — no manual `RUN`, no window juggling.

It is the evolution of the original WebSocket⇄binary-monitor debugger, which is
still here (now at `/legacy`) and will be folded into the new UI over time.

```
browser (React + CodeMirror)
   │  HTTP  /api/file  /api/run        ┌─ petcat / KickAss → .prg
   │  WS    /ws (debugger events)      │
   ▼                                   ▼
server.ts (Node, zero runtime deps) ── builds + autostarts ──► VICE -binarymonitor
```

## Architecture

| Piece | Stack |
|-------|-------|
| `src-ui/` | The IDE front end — **Vite + React + TypeScript + CodeMirror 6**. Built to `web/`. |
| `src/server.ts` | HTTP + WebSocket server, VICE binary-monitor bridge, and the file/build API. **Node built-ins only — no runtime dependencies.** |
| `legacy/` | The original vanilla-JS debugger (disassembly, memory, sprites, …), served at `/legacy`. |

The build step and all the new dependencies (React, Vite, CodeMirror) are
**dev-only**. The running server still ships zero runtime dependencies: it just
serves the static `web/` bundle and bridges the monitor socket.

> **Single connection:** VICE accepts only one binary-monitor client at a time,
> and the server holds it. Build & inject therefore goes *through* the server's
> in-process bridge — don't also run `tools/vice_reload.py` against the same
> emulator while the server is up.

## Quick start

1. Install dev dependencies (first time only):

   ```sh
   cd tools/debugger && npm install
   ```

2. Start VICE with the binary monitor enabled:

   ```sh
   x64sc -binarymonitor -binarymonitoraddress ip4://127.0.0.1:6502
   # headless: xvfb-run -a x64sc -binarymonitor -binarymonitoraddress ip4://127.0.0.1:6502
   ```

3. Build the UI and run the server:

   ```sh
   npm run build      # bundles src-ui/ -> web/
   npm run server     # http://localhost:8080/
   ```

   The server takes optional args: `node src/server.ts [http_port] [vice_port] [vice_host] [workspace_root]`.
   The **workspace root** (default: the `c64-tools` repo root) confines which
   files the IDE may open, save and build.

4. Open <http://localhost:8080/>, type a path (e.g. `useit/hello.asm` or
   `basic/hello.bas`), edit, and hit **▶ build & run** (or `Ctrl/Cmd-Enter`).
   `Ctrl/Cmd-S` saves.

## Development (with HMR)

For live front-end editing, run the Node server and the Vite dev server together
— Vite proxies `/api` and `/ws` to the Node server:

```sh
npm run dev        # server (:8080) + vite (:5173) via concurrently
# then open http://localhost:5173/
```

Type-check both halves:

```sh
npm run typecheck  # server tsconfig + src-ui tsconfig
```

## Build & inject

`▶ build & run` POSTs the open file's path to `/api/run`. The server:

1. Picks a builder from the extension — `.bas` → `petcat -w2`, and
   `.asm`/`.s`/`.a`/`.kick` → KickAssembler (`tools/kickass`).
2. Runs it, streaming stdout/stderr to the **build console**.
3. On success, autostarts the resulting `.prg` into the running emulator over
   the binary monitor (load + `RUN`).

KickAss sources should be autostartable — i.e. carry a BASIC stub via
`:BasicUpstart2(addr)` — so the autostart-with-RUN reaches your entry point.

## Files

| Path | Purpose |
|------|---------|
| `src-ui/index.html`, `src/main.tsx`, `src/App.tsx` | UI entry + IDE shell (toolbar, editor, build console). |
| `src-ui/src/components/CodeView.tsx` | CodeMirror 6 React editor (dirty-state, Ctrl-S save). |
| `src-ui/src/langs/kickass.ts`, `c64basic.ts` | CodeMirror stream languages for KickAss 6502 and BASIC V2. |
| `src-ui/src/api.ts` | HTTP client for `/api/file` and `/api/run`. |
| `src/server.ts` | HTTP + WS server, binary-monitor bridge, file/build API. |
| `legacy/` | Original vanilla-JS debugger (served at `/legacy`). |

## Status / roadmap

v1 covers the core loop: **open → edit (highlight) → save → build → inject**.
Planned next: a file-browser tree, a diff viewer, and migrating the legacy
debugger panels (disassembly, registers, memory, sprites/charset/screen) into
the React UI so editing and live debugging share one surface.

## Notes / limitations

- Only `.bas` and KickAss sources have a build path today; other extensions
  report "don't know how to build …".
- The legacy debugger's visual panels read live RAM via the monitor and reflect
  current VIC register state at read time (not a cycle-exact frame). See the
  notes in `legacy/`.
