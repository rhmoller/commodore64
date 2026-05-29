# Appendix H — Cycle Timing Reference

All timing on the C64 derives from the VIC-II raster scan. The CPU (6510) and VIC-II
share one bus at the system clock ϕ2; the VIC steals cycles from the CPU whenever it
must fetch data. Cycle-exact effects (raster splits, FLI, sprite multiplexing, opening
borders) all depend on the numbers below.

## H.1 Per-System Frame Timing

| System (chip) | Cycles/line | Lines/frame | Total cycles/frame | Refresh (Hz) |
|---|---:|---:|---:|---:|
| PAL (6569) | 63 | 312 | 19656 | ~50.12 |
| NTSC (6567R8) | 65 | 263 | 17095 | ~59.83 |
| NTSC old (6567R56A) | 64 | 262 | 16768 | ~60.05 |

Notes:
- Total cycles/frame = cycles/line × lines/frame. These are the cycles available to
  the CPU **only on non-bad, sprite-free lines**; bad lines and sprite DMA subtract
  from the per-line budget (H.2, H.3).
- Refresh Hz is approximate; it derives from the dot clock divided by total dots per
  frame. PAL ≈ 50.12 Hz, NTSC ≈ 59.83 Hz (6567R8).
- "Eight pixels are displayed per bus clock cycle (ϕ2)" — so one CPU cycle == 8 horizontal
  pixels (H.4).
- Visible (displayable) area is smaller than the total raster; see H.5.

## H.2 Bad Lines

On the first pixel-row of every text line the VIC must fetch 40 character pointers
(c-accesses) plus the matching video matrix data. To do this it "stuns" the CPU and
takes the bus.

**Bad Line Condition** (all must hold, evaluated at the start of the cycle):
1. `RASTER` is in the range `$30`–`$F7` (48–247) inclusive.
2. The low 3 bits of `RASTER` equal `YSCROLL` — i.e. `(RASTER & 7) == (D011 & 7)`.
3. The DEN bit (`$D011` bit 4) was set at some point during line `$30` (48).

| Item | Value |
|---|---|
| First possible bad line | raster `$30` (48), when `YSCROLL == 0` |
| Last possible bad line | raster `$F7` (247) |
| YSCROLL register | `$D011` (53265), bits 0–2 |
| DEN (display enable) | `$D011` (53265), bit 4 |

**Cost of a bad line:** the VIC takes the bus for **40–43 cycles** (40 c-accesses plus
BA setup; the BA line goes low 3 cycles before the VIC fully owns the bus, which is the
max number of consecutive 6510 write accesses). On a 63-cycle PAL line this leaves the
CPU roughly **23 cycles** (vs. the full ~63 on a normal line). On NTSC the residue is
similarly small (~25 cycles).

| Line type (PAL, 63 cyc) | VIC-stolen cycles | CPU cycles remaining |
|---|---:|---:|
| Normal line, no sprites | 0 | ~63 |
| Bad line, no sprites | ~40 | ~23 |

To suppress a bad line on a chosen row (e.g. for stable raster code) change `YSCROLL`
so condition 2 no longer matches before the VIC tests it. To force extra bad lines
(FLI) repeatedly change `YSCROLL` so condition 2 matches on consecutive lines.

## H.3 Sprite DMA Cost

For each **enabled** sprite the VIC fetches, per raster line on which the sprite is
displayed:
- **1 p-access** (sprite data pointer read) — 1 cycle.
- **3 s-accesses** (the 3 bytes = 24 pixels of one sprite line), performed in the three
  half-cycles immediately after that sprite's p-access — ~2 cycles.

Effective bus theft is therefore about **2 cycles per active sprite per line** (the
p-access overlaps idle bus time; the 3 s-accesses dominate). The classic figure is
**2 cycles/sprite**, with the p-access making the worst case slightly higher when many
sprites are back-to-back.

| Active sprites on a line | Approx. cycles stolen (PAL) | CPU cycles remaining (non-bad line) |
|---:|---:|---:|
| 0 | 0 | ~63 |
| 1 | ~2 | ~61 |
| 4 | ~8 | ~55 |
| 8 | ~16 | ~47 |

A line that is **both** a bad line **and** has 8 sprites is the worst case: ~40 (bad) +
~16 (sprites) stolen, leaving only a handful of CPU cycles. Sprite fetches occur near
the end / start of the line (sprites 7–4 then 3–0), so they reduce the budget on the
specific lines those sprites overlap, not the whole frame.

Sprite enable register: `$D015` (53269), one bit per sprite. A sprite costs cycles only
on the lines where its Y position causes it to be displayed (DMA active).

## H.4 Counting Cycles to a Known X Position

Because the VIC outputs **8 pixels per ϕ2 cycle**, the horizontal position of any store
to a VIC register is determined purely by how many CPU cycles have elapsed since the
start of the raster line. Each elapsed cycle advances the beam 8 pixels.

Technique to land a register write at a target X:
1. Trigger on a raster compare (H.5) so you have a known starting cycle.
2. Pad with instructions of known cycle count (see H.6) until the cycle just before the
   target. `NOP` = 2 cycles (16 px), `BIT $xx` = 3 cycles (24 px), etc.
3. The `STA`/`STX`/`STY abs` that updates the register takes effect on its final cycle;
   the visible change appears 8 px per intervening cycle later.

KickAssembler example — wait a fixed number of cycles then change border colour:

```asm
        // assume we just acknowledged a raster IRQ
        ldx #$05        // 2 cycles
        dex             // 2
        bne *-1         // 3 taken / 2 not taken  -> tunable busy-wait
        nop             // 2  (8 px of fine adjust)
        nop             // 2
        lda #BLACK      // 2
        sta $d020       // 4 -> change lands here, at a fixed X
```

Use single `nop`s (and a `bit`/`cmp #imm` pair) to trim the last 1–8 pixels of slack.
Bad lines and sprites on the same line add jitter, so account for their stolen cycles
(H.2, H.3) when timing splits.

## H.5 Raster Compare, Visible vs Total Lines

The raster line counter is a 9-bit value:
- `$D012` (53266) — low 8 bits of the current/compare raster line.
- `$D011` (53265) **bit 7** (RST8) — bit 8 of the raster line (read = current MSB,
  write = compare MSB).

To compare against line `N`: write `N & $FF` to `$D012`, and set/clear bit 7 of
`$D011` to `(N >> 8) & 1`. The raster IRQ fires when the beam reaches the compared line
(enable via `$D01A` bit 0; acknowledge via `$D019`).

```asm
        lda #<rasterLine
        sta $d012
        lda $d011
        and #$7f
        ora #(>rasterLine) << 7   // set RST8 from bit 8 of rasterLine
        sta $d011
```

Total vs visible geometry (visible = not in vertical/horizontal blanking):

| System | Total lines | Visible lines | Visible pixels/line |
|---|---:|---:|---:|
| PAL (6569) | 312 | 284 | 403 |
| NTSC (6567R8) | 263 | 235 | 418 |
| NTSC (6567R56A) | 262 | 234 | 411 |

The DMA "display window" (where the 40×25 text area can appear) sits well inside the
visible area; the rest is border. Raster values `$30`–`$F7` (the bad-line range)
correspond to the rows where the video matrix is fetched.

## H.6 Instruction Timing Rules (recap)

These determine the cycle padding in H.4. Full per-opcode counts are in **Appendix A**;
the timing modifiers are:

| Rule | Effect | Applies to |
|---|---|---|
| Page crossing on indexed **read** | **+1 cycle** | `abs,X` / `abs,Y` / `(zp),Y` reads when the effective address crosses a 256-byte page |
| Indexed **write** / RMW | always max count | `STA abs,X` etc. always pay the extra cycle regardless of crossing |
| Branch **taken** | **+1 cycle** | all conditional branches when the branch is taken |
| Branch to **another page** | **+1 more cycle** | when the taken branch target is on a different 256-byte page |
| Branch **not taken** | base 2 cycles | conditional branches that fall through |

Handy fixed-length padders for cycle-exact code:

| Mnemonic | Cycles | Pixels | Note |
|---|---:|---:|---|
| `NOP` | 2 | 16 | does nothing |
| `BIT $xx` (zp) | 3 | 24 | dummy read, sets flags |
| `BIT $xxxx` (abs) | 4 | 32 | dummy read |
| `NOP $xx` (illegal DOP zp) | 3 | 24 | KickAss: `.byte $44,$xx` |
| `NOP $xxxx` (illegal TOP abs) | 4 | 32 | KickAss: `.byte $0c,$xx,$xx` |

To avoid page-cross jitter in timing-critical loops, align tables and branch targets so
indexed reads and taken branches do not cross a page boundary (see Appendix A for the
opcode-by-opcode base cycle counts).

## Sources

- Christian Bauer, "The MOS 6567/6569 video controller (VIC-II) and its application in
  the Commodore 64": https://www.cebix.net/VIC-Article.txt
- Dustlayer, "VIC-II for Beginners" series (bad lines / cycle budget):
  https://dustlayer.com/vic-ii
- c64os.com, "VIC-II and FLI Timing (1/3)": https://c64os.com/post/flitiming1
