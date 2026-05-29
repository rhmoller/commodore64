# Part VII — Capstone: Build a Demo

Welcome to the capstone. Across Parts I–IV you built up every piece you need to make a real C64 *intro*: precomputed tables and the BASIC-upstart launcher (Part I), the stable raster IRQ and screen control (Part II), hardware sprites (Part III), and a table-driven SID player (Part IV). This part puts all of it together into one self-contained, never-ending PAL intro — the kind of thing that would scroll a greeting before a cracked game in 1987.

When it runs you get: **scrolling horizontal colour bars**, a **centred, colour-cycling title** reading `C64 DEV LIBRARY`, a **bouncing trio of sprite balls** riding a sine path, a **fine-scrolling message** along the bottom, and a little **tune** playing on SID voice 1 — all of it driven from a single raster interrupt, with `main` doing nothing but `jmp *`.

Here is the finished frame, captured headless from VICE:

![The finished intro running headless in VICE: scrolling rainbow colour bars, the centred "C64 DEV LIBRARY" logo, three sine-path sprite balls, and the bottom scroller.](img/part-7-demo-01.png)

---

## Design & the frame budget

A C64 intro is a **soft real-time program**. There is exactly one thing that happens 50 times a second on a PAL machine — the video chip (VIC-II) draws a frame — and everything you see has to be produced in lock-step with that beam. We hang all of our work off a **single raster interrupt** and let the main program idle.

### How the parts share one frame

The VIC-II raster counter (`$D012`) ticks from line 0 to line 311 every PAL frame. We program the VIC to fire an IRQ at a chosen line (`FIRSTBAR = $40`). When that IRQ fires, our handler runs *once per frame* and does, in order:

1. **Colour bars** — busy-wait the raster down the screen, slamming a new colour into `$D021`/`$D020` at each band boundary. This is the only part that must be cycle-aware, because it races the beam in real time.
2. **Logo colour cycle** — rewrite the 15 title characters' colour RAM entries with a rotating colour.
3. **Music** — call the player once (one "tick").
4. **Sprites** — recompute the three balls' X/Y from the sine table.
5. **Scroller** — advance the fine X-scroll and, every 8 pixels, hard-scroll the bottom row.

Steps 2–5 don't care exactly *where* the beam is; they just need to run once per frame, so we do them *after* the bar zone is finished. Step 1 is the only racing-the-beam part.

```
 line $00  ┌─ top border
 line $40  ├─ raster IRQ fires here ───────────► run handler
 line $46  │   ╮
   ...     │   │  bar busy-wait zone: write $D021 at each
 line $a0  │   ╯  barRaster boundary  (step 1)
 line $a0  │   then: logo / music / sprites / scroller (steps 2-5)
 line $137 └─ bottom border, frame ends, repeat
```

### The IRQ-driven structure

The classic "take over the machine" sequence (Part II 2.3):

- `SEI` to mask interrupts while we rewire vectors,
- point the KERNAL's RAM IRQ vector `$0314/$0315` at our handler,
- silence the CIA timer interrupts (`$DC0D`/`$DD0D`) so *only* the raster fires,
- enable the VIC raster IRQ (`$D01A` bit 0) and choose the line (`$D012`, plus the high bit in `$D011`),
- acknowledge any pending raster latch (`ASL $D019`),
- `CLI` and drop into `jmp *`.

One important banking note that bit us during development: we **leave the KERNAL ROM mapped in** (the default `$01 = $37`). The `$0314/$0315` vector is only consulted by the KERNAL's own IRQ dispatcher at `$FF48`. If you bank the KERNAL *out* (`$01 = $35`) the CPU jumps through the hardware vector at `$FFFE/$FFFF` instead, which now points at RAM — and your `$0314` handler never runs. Keeping the KERNAL in lets us also exit cleanly through `jmp $EA31` (the standard handler tail that restores registers and `RTI`s).

### The memory map

```
$0801  BASIC upstart stub  (10 SYS 2064)
$0810  init + IRQ handler + all subroutines + data tables
$0bb0  a handful of 1-byte state variables (barScroll, phases, etc.)
$0400  screen RAM   (title at row 12, scroller at row 24)
$07f8  sprite pointers (3 of the 8 used -> block $80)
$2000  the 64-byte "ball" sprite shape  (block $80 = $2000)
$d800  colour RAM
$d000  VIC-II registers
$d400  SID registers
```

Sprite data lives at `$2000` — well clear of our code at `$0810` and our screen at `$0400`. Sprite **block $80** is simply `$80 * $40 = $2000`, which is why the pointer byte we write into `$07f8` is `$80`.

---

## Building it

Each subsection below is an annotated excerpt. The one assembled, verified program follows in **The complete program** — these excerpts are taken verbatim from it.

### Stable raster + colourwash

The handler enters a few cycles into line `$40` (interrupt latency varies a little), so we burn a tiny, fixed delay to de-jitter the top edge of the first bar. Then we walk a table of raster line boundaries (`barRaster`), busy-waiting for the beam to reach each one and writing the next colour from `colTab` into both the background (`$D021`) and the border (`$D020`) so the bands span the whole width.

```asm
irq:
            // Stabilise: we entered a few cycles into the line. A tiny delay
            // de-jitters the first bar so the top edge is clean.
            ldx #$08
!wait:      dex
            bne !wait-

            // -------- 1. COLOURWASH: horizontal colour bars --------
            ldx barScroll        // frame-animated start index into the table
            ldy #0               // band counter
barLoop:
            lda barRaster,y
            cmp #$ff
            beq barsDone
            // Wait until the raster has REACHED (>=) this band line. Using
            // bcs (not bne) is robust: a plain '==' compare can miss the exact
            // value if the beam advances between our reads and hang the IRQ.
!rl:        cmp $d012
            bcs !rl-             // loop while target >= current raster
            lda colTab,x         // colour for this band
            sta $d021            // background
            sta $d020            // border (bars span the whole screen)
            inx
            txa
            and #$1f             // wrap the 32-entry colour table
            tax
            iny
            jmp barLoop
```

The single most important detail here — and a real bug we hit and fixed during the build — is the raster wait. The naive idiom `cmp $d012 / bne` waits for the beam to be at *exactly* that line. But between the `lda` of the target and the `cmp`, and across the several `sta`s per band, the beam keeps moving; it is easy to **miss the exact value**, in which case `bne` spins forever and the whole IRQ hangs (you get a black screen with nothing but the static logo). The fix is to wait for "beam has reached *or passed* the line" with `cmp $d012 / bcs` — `bcs` loops while `target >= raster`, so it can never miss, and if the line is already gone it falls straight through.

Animation is free: `barScroll` is incremented (mod 32) every frame and used as the starting index into `colTab`, so the whole colour ramp rolls vertically over time.

### The logo

`drawLogo` (called once at init) pokes the 15 screen codes of `C64 DEV LIBRARY` into the middle of row 12, centred by writing at column `(40-15)/2 ≈ 12`. The text is stored as **screen codes**, not PETSCII — e.g. `C` is `$03`, `6` is `$36`, space is `$20` — and `$ff` terminates the string.

```asm
            // -------- 2. LOGO colour cycle --------
            inc logoColDelay
            lda logoColDelay
            and #$03             // slow it down (every 4th frame)
            bne logoSkip
            inc logoCol
logoSkip:
            ldx #0
            lda logoCol
            and #$0f
            tax
            ldy #0
!cl:        lda logoColors,x     // bright cycling colour
            sta COLRAM + TITLEROW*40 + 12, y   // colour the 15 title chars
            iny
            cpy #15
            bne !cl-
```

The characters never change once drawn; only their **colour RAM** is rewritten each frame, stepping through a small `logoColors` table. We gate the advance with `logoColDelay & $03` so the colour changes every 4th frame rather than blindingly fast.

### The music player

A minimal table-driven SID player (Part IV 4.6). `initMusic` sets the global volume to max and programs voice 1's envelope once; `playMusic` is called every frame and steps a note table every ~8 frames, retriggering the gate on each new note.

```asm
initMusic:
            lda #$0f
            sta $d418            // master volume = max
            lda #$09
            sta $d405            // attack/decay
            lda #$00
            sta $d406            // sustain/release
            ...

playMusic:
            dec musicTimer
            bpl mDone            // only advance every ~8 frames
            lda #$08
            sta musicTimer
            ldx musicPos
            lda noteTab,x
            cmp #$ff
            bne mPlay
            ldx #0               // loop the tune
            stx musicPos
            lda noteTab
mPlay:
            tax                  // X = note index into freq table
            lda #$10             // triangle, gate OFF (retrigger)
            sta $d404
            lda freqLo,x
            sta $d400
            lda freqHi,x
            sta $d401
            lda #$11             // triangle waveform + gate ON
            sta $d404
            inc musicPos
mDone:
            rts
```

`noteTab` holds indices into two parallel frequency tables (`freqLo`/`freqHi`); `$ff` loops the tune. Each note we write `$10` (gate off) then `$11` (triangle + gate on) so the ADSR envelope retriggers — that "gate down then up" is what makes successive notes audible rather than one held tone.

Headless VICE produces no audio, so we verify the player by **reading SID registers back** after the program has been running (see *Running it*). The readback confirms `$D418=$0F`, `$D405=$09`, and the live `$D404=$11` (triangle + gate on).

### Sine sprites

Three sprites share one 256-entry sine table built at assemble time with KickAssembler's `.fill` and `sin()`:

```asm
sineTab:
            .fill 256, 110 + 70*sin(toRadians(i*360/256))
```

That single line evaluates the expression 256 times with `i = 0..255`, giving values centred on 110 with amplitude 70 — a range of roughly 40..180, which keeps the balls comfortably on the visible screen for both X and Y. `moveSprites` reads the table at a per-sprite phase for X and at double-rate for Y, so each ball traces a smooth bobbing path with the three offset from each other:

```asm
moveSprites:
            inc spritePhase
            ldx #0               // sprite index 0..2
msLoop:
            lda spritePhase
            clc
            adc sprXoff,x        // per-sprite X phase
            tay
            lda sineTab,y
            ldy sprXreg,x        // 0/2/4  -> $D000/$D002/$D004
            sta $d000,y          // sprite X

            lda spritePhase
            asl                  // double rate
            clc
            adc sprYoff,x        // per-sprite Y phase
            tay
            lda sineTab,y
            ldy sprYreg,x        // 1/3/5  -> $D001/$D003/$D005
            sta $d000,y          // sprite Y
            inx
            cpx #3
            bne msLoop
            rts
```

The `sprXreg`/`sprYreg` tables hold the VIC register *offsets* (0,2,4 and 1,3,5) so the same loop body services all three sprites by indexing `$d000,y`. All three sprites point at the same ball shape (`SPRPTR = $80`) but get distinct colours (yellow/light-red/light-blue) via `$D027`–`$D029`. We keep them under X=256, so `$D010` (the X high-bit register) stays clear.

### The scroller

The bottom text row (row 24) scrolls left smoothly using the VIC's **fine X-scroll** (`$D016` lower 3 bits) for the 0–7 pixel sub-steps, and a **hard scroll** — physically shifting the 40 characters of that row one cell left and pulling in the next message byte — every time the fine counter wraps from 0 back to 7.

```asm
doScroll:
            ldx scrollX
            dex
            bpl sx_ok
            ldx #7               // wrapped: do a hard scroll, reset fine to 7
            jsr hardScroll
sx_ok:
            stx scrollX
            lda $d016
            and #$f0             // clear fine-X bits AND the CSEL bit
            ora scrollX          // 0..7 fine scroll, 38-column mode
            sta $d016
            rts

hardScroll:
            ldx #0
!hs:        lda SCREEN + SCROLLROW*40 + 1, x
            sta SCREEN + SCROLLROW*40, x      // shift row left by one cell
            inx
            cpx #39
            bne !hs-
            ldy scrollPos                     // pull in next message char
            lda message,y
            cmp #$ff
            bne !ok+
            ldy #0                            // loop the message
            lda message
!ok:        sta SCREEN + SCROLLROW*40 + 39
            iny
            sty scrollPos
            rts
```

Note `and #$f0` clears both the fine-X bits *and* bit 3 (CSEL): bit 3 = 0 selects **38-column mode**, which narrows the visible window so characters slide in and out of view behind the border instead of popping at the screen edge. `message` is a screen-code string ending in `$ff` that loops forever.

---

## The complete program

This is the exact, verified intro. It assembles cleanly under KickAssembler v5.25, runs without jamming, and produces the screenshot described above (colour bands + the `C64 DEV LIBRARY` title + three sprite balls + the bottom scroller). Save it as `demo.asm`.

```asm
//============================================================================
// Part VII Capstone — "C64 DEV LIBRARY" intro  (PAL, KickAssembler v5.x)
//
// A classic single-part intro driven entirely by a stable raster IRQ:
//   * scrolling horizontal colour bars (colourwash on $D021)
//   * a centred, colour-cycled title          ("C64 DEV LIBRARY")
//   * a tiny table-driven SID player          (one note table, voice 1)
//   * three hardware sprites on a sine path    (bouncing balls)
//   * a fine-X scroller along the bottom row   ($D016 + hard scroll)
//
// All per-frame work lives in the IRQ. Main just sets things up and spins.
//============================================================================

            * = $0801 "Basic Upstart"
            // 10 SYS 2064  -> BASIC stub that runs our code at $0810
            .byte $0c,$08,$0a,$00,$9e,$32,$30,$36,$34,$00,$00,$00

//----------------------------------------------------------------------------
// Constants
//----------------------------------------------------------------------------
.const SCREEN   = $0400          // default screen RAM
.const COLRAM   = $d800          // colour RAM
.const SPRPTR   = $0400+$3f8     // sprite pointers (last 8 bytes of screen)

.const TITLEROW = 12             // logo on text row 12 (mid screen)
.const SCROLLROW= 24             // scroller on the bottom text row
.const FIRSTBAR = $40            // raster line where the colour bars start

//----------------------------------------------------------------------------
// Entry point — set everything up, then take over the IRQ
//----------------------------------------------------------------------------
            * = $0810 "Main"
init:
            sei                  // no interrupts while we re-wire the machine

            // We keep the KERNAL ROM mapped in (the default $01=$37) so the
            // CPU's hardware IRQ handler at $FF48 keeps reading our RAM vector
            // at $0314/$0315. (If you bank the KERNAL OUT with $01=$35 you must
            // instead point $FFFE/$FFFF at your handler — a later exercise.)

            jsr clearScreen      // blank screen, set colour RAM
            jsr drawLogo         // paint the centred title
            jsr initScroll       // prime the scroller text row
            jsr initSprites      // VIC sprite setup
            jsr initMusic        // SID voice/ADSR/volume

            // --- Install the raster IRQ (Part II 2.3) ---
            lda #<irq
            sta $0314
            lda #>irq
            sta $0315

            lda #$7f
            sta $dc0d            // disable CIA-1 timer IRQs
            sta $dd0d            // disable CIA-2 timer IRQs
            lda $dc0d            // ack any pending CIA IRQ
            lda $dd0d

            lda #$01
            sta $d01a            // enable VIC raster interrupt

            lda #FIRSTBAR
            sta $d012            // first IRQ at the top of the bar zone
            lda $d011
            and #$7f             // clear raster high bit (raster < 256)
            sta $d011

            asl $d019            // ack any pending raster IRQ
            cli                  // interrupts on — the IRQ now drives the intro
main:
            jmp *                // everything happens in the IRQ from here

//============================================================================
// THE RASTER IRQ  — runs once per frame at line FIRSTBAR
//============================================================================
irq:
            // Stabilise: we entered a few cycles into the line. A tiny delay
            // de-jitters the first bar so the top edge is clean.
            ldx #$08
!wait:      dex
            bne !wait-

            // -------- 1. COLOURWASH: horizontal colour bars --------
            // Walk a colour table and slam $D021 on successive raster bands.
            // 'barScroll' offsets the starting index each frame so bars roll.
            ldx barScroll        // frame-animated start index into the table
            ldy #0               // band counter
barLoop:
            // Wait until the raster reaches the next band boundary.
            lda barRaster,y
            cmp #$ff
            beq barsDone
            // Wait until the raster has REACHED (>=) this band line. Using
            // bcs (not bne) is robust: a plain '==' compare can miss the exact
            // value if the beam advances between our reads and hang the IRQ.
!rl:        cmp $d012
            bcs !rl-             // loop while target >= current raster
            lda colTab,x         // colour for this band
            sta $d021            // background
            sta $d020            // border (bars span the whole screen)
            inx
            txa
            and #$1f             // wrap the 32-entry colour table
            tax
            iny
            jmp barLoop
barsDone:
            // After the bar zone, restore a black backdrop for the rest of the
            // screen so the logo/sprites sit on a clean background below.
            lda #$00
            sta $d021
            sta $d020

            // Advance the colourwash one step next frame.
            inc barScroll
            lda barScroll
            and #$1f
            sta barScroll

            // -------- 2. LOGO colour cycle --------
            // Re-colour the title characters from a rotating colour each frame.
            inc logoColDelay
            lda logoColDelay
            and #$03             // slow it down (every 4th frame)
            bne logoSkip
            inc logoCol
logoSkip:
            ldx #0
            lda logoCol
            and #$0f
            tax
            ldy #0
!cl:        lda logoColors,x     // bright cycling colour
            sta COLRAM + TITLEROW*40 + 12, y   // colour the 15 title chars
            iny
            cpy #15
            bne !cl-

            // -------- 3. MUSIC: step the note table once per frame --------
            jsr playMusic

            // -------- 4. SPRITES: move balls along the sine path --------
            jsr moveSprites

            // -------- 5. SCROLLER: fine-X + hard scroll on bottom row -----
            jsr doScroll

            asl $d019            // ack the raster IRQ
            jmp $ea31            // KERNAL-style IRQ exit (restore regs, RTI)

//============================================================================
// SUBROUTINES
//============================================================================

//----------------------------------------------------------------------------
// clearScreen — fill screen with spaces, colour RAM with grey, set $D020/21
//----------------------------------------------------------------------------
clearScreen:
            lda #$00
            sta $d020
            sta $d021
            ldx #0
            lda #$20             // space
!sc:        sta SCREEN,      x
            sta SCREEN+$100, x
            sta SCREEN+$200, x
            sta SCREEN+$2e8, x
            inx
            bne !sc-
            ldx #0
            lda #$0b             // dark grey for colour RAM baseline
!cc:        sta COLRAM,      x
            sta COLRAM+$100, x
            sta COLRAM+$200, x
            sta COLRAM+$2e8, x
            inx
            bne !cc-
            rts

//----------------------------------------------------------------------------
// drawLogo — write the centred title into screen RAM at TITLEROW
//----------------------------------------------------------------------------
drawLogo:
            ldx #0
!dl:        lda titleText,x
            cmp #$ff
            beq !done+
            sta SCREEN + TITLEROW*40 + 12, x   // centred: (40-15)/2 ~= 12
            lda #$01                            // start white; cycled later
            sta COLRAM + TITLEROW*40 + 12, x
            inx
            jmp !dl-
!done:      rts

//----------------------------------------------------------------------------
// initScroll — copy the start of the message into the scroller row
//----------------------------------------------------------------------------
initScroll:
            ldx #0
!is:        lda #$20             // start with a blank row; doScroll fills it
            sta SCREEN + SCROLLROW*40, x
            lda #$0e             // light blue
            sta COLRAM + SCROLLROW*40, x
            inx
            cpx #40
            bne !is-
            rts

//----------------------------------------------------------------------------
// initSprites — three sprites as our "balls", multicolour off, expanded off
//----------------------------------------------------------------------------
initSprites:
            // Point sprites 0..2 at the ball shape at $2000 (block $80).
            lda #$80
            sta SPRPTR+0
            sta SPRPTR+1
            sta SPRPTR+2
            lda #$07
            sta $d015            // enable sprites 0,1,2
            lda #$00
            sta $d017            // no Y expand
            sta $d01d            // no X expand
            sta $d01c            // no multicolour (hi-res sprites)
            sta $d010            // X high bits clear (all X < 256)
            // Distinct ball colours.
            lda #$07
            sta $d027            // yellow
            lda #$0a
            sta $d028            // light red
            lda #$0e
            sta $d029            // light blue
            rts

//----------------------------------------------------------------------------
// moveSprites — three balls bouncing on the sine table (Part I tables)
//   Each sprite reads the sine table at its own phase; X advances linearly,
//   Y follows the sine -> classic bobbing motion.
//----------------------------------------------------------------------------
moveSprites:
            inc spritePhase      // global animation phase
            ldx #0               // sprite index 0..2
msLoop:
            // ---- X position: a sine sweep, phase-offset per sprite ----
            // index = spritePhase + sprXoff[x]  -> reuse sine for smooth bounce
            lda spritePhase
            clc
            adc sprXoff,x
            tay
            lda sineTab,y        // 40..180 range -> on-screen X
            ldy sprXreg,x        // register index 0/2/4
            sta $d000,y          // write sprite X

            // ---- Y position: sine indexed by (phase*2 + sprYoff[x]) ----
            lda spritePhase
            asl
            clc
            adc sprYoff,x
            tay
            lda sineTab,y        // 40..180 range -> on-screen Y
            ldy sprYreg,x        // register index 1/3/5
            sta $d000,y          // write sprite Y

            inx
            cpx #3
            bne msLoop
            rts

//----------------------------------------------------------------------------
// playMusic — minimal table-driven SID player (Part IV 4.6)
//   Sets volume + instrument once (initMusic), then steps a note table,
//   gating the voice on each new note.
//----------------------------------------------------------------------------
initMusic:
            lda #$0f
            sta $d418            // master volume = max
            // Voice 1 ADSR: a punchy lead.
            lda #$09
            sta $d405            // attack/decay
            lda #$00
            sta $d406            // sustain/release
            lda #$00
            sta musicTimer
            sta musicPos
            rts

playMusic:
            dec musicTimer
            bpl mDone            // only advance every musicSpeed frames
            lda #$08             // ~8 frames per note
            sta musicTimer

            ldx musicPos
            lda noteTab,x
            cmp #$ff
            bne mPlay
            ldx #0               // loop the tune
            stx musicPos
            lda noteTab
mPlay:
            tax                  // X = note index into freq table
            // gate off briefly so each note retriggers
            lda #$10             // triangle, gate off
            sta $d404
            lda freqLo,x
            sta $d400
            lda freqHi,x
            sta $d401
            lda #$11             // triangle waveform + gate ON
            sta $d404
            inc musicPos
mDone:
            rts

//----------------------------------------------------------------------------
// doScroll — fine X-scroll the bottom row, hard-scroll every 8 pixels
//   38-column mode hides the edges so characters appear/disappear cleanly.
//----------------------------------------------------------------------------
doScroll:
            ldx scrollX
            dex
            bpl sx_ok
            // wrapped past 0: do one hard scroll left and reset fine X to 7
            ldx #7
            jsr hardScroll
sx_ok:
            stx scrollX
            // write fine X into $D016 (lower 3 bits), keep 38-col (bit3=0)
            lda $d016
            and #$f0             // clear fine-X bits and CSEL
            ora scrollX          // 0..7 fine scroll
            sta $d016
            rts

// hardScroll — shift the visible row one char to the left, pull in next char
hardScroll:
            ldx #0
!hs:        lda SCREEN + SCROLLROW*40 + 1, x
            sta SCREEN + SCROLLROW*40, x
            inx
            cpx #39
            bne !hs-
            // fetch next message char into the rightmost column
            ldy scrollPos
            lda message,y
            cmp #$ff
            bne !ok+
            ldy #0               // loop the message
            lda message
!ok:        sta SCREEN + SCROLLROW*40 + 39
            iny
            sty scrollPos
            rts

//============================================================================
// DATA
//============================================================================

// ---- Title text (screen codes). $ff terminates. "C64 DEV LIBRARY" ----
titleText:
            .byte $03,$36,$34,$20,$04,$05,$16,$20
            .byte $0c,$09,$02,$12,$01,$12,$19,$ff   // C64 DEV LIBRARY

// ---- Scroller message (screen codes); $ff loops ----
message:
            // "HELLO FROM THE C64 DEV LIBRARY CAPSTONE ... "
            .byte $08,$05,$0c,$0c,$0f,$20            // HELLO
            .byte $06,$12,$0f,$0d,$20                // FROM
            .byte $14,$08,$05,$20                    // THE
            .byte $03,$36,$34,$20                    // C64
            .byte $04,$05,$16,$20                    // DEV
            .byte $0c,$09,$02,$12,$01,$12,$19,$20    // LIBRARY
            .byte $03,$01,$10,$13,$14,$0f,$0e,$05,$20 // CAPSTONE
            .byte $2e,$2e,$2e,$20,$20,$20,$20,$20    // ...
            .byte $ff

// ---- Colourwash table (32 entries) — a smooth-ish ramp of C64 colours ----
colTab:
            .byte $06,$06,$0e,$0e,$03,$03,$0d,$0d
            .byte $01,$01,$0d,$0d,$03,$03,$0e,$0e
            .byte $06,$06,$04,$04,$0a,$0a,$07,$07
            .byte $0a,$0a,$04,$04,$06,$06,$00,$00

// ---- Raster band boundaries for the bars; $ff ends the band loop ----
// One entry every 6 raster lines for ~12 bars from FIRSTBAR downward.
barRaster:
            .byte $46,$4c,$52,$58,$5e,$64,$6a,$70
            .byte $76,$7c,$82,$88,$8e,$94,$9a,$a0
            .byte $ff

// ---- Logo cycling colours (bright) ----
logoColors:
            .byte $01,$07,$0d,$0e,$03,$05,$0a,$0f
            .byte $01,$07,$0d,$0e,$03,$05,$0a,$0f

// ---- Sine table (256 entries), amplitude centred for sprite Y on screen ----
sineTab:
            .fill 256, 110 + 70*sin(toRadians(i*360/256))

// ---- Sprite per-index data ----
// X register offsets so balls spread out; XYreg map register indices.
sprXoff:    .byte $30,$70,$b0          // base X spread
sprYoff:    .byte $00,$55,$aa          // sine phase offsets
sprXreg:    .byte $00,$02,$04          // $D000,$D002,$D004 (X regs)
sprYreg:    .byte $01,$03,$05          // $D001,$D003,$D005 (Y regs)

// ---- Music: note indices into freq tables; $ff loops. (C-major-ish run) ----
noteTab:
            .byte $00,$02,$04,$05,$07,$05,$04,$02
            .byte $00,$04,$07,$04,$00,$02,$04,$07
            .byte $ff
// 8 note frequencies (PAL), index 0..7  (C D E F G A B C5 region)
freqLo:     .byte $25,$96,$1d,$8f,$2b,$11,$ee,$1d
freqHi:     .byte $11,$13,$16,$17,$1b,$1e,$21,$23

//----------------------------------------------------------------------------
// Zero-page-ish state (placed in RAM, not ZP — fine for our purposes)
//----------------------------------------------------------------------------
barScroll:     .byte 0
logoCol:       .byte 0
logoColDelay:  .byte 0
spritePhase:   .byte 0
musicTimer:    .byte 0
musicPos:      .byte 0
scrollX:       .byte 7
scrollPos:     .byte 0

//----------------------------------------------------------------------------
// Sprite shape — a filled "ball" (24x21). Block $80 => $2000.
//----------------------------------------------------------------------------
            * = $2000 "Sprite ball"
ballSprite:
            .byte $00,$7e,$00
            .byte $03,$ff,$c0
            .byte $07,$ff,$e0
            .byte $0f,$ff,$f0
            .byte $1f,$ff,$f8
            .byte $1f,$ff,$f8
            .byte $3f,$ff,$fc
            .byte $3f,$ff,$fc
            .byte $3f,$ff,$fc
            .byte $3f,$ff,$fc
            .byte $3f,$ff,$fc
            .byte $3f,$ff,$fc
            .byte $3f,$ff,$fc
            .byte $1f,$ff,$f8
            .byte $1f,$ff,$f8
            .byte $0f,$ff,$f0
            .byte $07,$ff,$e0
            .byte $03,$ff,$c0
            .byte $00,$7e,$00
            .byte $00,$00,$00
            .byte $00,$00,$00
            .byte $00
```

---

## Running it / extending it

**Assemble:**

```
tools/kickass demo.asm -o /tmp/out.prg
```

**Run it headless and grab a screenshot** (the intro runs forever, so we cap the cycle count):

```
python3 tools/vice_run.py run demo.asm --screenshot /tmp/shot.png
```

The JSON line reports `"jam": false`, and `/tmp/shot.png` shows the colour bands, the centred `C64 DEV LIBRARY` title, the three sprite balls, and the bottom scroller. On a real machine (or VICE with a display) just load the `.prg` and `RUN`.

**Verify the music**, which is silent under headless VICE, by reading the SID registers back after it has settled:

```
python3 tools/vice_run.py check demo.asm --port 6595 \
    --assert '$d418=$0f' --assert '$d404=$11' --assert '$d405=$09'
```

All three pass: `$D418=$0F` (volume), `$D404=$11` (voice 1 triangle + gate on, i.e. a note is actively playing), `$D405=$09` (attack/decay). (Note the assert parser treats a bare `11` as *decimal*; always write SID values as `$11` so they're read as hex.)

### A bug worth remembering

Two issues bit us while building this, both instructive:

1. **The raster wait must use `bcs`, not `bne`.** Waiting for an *exact* `$D012` value can miss and hang the entire IRQ — a black screen with only the static logo. Waiting for "beam has reached or passed the line" is robust.
2. **Don't bank out the KERNAL if you use the `$0314` vector.** The `$0314/$0315` vector is only honoured by the KERNAL's IRQ dispatcher; with the KERNAL banked out the CPU uses `$FFFE/$FFFF` and your handler never runs. We left `$01` at its default `$37`.

### Where to take it next

- **Two split IRQs:** one at the top for the bars, a second lower down dedicated to the scroller and sprite multiplexing, so each part gets a tighter cycle budget.
- **Sprite multiplexing:** reuse the 8 hardware sprites multiple times per frame to show many more balls.
- **A real tune:** swap the toy `noteTab` player for a SID file exported from GoatTracker, calling its `play` entry once per frame from the IRQ.
- **A logo from a custom charset:** point the VIC's character base at a redefined charset and build a multi-colour pixel logo instead of plain text.
- **Smooth bar edges:** replace the fixed `ldx #$08` stabiliser with a proper double-IRQ (cycle-exact) raster stabiliser for rock-steady bar tops.
