# C64 Dev Curriculum

The plan for turning this library into a **self-contained course** — detailed
enough to build a demo *and* a game using only this guide. This page is the spec
and the progress tracker; everything else is written against it.

## Goals & conventions

- **Self-contained.** Reference data you need mid-task (opcodes, registers, memory
  map, KERNAL calls, PETSCII) is reproduced here in the **Appendices**, not just
  linked.
- **Assembly-first**, with a solid BASIC V2 part. All assembly code is
  **[KickAssembler](https://theweb.dk/KickAssembler/Main.html)** syntax (macros,
  assemble-time table generation, VICE symbols).
- **Progressive**: orientation → foundations → each chip in depth → two capstones.
- **Per-lesson shape:** *Learning objectives → concept → annotated KickAssembler
  example(s) → common pitfalls → "go deeper" source pointer.*
- **Targets** the PAL machine by default (63 cycles/line, 312 lines); NTSC
  differences are called out where they matter.
- Lives in the viewer; each lesson is a page, nav follows this order.

## Parts & lessons

### Part 0 — Orientation & Toolchain
- 0.1 The machine at a glance — architecture, the chips, PAL vs NTSC, the frame
- 0.2 Dev environment — KickAssembler + VICE, the edit→build→run→live-reload loop
- 0.3 Numbers — binary, hex, bytes, signed/two's-complement

### Part I — 6502/6510 Assembly Foundations
- 1.1 CPU model: registers & status flags
- 1.2 Addressing modes (all, with examples)
- 1.3 Instruction set by group + cycle counts
- 1.4 Memory map & banking ($01)
- 1.5 Zero page
- 1.6 Subroutines, the stack, calling conventions
- 1.7 Multi-byte math: 16-bit add/sub/compare, multiply, divide
- 1.8 Tables, pointers, indirect-indexed, self-modifying code
- 1.9 Useful illegal opcodes
- 1.10 Optimization: cycle budgets, speedcode, loop unrolling
- 1.11 KERNAL/BASIC ROM routines you'll actually call

### Part II — Interrupts & Timing
- 2.1 CPU↔VIC bus sharing; cycles per line/frame
- 2.2 IRQ/NMI mechanics, vectors, acknowledging
- 2.3 Raster interrupts & the stable raster (double-IRQ)
- 2.4 CIA timers; replacing the system IRQ
- 2.5 Reading input: joystick, keyboard matrix, paddles

### Part III — VIC-II Graphics
- 3.1 Registers & VIC banks / memory pointers ($D018, $DD00)
- 3.2 Text mode + custom charsets (standard & multicolor)
- 3.3 Bitmap mode (hires & multicolor)
- 3.4 Extended background color mode & the mode matrix
- 3.5 Smooth scrolling → hard scroll (38-col/24-row)
- 3.6 Sprites: mechanics, multicolor, expansion, priority, collisions
- 3.7 Sprite multiplexing
- 3.8 Badlines & the per-line cycle budget
- 3.9 Raster-effect cookbook (with code): raster bars, open borders, FLD, FLI, AGSP, sprite stretch, DYPP/DYCP

### Part IV — SID Sound
- 4.1 Registers
- 4.2 Oscillators & waveforms (incl. combined)
- 4.3 ADSR & the hard-restart
- 4.4 PWM, ring modulation, sync
- 4.5 The filter
- 4.6 Anatomy of a music player; driving it per frame
- 4.7 Using GoatTracker & integrating exported data
- 4.8 A game SFX engine (channel priorities)
- 4.9 Digi playback (overview)

### Part V — BASIC V2
- 5.1 Language reference
- 5.2 PEEK/POKE, SYS/USR, calling ML
- 5.3 BASIC + ML loaders
- 5.4 Limits & tricks

### Part VI — Capstone: Build a Game
Architecture & main loop · frame pacing · memory plan · object/sprite management ·
multiplexing in practice · collisions · char/tile maps + scrolling levels · game
state & UI · music+SFX integration · **full walkthrough of a small playable game**.

### Part VII — Capstone: Build a Demo
Demo structure & part sequencer · timing effects to music · fitting raster+sprites+
music in one frame · loaders/crunchers (overview) · **full walkthrough of a small
intro**.

### Part VIII — Advanced
LUT math (sin/cos, multiply) · all-RAM / under-ROM configs · disk loading & fast
loaders (overview) · PAL/NTSC portability · C64 Ultimate dev features (cross-ref).

## Appendices — the offline reference core
- **A.** 6502/6510 opcode reference (mnemonics, modes, bytes, cycles, flags) + illegals
- **B.** Memory map $0000–$FFFF
- **C.** VIC-II register reference ($D000–$D02E)
- **D.** SID register reference ($D400–$D41C)
- **E.** CIA register reference ($DC00 / $DD00)
- **F.** KERNAL & BASIC ROM jump tables
- **G.** PETSCII, screen codes & color codes
- **H.** Cycle-timing tables (per line, badlines, sprite DMA)
- **I.** Glossary

## Source → module mapping (what the research mines)

| Module | Primary sources |
|--------|-----------------|
| Part I, App A/B/F | PRG (local PDF/txt), Codebase64, masswerk, oxyron, *Mapping the C64*, zimmers memory map |
| Part II, App H | Bauer VIC-II article, Codebase64, c64os timing posts |
| Part III, App C/G | Bauer VIC-II article, 6567 datasheet, c64-wiki, Dustlayer |
| Part IV, App D | 6581 datasheet, c64-wiki, GoatTracker docs |
| Part V | PRG, C64-Wiki, repo `basic/` |
| App E | zimmers memory map, 6526 datasheet, c64-wiki |

## Build status

Legend: ⬜ not started · 🟦 researching · 🟨 drafted · ✅ done

| Section | Status |
|---------|--------|
| Appendices A–I | ✅ (researched + adversarially verified) |
| Part 0 | ✅ (all code assembles in KickAssembler) |
| Part I | ✅ (all code assembles in KickAssembler) |
| Part II | ✅ (assembled + run headless in VICE; 2 bugs caught & fixed via screenshot/assert) |
| Part III | 🟨 III-A done (3.1–3.5: memory, text/charset, bitmap, ECM, scrolling — verified in VICE); III-B (sprites, multiplexing, bad lines, effects) pending |
| Part IV | ⬜ |
| Part V | ⬜ |
| Part VI (game) | ⬜ |
| Part VII (demo) | ⬜ |
| Part VIII | ⬜ |

*Build order: Appendices first (the reference backbone every lesson cites), then
Parts 0→VIII, capstones last.*
