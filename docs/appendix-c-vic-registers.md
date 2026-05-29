# Appendix C — VIC-II Register Reference ($D000–$D02E)

The VIC-II (6567 NTSC / 6569 PAL) exposes its registers starting at base **$D000 (53248)**. The chip occupies $D000–$D3FF, but only $D000–$D02E hold real registers; $D02F–$D03F read back as $FF and the whole block is mirrored every $40 bytes up to $D3FF. Unconnected ("–") bits read as 1.

## Register Map

| Hex | Dec | Name | Meaning |
|------|-------|------|---------|
| $D000 | 53248 | M0X | Sprite 0 X coordinate (bits 0–7; bit 8 in $D010) |
| $D001 | 53249 | M0Y | Sprite 0 Y coordinate |
| $D002 | 53250 | M1X | Sprite 1 X coordinate |
| $D003 | 53251 | M1Y | Sprite 1 Y coordinate |
| $D004 | 53252 | M2X | Sprite 2 X coordinate |
| $D005 | 53253 | M2Y | Sprite 2 Y coordinate |
| $D006 | 53254 | M3X | Sprite 3 X coordinate |
| $D007 | 53255 | M3Y | Sprite 3 Y coordinate |
| $D008 | 53256 | M4X | Sprite 4 X coordinate |
| $D009 | 53257 | M4Y | Sprite 4 Y coordinate |
| $D00A | 53258 | M5X | Sprite 5 X coordinate |
| $D00B | 53259 | M5Y | Sprite 5 Y coordinate |
| $D00C | 53260 | M6X | Sprite 6 X coordinate |
| $D00D | 53261 | M6Y | Sprite 6 Y coordinate |
| $D00E | 53262 | M7X | Sprite 7 X coordinate |
| $D00F | 53263 | M7Y | Sprite 7 Y coordinate |
| $D010 | 53264 | MSB X | Bit n = X coordinate bit 8 (MSB) of sprite n |
| $D011 | 53265 | Control Reg 1 | RST8 / ECM / BMM / DEN / RSEL / YSCROLL (see breakdown) |
| $D012 | 53266 | RASTER | Read: current raster line (low 8 bits). Write: raster line for compare IRQ. Bit 8 = $D011 bit 7 |
| $D013 | 53267 | LPX | Light pen X (latched, X/2 resolution) |
| $D014 | 53268 | LPY | Light pen Y (latched raster line) |
| $D015 | 53269 | Sprite Enable | Bit n = 1 enables (displays) sprite n |
| $D016 | 53270 | Control Reg 2 | MCM / CSEL / XSCROLL (see breakdown) |
| $D017 | 53271 | Sprite Y Expand | Bit n = 1 stretches sprite n to double height |
| $D018 | 53272 | Memory Pointers | VM13–VM10 video-matrix base / CB13–CB11 char/bitmap base (see breakdown) |
| $D019 | 53273 | IRQ Latch | Pending interrupt flags (see breakdown). Write 1 to a bit to clear it |
| $D01A | 53274 | IRQ Enable | Interrupt mask (see breakdown). Bit set = that source may assert IRQ |
| $D01B | 53275 | Sprite Priority | Bit n: 0 = sprite n in front of foreground gfx, 1 = behind |
| $D01C | 53276 | Sprite Multicolor | Bit n = 1 puts sprite n in multicolor mode |
| $D01D | 53277 | Sprite X Expand | Bit n = 1 stretches sprite n to double width |
| $D01E | 53278 | Sprite-Sprite Coll. | Bit n = 1: sprite n collided with another sprite. Read-only, cleared on read |
| $D01F | 53279 | Sprite-Data Coll. | Bit n = 1: sprite n collided with foreground gfx. Read-only, cleared on read |
| $D020 | 53280 | Border Color (EC) | Border color, low 4 bits |
| $D021 | 53281 | Background 0 (B0C) | Screen background color 0, low 4 bits |
| $D022 | 53282 | Background 1 (B1C) | Background color 1 (MCM text / ECM), low 4 bits |
| $D023 | 53283 | Background 2 (B2C) | Background color 2 (MCM text / ECM), low 4 bits |
| $D024 | 53284 | Background 3 (B3C) | Background color 3 (ECM), low 4 bits |
| $D025 | 53285 | Sprite Multicolor 0 (MM0) | Shared sprite multicolor 0, low 4 bits |
| $D026 | 53286 | Sprite Multicolor 1 (MM1) | Shared sprite multicolor 1, low 4 bits |
| $D027 | 53287 | M0C | Sprite 0 color, low 4 bits |
| $D028 | 53288 | M1C | Sprite 1 color, low 4 bits |
| $D029 | 53289 | M2C | Sprite 2 color, low 4 bits |
| $D02A | 53290 | M3C | Sprite 3 color, low 4 bits |
| $D02B | 53291 | M4C | Sprite 4 color, low 4 bits |
| $D02C | 53292 | M5C | Sprite 5 color, low 4 bits |
| $D02D | 53293 | M6C | Sprite 6 color, low 4 bits |
| $D02E | 53294 | M7C | Sprite 7 color, low 4 bits |

All color registers ($D020–$D02E) use only the low nibble (0–15); the high nibble reads back as 1s.

## $D011 — Control Register 1 (53265)

| Bit | Name | Meaning |
|-----|------|---------|
| 7 | RST8 | Raster compare bit 8 (combines with $D012 to form a 9-bit raster value) |
| 6 | ECM | Extended Color Mode (1 = on) |
| 5 | BMM | Bitmap Mode (1 = bitmap, 0 = text) |
| 4 | DEN | Display Enable (1 = screen on; 0 = blanked to border color). Badlines only occur when DEN=1 |
| 3 | RSEL | Row select: 1 = 25 rows (default), 0 = 24 rows |
| 2–0 | YSCROLL | Vertical fine scroll, 0–7 pixels. Default $1B → YSCROLL=3 |

Reset value: $1B (RST8=0, ECM=0, BMM=0, DEN=1, RSEL=1, YSCROLL=3).

## $D016 — Control Register 2 (53270)

| Bit | Name | Meaning |
|-----|------|---------|
| 7–6 | – | Unconnected, read as 1 |
| 5 | RES | No function on 6567/6569 (reset/test bit, leave 0) |
| 4 | MCM | Multicolor Mode (1 = on) |
| 3 | CSEL | Column select: 1 = 40 columns (default), 0 = 38 columns |
| 2–0 | XSCROLL | Horizontal fine scroll, 0–7 pixels |

Reset value: $C8 (bits 7–6 = 1, MCM=0, CSEL=1, XSCROLL=0).

### Display mode selection (ECM/BMM/MCM)

| ECM | BMM | MCM | Mode |
|-----|-----|-----|------|
| 0 | 0 | 0 | Standard text |
| 0 | 0 | 1 | Multicolor text |
| 0 | 1 | 0 | Standard bitmap |
| 0 | 1 | 1 | Multicolor bitmap |
| 1 | 0 | 0 | Extended background color (ECM) text |
| 1 | x | x | Other combinations are "invalid" (black screen) |

## $D018 — Memory Pointers (53272)

| Bit | Name | Meaning |
|-----|------|---------|
| 7 | VM13 | Video-matrix base bit 13 |
| 6 | VM12 | Video-matrix base bit 12 |
| 5 | VM11 | Video-matrix base bit 11 |
| 4 | VM10 | Video-matrix base bit 10 |
| 3 | CB13 | Char/bitmap base bit 13 |
| 2 | CB12 | Char base bit 12 (ignored in bitmap mode) |
| 1 | CB11 | Char base bit 11 (ignored in bitmap mode) |
| 0 | – | Unconnected, reads as 1 |

All addresses are **relative to the current 16K VIC bank** (selected by CIA-2 $DD00 bits 1–0). The VIC always sees a 16K window; add the bank base to get the CPU address.

### $D018 Layout — Worked Example

**Video matrix (screen RAM)** base = VM13–VM10 × $0400 (1024). With VM = %0001 → base $0400 + bank base. In the default bank 0, that is $0400 (the KERNAL default screen).

**Character generator** base (text modes) = CB13–CB11 × $0800 (2048). CB = %010 → $1000; in bank 0 this maps to the character ROM image at $1000/$1800 (the only two CB values that see char ROM in banks 0/2).

**Bitmap** base (bitmap modes) = CB13 × $2000 (8192); CB12/CB11 ignored. CB13=0 → $0000, CB13=1 → $2000.

Common default: $D018 = $15 → VM=%0001 (screen at $0400), CB=%010 (chars at $1000 = char ROM).

```kickass
// Bank 0 ($0000-$3FFF): screen at $0400, bitmap at $2000
lda #%00011000      // VM10..VM13 = %0001 -> $0400 ; CB13 = 1 -> $2000
sta $d018
//  bit7-4 = %0001 (screen $0400), bit3-1 = %100 (CB13=1 -> bitmap $2000)
```

Quick reference within a bank:

| VM13–VM10 | Screen base | | CB13–CB11 | Char base (text) | Bitmap base |
|-----------|-------------|-|-----------|------------------|-------------|
| %0000 | $0000 | | %000 | $0000 | $0000 |
| %0001 | $0400 | | %001 | $0800 | $0000 |
| %0010 | $0800 | | %010 | $1000 | $0000 |
| %0100 | $1000 | | %011 | $1800 | $0000 |
| %1000 | $2000 | | %100 | $2000 | $2000 |
| %1100 | $3000 | | %110 | $3000 | $2000 |
| %1111 | $3C00 | | %111 | $3800 | $2000 |

## $D019 — Interrupt Latch (53273)

| Bit | Name | Source |
|-----|------|--------|
| 7 | IRQ | 1 = at least one enabled source is pending (mirrors the CPU /IRQ line) |
| 6–4 | – | Unused, read as 1 |
| 3 | ILP | Light pen triggered |
| 2 | IMMC | Sprite–sprite collision occurred |
| 1 | IMBC | Sprite–background (data) collision occurred |
| 0 | IRST | Raster line compare matched ($D012/RST8) |

Acknowledge by writing a 1 to the bit(s) you want to clear (e.g. `lda #$01 / sta $d019` to clear a raster IRQ). Bit 7 clears automatically when all pending sources are cleared.

## $D01A — Interrupt Enable (53274)

| Bit | Name | Enables |
|-----|------|---------|
| 7–4 | – | Unused, read as 1 |
| 3 | ELP | Light pen IRQ |
| 2 | EMMC | Sprite–sprite collision IRQ |
| 1 | EMBC | Sprite–background collision IRQ |
| 0 | ERST | Raster compare IRQ |

A source sets its $D019 flag regardless of the mask, but only asserts the CPU IRQ line if its $D01A bit is 1.

## The 16-Color Palette (Pepto)

Indices 0–15 are written into color registers and Color RAM. **Color RAM is fixed at $D800–$DBE7 (55296–56295)** — 1000 nibbles, one per screen cell; only the low 4 bits are used (high nibble is undefined/garbage on read).

| Idx | Name | Hex RGB |
|-----|------|---------|
| 0 | Black | #000000 |
| 1 | White | #FFFFFF |
| 2 | Red | #880000 |
| 3 | Cyan | #AAFFEE |
| 4 | Purple/Violet | #CC44CC |
| 5 | Green | #00CC55 |
| 6 | Blue | #0000AA |
| 7 | Yellow | #EEEE77 |
| 8 | Orange | #DD8855 |
| 9 | Brown | #664400 |
| 10 | Light Red | #FF7777 |
| 11 | Dark Grey | #333333 |
| 12 | Grey (Medium) | #777777 |
| 13 | Light Green | #AAFF66 |
| 14 | Light Blue | #0088FF |
| 15 | Light Grey | #BBBBBB |

## Sources

- https://www.cebix.net/VIC-Article.txt
- https://www.zimmers.net/cbmpics/cbm/c64/vic-ii.txt
- https://www.c64-wiki.com/wiki/VIC
- https://www.c64-wiki.com/wiki/Color
