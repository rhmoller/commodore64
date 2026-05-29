# The VIC-II Video Chip (6567 NTSC / 6569 PAL)

The VIC-II generates the display **and shares the bus with the CPU**, stealing
cycles when it needs to fetch data. Mastering the C64's graphics is mostly about
mastering *VIC-II timing* — when it reads, when it lets the CPU run, and how to
change its registers at exactly the right cycle. This is the chip the demoscene
lives in.

## Starter notes

### Registers — 47 of them at `$D000–$D02E`

The VIC has **47 read/write registers** mapped at `$D000` (53248). The block
mirrors up to `$D3FF`, but the live registers end at `$D02E`. The ones you'll
touch constantly:

| Reg | Addr | Purpose |
|-----|------|---------|
| Sprite X/Y | `$D000–$D00F` | 8 sprites, X then Y per pair; `$D010` = 9th (high) X bit |
| `$D011` | 53265 | Control 1: bit7 = raster high bit, **DEN** (display enable), **BMM** (bitmap mode), **ECM**, vertical scroll (bits 0–2), 25/24 rows |
| `$D012` | 53266 | Raster line (read = current line; write = IRQ compare line) |
| `$D015` | 53269 | Sprite enable (1 bit per sprite) |
| `$D016` | 53270 | Control 2: **MCM** (multicolor), 40/38 columns, **X-scroll** (bits 0–2) |
| `$D017`/`$D01D` | | Sprite Y / X expand (double size) |
| `$D018` | 53272 | **Memory pointers**: screen base (bits 4–7) + char/bitmap base (bits 1–3) |
| `$D019`/`$D01A` | | IRQ status / IRQ enable (raster, sprite-sprite, sprite-bg collisions) |
| `$D01B` | | Sprite-background priority |
| `$D01C` | | Sprite multicolor enable |
| `$D01E`/`$D01F` | | Sprite-sprite / sprite-background collision (read) |
| `$D020`/`$D021` | 53280/1 | Border / background color 0 |
| `$D022–$D024` | | Background colors 1–3 (multicolor/ECM) |
| `$D025/$D026` | | Sprite multicolors 0/1 (shared) |
| `$D027–$D02E` | | Per-sprite color |

VIC sees only a **16K bank** at a time, selected by the *inverted* low 2 bits of
**CIA2 `$DD00`**. Within that bank, `$D018` picks where screen RAM (×$0400) and
the charset/bitmap (×$0800 / ×$2000) live. **Color RAM is fixed at `$D800` (4-bit
nybbles)** regardless of bank.

### The display & memory it reads

- **Text mode (default):** a 1000-byte **video matrix** (screen RAM) of character
  pointers, each indexing an 8×8 glyph in a 2048-byte **character base** (256
  glyphs). Each screen cell has a 4-bit color nybble in Color RAM. The char ROM
  (uppercase/graphics + lowercase sets) lives at `$D000` *as seen by VIC* but you
  can point at your own RAM charset — essential for games (custom tiles) and
  scrollers.
- **Bitmap mode (`BMM` in `$D011`):** 320×200 hires (1 bit/pixel, 8KB) or, with
  `MCM` in `$D016`, **160×200 multicolor** (2 bits/pixel → 4 colors per 8×8 cell:
  `00`=background `$D021`, `01`=screen hi-nybble, `10`=screen lo-nybble, `11`=Color
  RAM). Multicolor halves horizontal resolution but is the standard for colorful
  graphics.
- **Extended Background Color Mode (ECM)** and combinations give the rest of the
  mode matrix; ECM trades charset size for 4 selectable backgrounds.

### Sprites (MOBs)

**8 hardware sprites**, each **24×21 pixels**, freely positioned by 9-bit X (`$D010`
holds the 9th bit) and 8-bit Y. Each can be **X/Y doubled** (`$D01D/$D01E`...
expand), set **multicolor** (12×21 logical, two shared colors + one private),
and given front/back **priority** vs the background. The VIC reports
**sprite-sprite and sprite-background collisions** in `$D01E/$D01F` (cheap
hardware collision detection — read once per frame). Sprite data is 63 bytes,
pointed to by the 8 bytes at *screen base + `$3F8`*.

### Bad lines — the single most important timing concept

Normally the VIC fetches in its "background" phase and the CPU runs freely. But
on a **Bad Line** the VIC must fetch 40 character pointers + colors, so it
**stalls the CPU for ~40–43 cycles** of that scanline.

> **Bad Line Condition** (from Christian Bauer's canonical article): at the
> negative edge of φ0 within `$30 ≤ RASTER ≤ $F7`, the low three RASTER bits equal
> the vertical scroll value (`$D011` bits 0–2), *and* DEN was set during line
> `$30`.

Bad lines normally happen every 8th raster (when YSCROLL matches), giving each
text row its data. Two consequences drive everything:

1. Your per-line raster code has **far fewer free cycles on a bad line** (~23
   instead of ~63). Cycle-exact effects must account for this.
2. You can **force or suppress bad lines** by writing YSCROLL — the basis of
   **FLD** (suppress → push the screen down) and **FLI** (force every line →
   per-line color/graphics).

### Raster timing

A raster line is **63 cycles on PAL (6569)**, 64 on NTSC 6567R56A, 65 on
6567R8. **8 pixels are emitted per CPU clock cycle.** Reading `$D012` (+ the high
bit in `$D011`) tells you the current line; writing it sets the IRQ compare line.
This 1:1 cycle↔pixel relationship is why you can place a register write at a
*known horizontal position* by counting cycles.

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 250" font-family="monospace" font-size="12">
  <style>.b{stroke:#333;stroke-width:1}.t{fill:#111}.bad{fill:#ffb3b3}.norm{fill:#cfe8ff}.bord{fill:#bdbdbd}.disp{fill:#d8f0c0}</style>
  <text x="290" y="16" text-anchor="middle" font-size="13" class="t">One PAL frame: 312 lines × 63 cycles ≈ 19,656 cycles</text>
  <!-- screen vertical structure -->
  <rect class="b bord" x="40" y="28" width="220" height="22"/><text x="150" y="43" text-anchor="middle" class="t">top border</text>
  <rect class="b disp" x="40" y="50" width="220" height="120"/><text x="150" y="92" text-anchor="middle" class="t">display window</text>
  <text x="150" y="108" text-anchor="middle" class="t" font-size="10">lines $33–$FA (PAL)</text>
  <text x="150" y="124" text-anchor="middle" class="t" font-size="10">bad line every 8th row</text>
  <rect class="b bord" x="40" y="170" width="220" height="22"/><text x="150" y="185" text-anchor="middle" class="t">bottom border</text>
  <text x="40" y="210" class="t" font-size="10">borders openable by toggling 24/25 rows ($D011) &amp; 38/40 cols ($D016)</text>
  <!-- one raster line cycle budget -->
  <text x="430" y="40" text-anchor="middle" class="t">one raster line = 63 cycles</text>
  <rect class="b norm" x="320" y="50" width="220" height="30"/><text x="430" y="69" text-anchor="middle" class="t">normal line: ~63 CPU cycles free</text>
  <rect class="b bad"  x="320" y="84" width="220" height="30"/><text x="430" y="103" text-anchor="middle" class="t">BAD line: VIC steals ~40–43</text>
  <text x="320" y="138" class="t" font-size="10">8 pixels emitted per CPU cycle →</text>
  <text x="320" y="153" class="t" font-size="10">count cycles to hit an exact X position.</text>
  <text x="320" y="173" class="t" font-size="10">FLD = suppress bad lines (push screen down)</text>
  <text x="320" y="188" class="t" font-size="10">FLI = force a bad line every scanline</text>
</svg>

### Raster interrupts & stable raster

Set `$D01A` bit 0 to enable raster IRQs, write the target line to `$D012`, ack by
writing `$D019`. Because an IRQ waits for the current instruction (0–7 cycle
jitter), a naive handler can't change a register at an exact pixel. The
**double-IRQ technique** (a second IRQ one line later that does a precise
`NOP`-timed wait) removes the jitter — required for split-screen modes, FLI, and
opening the borders.

### Opening the borders

The side and top/bottom borders are drawn by VIC comparing the raster/column to
fixed limits. **Trick the comparison** — switch to 24-row mode (`$D011`) *at the
moment* VIC checks the bottom border, then back to 25-row — and VIC never closes
the border, letting sprites show in it. The same idea opens the **side borders**
(toggle 38/40 columns in `$D016` at the right cycle). Sprites are the only thing
visible in opened borders.

### Scrolling

- **Smooth/hardware scroll:** `$D016` bits 0–2 (X, 0–7px) and `$D011` bits 0–2 (Y).
  Shift 0→7, then on the 8th pixel do a **hard scroll**: copy/rewrite the screen
  by one character and reset the fine offset. Combine with **38-column / 24-row
  mode** to hide the incoming edge.
- **Sprite multiplexing:** reuse the 8 sprites down the screen by repositioning &
  re-pointing them in raster IRQs after they've been displayed — yields dozens of
  on-screen sprites. The core technique behind shoot-'em-ups and sprite-heavy
  demos. (See [game-dev-patterns.md](game-dev-patterns.md) and
  [demoscene-effects.md](demoscene-effects.md).)

## Annotated resources

### Primary / canonical

- **[Christian Bauer — "The MOS 6567/6569 Video Controller (VIC-II)"](https://www.cebix.net/VIC-Article.txt)**
  *(primary, THE reference)*. The complete reverse-engineering: cycle-by-cycle
  bus behavior, bad lines, sprite DMA, register effects per cycle. Dense but
  authoritative; every serious VIC effect traces back to this. Mirror:
  [zimmers.net](https://www.zimmers.net/cbmpics/cbm/c64/vic-ii.txt).
- **[MOS 6567 VIC-II preliminary datasheet (PDF)](http://archive.6502.org/datasheets/mos_6567_vic_ii_preliminary.pdf)**
  *(primary)*. The manufacturer datasheet: 47 registers, MOB/sprite specs, the
  video-matrix/character-base addressing, bitmap & multicolor mode definitions.

### Tutorials & approachable explanations

- **[Dustlayer — "VIC-II for Beginners"](https://dustlayer.com/vic-ii)** *(tutorial)*.
  The friendliest on-ramp: banks, `$D018`, screen/char/color memory, how the VIC
  sees memory. Read this before the Bauer article.
- **[Codebase64 — VIC / graphics articles](https://codebase64.c64.org/doku.php?id=base:vicii)**
  *(community)*. Per-effect write-ups: bad-line timing, border opening, FLD/FLI,
  sprite stretching, stable rasters.
- **[Bumbershoot Software — bad lines](https://www.bumbershootsoft.net/)** and
  **[c64os.com FLI timing series](https://c64os.com/post/flitiming1)** *(blogs)*.
  Modern, careful walk-throughs of bad-line cycle budgets and FLI timing.
- **[C64-Wiki: Raster interrupt](https://www.c64-wiki.com/wiki/Raster_interrupt)**,
  **[VIC bank](https://www.c64-wiki.com/wiki/VIC_bank)** *(quick lookup)*.
