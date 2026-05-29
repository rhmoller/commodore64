# Appendix B — Memory Map ($0000–$FFFF)

The 6510 sees a 64 KB address space. ROM, RAM and I/O overlap; what is visible at
`$A000–$BFFF`, `$D000–$DFFF` and `$E000–$FFFF` is selected by the three low bits of
the processor port at `$0001`. RAM physically exists under all ROM/I/O; a write
("POKE") to a ROM/I/O address that maps RAM goes to that hidden RAM (except where I/O
is banked in, where writes hit the I/O registers).

## B.1 Region Overview

| Range (hex) | Range (dec) | Size | Contents |
|---|---|---|---|
| `$0000–$00FF` | 0–255 | 256 B | Zero page. `$00/$01` = 6510 port; OS & BASIC scratch pointers |
| `$0100–$01FF` | 256–511 | 256 B | Processor stack (also BASIC/KERNAL work area, tape error log) |
| `$0200–$02FF` | 512–767 | 256 B | OS work area: BASIC input buffer `$0200`, etc. |
| `$0300–$03FF` | 768–1023 | 256 B | BASIC/KERNAL indirect vectors (incl. `$0314–$0319`), tape/cassette buffer area |
| `$0400–$07E7` | 1024–2023 | 1000 B | Default screen RAM (video matrix, 40×25) |
| `$07E8–$07F7` | 2024–2039 | 16 B | Unused under default screen |
| `$07F8–$07FF` | 2040–2047 | 8 B | Sprite pointers 0–7 (for default screen at `$0400`) |
| `$0800–$9FFF` | 2048–40959 | 38 KB | BASIC program text + variables/arrays/strings (free RAM for ML) |
| `$A000–$BFFF` | 40960–49151 | 8 KB | BASIC ROM (or RAM, banked by `$01`) |
| `$C000–$CFFF` | 49152–53247 | 4 KB | Free RAM (never used by BASIC/KERNAL; popular for ML) |
| `$D000–$DFFF` | 53248–57343 | 4 KB | I/O block, or Character ROM, or RAM (banked by `$01`) |
| `$E000–$FFFF` | 57344–65535 | 8 KB | KERNAL ROM (or RAM, banked by `$01`) |

Default BASIC config (`$01 = $37`): `$0800–$9FFF` = 38911 free bytes; BASIC text
starts at `$0801`.

### I/O block detail ($D000–$DFFF)

| Range (hex) | Range (dec) | Device | Real registers |
|---|---|---|---|
| `$D000–$D3FF` | 53248–54271 | VIC-II video | 47 regs (`$D000–$D02E`); mirror every 64 B up to `$D3FF` |
| `$D400–$D7FF` | 54272–55295 | SID sound | 29 regs (`$D400–$D41C`); mirror every 32 B up to `$D7FF` |
| `$D800–$DBFF` | 55296–56319 | Color RAM | 1000 nybbles (`$D800–$DBE7`); low 4 bits only |
| `$DC00–$DCFF` | 56320–56575 | CIA #1 | 16 regs (`$DC00–$DC0F`); mirror every 16 B |
| `$DD00–$DDFF` | 56576–56831 | CIA #2 | 16 regs (`$DD00–$DD0F`); mirror every 16 B |
| `$DE00–$DEFF` | 56832–57087 | I/O #1 | Expansion port (open unless cartridge present) |
| `$DF00–$DFFF` | 57088–57343 | I/O #2 | Expansion port (open unless cartridge present) |

When `$01` maps Character ROM into this block instead, the 4 KB ROM appears as:
`$D000–$D7FF` uppercase/graphics set, `$D800–$DFFF` lowercase set.

## B.2 Key Zero-Page & Vector Locations

| Addr (hex) | Addr (dec) | Label | Purpose |
|---|---|---|---|
| `$0000` | 0 | D6510 | 6510 data-direction register (default `$2F` = %00101111) |
| `$0001` | 1 | R6510 | 6510 I/O port: banking bits 0–2 + tape lines (default `$37`) |
| `$002B–$002C` | 43–44 | TXTTAB | Pointer: start of BASIC text (`$0801`) |
| `$002D–$002E` | 45–46 | VARTAB | Pointer: start of BASIC variables (= end of program) |
| `$002F–$0030` | 47–48 | ARYTAB | Pointer: start of BASIC arrays |
| `$0031–$0032` | 49–50 | STREND | Pointer: end of arrays (start of free RAM) |
| `$0033–$0034` | 51–52 | FRETOP | Pointer: bottom of string storage (grows down) |
| `$0037–$0038` | 55–56 | MEMSIZ | Pointer: highest BASIC RAM address (`$A000`) |
| `$0090` | 144 | STATUS | KERNAL I/O status word (ST) |
| `$00C5` | 197 | LSTX | Matrix code of key currently pressed (`$40`/64 = none) |
| `$00C6` | 198 | NDX | Number of characters in keyboard buffer queue |
| `$00CB` | 203 | SFDX | Matrix code of key pressed this scan (`$40` = none) |
| `$0277–$0280` | 631–640 | KEYD | Keyboard buffer (queue, 10 bytes) |
| `$0314–$0315` | 788–789 | CINV | Vector: hardware IRQ handler (default `$EA31`) |
| `$0316–$0317` | 790–791 | CBINV | Vector: BRK instruction handler (default `$FE66`) |
| `$0318–$0319` | 792–793 | NMINV | Vector: hardware NMI handler (default `$FE47`) |

The 6510 RESET/IRQ/NMI hardware vectors at `$FFFA–$FFFF` live in KERNAL ROM:
NMI `$FFFA/$FFFB`, RESET `$FFFC/$FFFD`, IRQ/BRK `$FFFE/$FFFF`.

## B.3 Processor Port ($0001) Banking

`$0001` bits (output, set by DDR `$0000 = $2F`):

| Bit | Name | Function |
|---|---|---|
| 0 | LORAM | 1 = BASIC ROM at `$A000–$BFFF`; 0 = RAM |
| 1 | HIRAM | 1 = KERNAL ROM at `$E000–$FFFF`; 0 = RAM |
| 2 | CHAREN | 1 = I/O at `$D000–$DFFF`; 0 = Character ROM (only when bit0 or bit1 = 1) |
| 3 | — | Cassette write line |
| 4 | — | Cassette switch sense (input) |
| 5 | — | Cassette motor control |

Common `$01` values on a standard machine (no cartridge, GAME=EXROM=1). Bits 3–5
shown as the usual `$3x` form:

| `$01` | Bits 2-1-0 | `$A000–$BFFF` | `$D000–$DFFF` | `$E000–$FFFF` |
|---|---|---|---|---|
| `$37` (55) | 1 1 1 | BASIC ROM | I/O | KERNAL ROM |
| `$36` (54) | 1 1 0 | RAM | I/O | KERNAL ROM |
| `$35` (53) | 1 0 1 | RAM | I/O | RAM |
| `$34` (52) | 1 0 0 | RAM | I/O | RAM |
| `$33` (51) | 0 1 1 | BASIC ROM | Char ROM | KERNAL ROM |
| `$32` (50) | 0 1 0 | RAM | Char ROM | KERNAL ROM |
| `$31` (49) | 0 0 1 | RAM | Char ROM | RAM |
| `$30` (48) | 0 0 0 | RAM | RAM | RAM |

Notes:
- `$37` is the default (BASIC + KERNAL + I/O all visible).
- CHAREN (bit 2) chooses I/O vs Character ROM, but the Character ROM is only
  available when LORAM or HIRAM is 1. When both LORAM and HIRAM are 0, CHAREN
  instead selects I/O (CHAREN=1, e.g. `$34`) vs RAM (CHAREN=0, e.g. `$30`) at
  `$D000`.
- Zero page `$00`/`$01` and the stack page are always RAM and cannot be banked out.

### KickAssembler example

```kickasm
        // Bank in: RAM under BASIC and KERNAL, keep I/O for VIC/SID/CIA.
        sei
        lda #$2f
        sta $00            // DDR: bits 0-5 outputs (default)
        lda #$35           // LORAM=1, HIRAM=0, CHAREN=1 -> RAM, I/O, RAM
        sta $01

        // Read the Character ROM (no I/O, IRQs off):
        lda #$33           // bring Char ROM into $D000-$DFFF
        sta $01
        // ... copy from $D000.. to RAM ...
        lda #$37           // restore default
        sta $01
        cli
```

## Sources

- C64 Memory Map (zimmers): https://www.zimmers.net/anonftp/pub/cbm/maps/C64.MemoryMap.txt
- Commodore 64 Programmer's Reference Guide (local), "BASIC to Machine Language" / 6510 I/O port & memory maps, pp. 259–267
- C64-Wiki, Memory Map: https://www.c64-wiki.com/wiki/Memory_Map
- C64-Wiki, Bank Switching: https://www.c64-wiki.com/wiki/Bank_Switching
