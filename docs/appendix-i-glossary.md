# Appendix I — Glossary

Reference-grade definitions of the terms used throughout this guide. Addresses
are given in hex and decimal. Cross-references point to other appendices (A–H)
and the chip pages ([cpu-6510.md](cpu-6510.md), [vic-ii.md](vic-ii.md),
[sid.md](sid.md), [demoscene-effects.md](demoscene-effects.md),
[game-dev-patterns.md](game-dev-patterns.md)).

## A

**ADSR** — *Attack / Decay / Sustain / Release*, the four-stage amplitude
envelope of each SID voice. Set via registers `+5` (attack hi-nybble / decay
lo-nybble) and `+6` (sustain hi-nybble / release lo-nybble) per voice; 16 attack
rates (2 ms–8 s), 16 decay/release rates (6 ms–24 s), 16 linear sustain levels.
Started by setting the gate bit, released by clearing it. See *hard restart*,
[sid.md](sid.md), Appendix D.

**AGSP** — *Any Given Screen Position*, a scroll technique combining **VSP**
(Variable Screen Position) with a line-cruncher to move the displayed screen RAM
to an arbitrary X (and Y) position in far fewer rasterlines than a hardware
hard-scroll. Exploits a cycle-precise quirk of `$D011` (53265); does **not** work
on every VIC-II revision and can crash some machines. Used for full-screen
scrolling bitmap games. See [demoscene-effects.md](demoscene-effects.md).

## B

**Badline** (bad line) — a scanline on which the VIC-II must fetch 40 character
pointers + color nybbles, stalling the CPU for ~40–43 of the line's cycles. The
Bad Line Condition: at the negative edge of φ0 within `$30 ≤ RASTER ≤ $F7`, the
low three RASTER bits equal the vertical scroll value (`$D011` bits 0–2), and DEN
was set on line `$30`. Normally occurs every 8th display row. Can be forced
(*FLI*) or suppressed (*FLD*) by writing YSCROLL. See Appendix H,
[vic-ii.md](vic-ii.md).

**Bitmap mode** — VIC-II display mode (set BMM, `$D011`/53265 bit 5) where each
pixel is individually addressable: 320×200 hires (1 bpp, 8 KB) or, with MCM in
`$D016` (53270), 160×200 multicolor (2 bpp, 4 colors per 8×8 cell). Contrast
*text/char mode*. See [vic-ii.md](vic-ii.md), Appendix C.

## C

**Char RAM / charset / character base** — the 2 KB (256 × 8 bytes) table of 8×8
glyph bitmaps the VIC indexes in text mode; located at a bank offset chosen by
`$D018` (53272) bits 1–3, or use the Character ROM. See *screen RAM*, *color RAM*.

**Screen RAM (video matrix)** — the 1000-byte grid of character pointers (text
mode) or color cells; default `$0400–$07E7` (1024–2023), base selected by `$D018`
bits 4–7 within the VIC bank. Sprite pointers sit at screen base + `$3F8` (1016).

**Color RAM** — 1000 × 4-bit nybbles fixed at `$D800` (55296) regardless of VIC
bank; holds the per-cell foreground color (text mode) or the `11` bit-pair color
(multicolor bitmap). See Appendix B/C, [vic-ii.md](vic-ii.md).

**CIA** — *Complex Interface Adapter*, MOS 6526. The C64 has two: **CIA1** at
`$DC00` (56320) handles keyboard matrix, joysticks and the timer that fires the
system IRQ; **CIA2** at `$DD00` (56576) handles the serial bus, user port, NMI,
and selects the VIC bank (low 2 bits, inverted). Each has two 16-bit timers, a
TOD clock, and a shift register. See Appendix E, [cpu-6510.md](cpu-6510.md).

**Combined waveform** — selecting more than one SID waveform bit (triangle,
sawtooth, pulse, noise) in control register `+4` simultaneously; the oscillator
outputs are ANDed/interact in the analog domain, producing characteristic gritty
timbres. Behaves differently (and louder) on the 6581 than the 8580. See
[sid.md](sid.md), Appendix D.

**Cycle** — one CPU clock tick; ~0.985 µs on PAL (0.985 MHz), ~0.978 µs on NTSC
(1.023 MHz). The VIC-II emits 8 pixels per cycle, so cycle counting equals
horizontal pixel positioning. A PAL rasterline is 63 cycles; a frame ≈ 19,656
cycles. See *raster line*, Appendix A/H.

## D

**DYPP / DYCP** — *Different Y-Position Per Pixel* / *...Per Char*: a scroller
where each pixel-column or character has its own vertical offset taken from a sine
table, giving the wavy/bouncing text of classic intros. "All-border DYPP"
combines this with opened borders. See [demoscene-effects.md](demoscene-effects.md).

## F

**FLD** — *Flexible Line Distance*: **suppress** bad lines by keeping YSCROLL
(`$D011` bits 0–2) different from the current raster's low 3 bits, so the VIC
never fetches new character data and screen content can be pushed down
arbitrarily. Used for screen-open/bounce and vertical tricks. Opposite of *FLI*.
See [demoscene-effects.md](demoscene-effects.md), Appendix H.

**FLI** — *Flexible Line Interpretation*: **force** a bad line on every scanline
(rewrite YSCROLL each line) so `$D018` (53272) can be changed per line, giving
per-scanline color in bitmap mode and escaping the one-color-per-cell limit for
near-photographic images. Consumes nearly the whole line's CPU; has a left-edge
"FLI bug" artifact and requires a stable raster. See [demoscene-effects.md](demoscene-effects.md).

## H

**Hard restart** — a driver technique to defeat the 6581 ADSR bug: gate the voice
off and reset the envelope (via the test bit / known ADSR values) for ~2 frames
before each new note, so the envelope starts cleanly. Standard in SID players;
the reason you drive music with a routine rather than raw pokes. See *ADSR*,
[sid.md](sid.md).

## I

**Illegal opcode** (undocumented/unintended opcode) — an NMOS 6510 instruction
not in the official set that falls out of the silicon's decoding; ~25 are stable
(`LAX`, `SAX`, `DCP`, `ISC`, `SLO`, `RLA`, `ANC`, `ALR`, `ARR`, …) and combine two
operations in one instruction, prized for speedcode and size-coding. Some
(`SHX/SHY/SHA/TAS`) are unstable. See Appendix A, [cpu-6510.md](cpu-6510.md).

**IRQ / NMI** — the 6510 interrupts. **IRQ** (maskable, `SEI`/`CLI`) vectors
through `$FFFE/F` (RAM vector `$0314/5`, 788/789); default source is CIA1 timer A
(~50/60 Hz), commonly redirected to a VIC *raster interrupt*. **NMI**
(non-maskable) vectors through `$FFFA/B` (RAM vector `$0318/9`, 792/793); source
is CIA2 / RESTORE key / RS-232. Acknowledge the source or the interrupt re-fires:
VIC by writing `$D019` (53273), CIA by reading `$DC0D`/`$DD0D`. See Appendix
B/E, [cpu-6510.md](cpu-6510.md).

## J

**Jiffy** — one tick of the KERNAL's software clock `TI`/`TI$`, stored big-endian
at `$A0–$A2` (160–162) and incremented by the KERNAL `UDTIM` routine in the
system IRQ. Nominally 1/60 second; the count is kept on both PAL and NTSC even
though the IRQ itself fires ~50 Hz on PAL. See [cpu-6510.md](cpu-6510.md).

## K

**KERNAL** — the C64's 8 KB operating-system ROM at `$E000–$FFFF` (57344–65535),
reached through a stable jump table at `$FF81–$FFF3`: e.g. `CHROUT` `$FFD2`
(65490), `GETIN` `$FFE4` (65508), `LOAD` `$FFD5` (65493). Bank it out via `$01`
(processor port) to reclaim the RAM underneath. See Appendix F,
[cpu-6510.md](cpu-6510.md).

## L

**LUT** — *Look-Up Table*: precomputed values (sine/cosine, multiply, screen-row
addresses `$0400 + row*40`, color ramps) stored in memory and indexed at runtime
to replace expensive math the 6502 cannot do directly. The backbone of plasmas,
rotozoomers and fast game logic. KickAssembler can generate them at assemble time:

```asm
.fill 256, round(127.5 + 127.5 * sin(toRadians(i*360/256)))   // 8-bit sine LUT
```

See [demoscene-effects.md](demoscene-effects.md), [game-dev-patterns.md](game-dev-patterns.md).

## M

**MOB / sprite** — *Movable Object Block*, the VIC-II's 8 hardware sprites. Each
is 24×21 pixels (12×21 logical in multicolor), positioned by 9-bit X (the 9th bit
in `$D010`/53264) and 8-bit Y, individually colorable, X/Y expandable, and
priority-ranked vs the background. 63 bytes of data per sprite, addressed by the
pointer at screen base + `$3F8`. See *multiplexer*, *sprite stretching*, Appendix
C, [vic-ii.md](vic-ii.md).

**Multicolor mode** — VIC mode trading horizontal resolution for color: in text/
bitmap it uses 2 bits/pixel (4 colors per cell) at half X-resolution; for sprites
it gives two shared colors (`$D025/$D026`, 53285/53286) plus one private color.
Enabled by MCM in `$D016` (53270) or per-sprite in `$D01C` (53276). See
[vic-ii.md](vic-ii.md).

**Multiplexer** — software that reuses the 8 hardware sprites down the screen:
sort active objects by Y, then in raster IRQs reposition and re-point a sprite
after it has finished displaying, showing many objects (~16–24+) per frame. Core
of sprite-heavy games and "100 sprites" demos. See [game-dev-patterns.md](game-dev-patterns.md).

## N

**NTSC / PAL** — the two TV standards the C64 targets. **PAL** (6569 VIC): 312
rasterlines × 63 cycles/line, ~50 Hz, ≈19,656 cycles/frame, CPU 0.985 MHz —
this guide's default. **NTSC** (6567): 262/263 lines × 64/65 cycles, ~60 Hz, CPU
1.023 MHz. Affects frame budget, music tempo, and raster timing. See *sync*,
Appendix H, [cpu-6510.md](cpu-6510.md).

## P

**PETSCII** — Commodore's character encoding (a PET-derived ASCII variant)
including graphics characters and control codes used by BASIC/KERNAL for I/O.
Distinct from **screen codes**, the values actually stored in screen RAM that
index the charset. See Appendix G.

**PRG** — the standard C64 program file format: a 2-byte little-endian load
address followed by the raw bytes. `LOAD"file",8,1` honors that address; KickAss
emits `.prg` and a matching VICE symbol/label file. See [toolchain.md](toolchain.md).

## R

**Raster interrupt** — an IRQ asserted by the VIC-II when the raster beam reaches
a chosen scanline. Enable with `$D01A` (53274) bit 0, set the compare line in
`$D012` (53266) plus the high bit in `$D011` bit 7, and acknowledge by writing
`$D019` (53273). The foundation of split screens, multiplexing and every per-line
effect. See *stable raster*, [vic-ii.md](vic-ii.md), Appendix C/H.

**Raster line** (scanline) — one horizontal scan of the video beam. PAL has 312
(0–311) at 63 cycles each; NTSC 262/263 at 64/65. The current line is read from
`$D012` (+ `$D011` bit 7 for the 9th bit); writing it sets the IRQ compare. See
*cycle*, *badline*, Appendix H.

**REU** — *RAM Expansion Unit* (1700/1764/1750), an external cartridge adding
128 KB–512 KB of RAM accessed through a DMA controller (the REC at `$DF00`/57088)
that block-copies between main RAM and expansion RAM far faster than the CPU.
Used for big assets, fast screen swaps and storage-heavy demos. *(Optional
hardware; not present on a stock C64.)*

**Ring modulation** — SID modifier (control bit 2, register `+4`) that multiplies
a voice's triangle output with the previous voice's oscillator, producing
metallic/bell timbres. Requires the triangle waveform selected. See *sync*,
[sid.md](sid.md), Appendix D.

## S

**Speedcode** — fully unrolled, loop-free machine code generated (often at
assemble time) to hit a tight cycle budget; trades memory for speed. Common for
per-line raster work, bob/blitter inner loops and FLI. See *cycle*,
[cpu-6510.md](cpu-6510.md).

**Sprite stretching** — preventing a sprite's internal line counter from
advancing (via well-timed register writes each line) so its 21 pixel-rows repeat,
stretching it vertically across much of the screen; used for big logos and
sprite-stretch bars. See *MOB/sprite*, [demoscene-effects.md](demoscene-effects.md).

**Stable raster** — a raster interrupt handler from which the 0–7 cycle IRQ jitter
(the wait for the current instruction to finish) has been removed, so register
writes land at an exact cycle/pixel every frame. The classic method is the
**double-IRQ** technique (a second IRQ one line later plus a NOP-timed wait).
Required for FLI, split modes and opening the borders. See *raster interrupt*,
[vic-ii.md](vic-ii.md), Appendix H.

**Sync** (oscillator sync / hard sync) — SID modifier (control bit 1, register
`+4`) that hard-syncs a voice's oscillator to the previous voice's, resetting its
phase and producing tearing/buzzy leads. Not to be confused with horizontal/
vertical video *sync* in the PAL/NTSC signal. See *ring modulation*,
[sid.md](sid.md), Appendix D.

## V

**VIC bank** — the 16 KB window the VIC-II can see at a time, selected by the
*inverted* low 2 bits of CIA2 `$DD00` (56576): `%11`→bank 0 `$0000`, `%10`→bank 1
`$4000`, `%01`→bank 2 `$8000`, `%00`→bank 3 `$C000`. Screen/charset/bitmap bases
(`$D018`) are offsets *within* the chosen bank; color RAM stays at `$D800`. See
[vic-ii.md](vic-ii.md), Appendix C/E.

## Z

**Zero page** — memory page `$0000–$00FF` (0–255). Instructions addressing it are
shorter and faster (2 bytes/3 cycles vs 3/4), and it is the only place 16-bit
pointers for indirect-indexed `(zp),Y` addressing can live. `$00/$01` are the
6510 I/O/banking port; the rest is shared with BASIC (`$02–$8F`) and KERNAL
(`$90–$FF`) unless those ROMs are banked out. See Appendix B,
[cpu-6510.md](cpu-6510.md).

## Sources

- https://www.cebix.net/VIC-Article.txt
- http://archive.6502.org/datasheets/mos_6567_vic_ii_preliminary.pdf
- http://archive.6502.org/datasheets/mos_6581_sid.pdf
- https://www.zimmers.net/anonftp/pub/cbm/maps/C64.MemoryMap.txt
- http://codebase.c64.org/doku.php?id=base:agsp_any_given_screen_position
- https://www.c64-wiki.com/wiki/VSP
- https://www.c64-wiki.com/wiki/Jiffy_Clock
- https://www.c64-wiki.com/wiki/TIME
- https://www.c64-wiki.com/wiki/SID-register
- https://www.c64-wiki.com/wiki/Raster_interrupt
- https://www.c64-wiki.com/wiki/VIC_bank
- https://www.c64-wiki.com/wiki/REU
- https://www.masswerk.at/6502/6502_instruction_set.html
- http://www.oxyron.de/html/opcodes02.html
