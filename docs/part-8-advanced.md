# Part VIII — Advanced

Advanced techniques to round out the course: turning computation into table lookups, reclaiming the RAM under the ROMs, getting data off disk (and why fast loaders exist), surviving both PAL and NTSC, and developing for the modern FPGA C64s. Code is assembled and, where it computes a result, asserted in VICE.

**In this part:** 8.1 · 8.2 · 8.3 · 8.4 · 8.5

## 8.1 Lookup-table math: sine, cosine & fast multiply

**Objectives**
- Understand *why* a precomputed table almost always beats runtime computation on a 1 MHz 6502, and how to weigh table size against cycle cost.
- Build sine and cosine tables at assemble time with KickAssembler's `.fill` + `sin()`/`toRadians()`, and read them with `abs,X` for smooth motion.
- Implement an 8×8→16-bit multiply with the "quarter-squares" table trick, plus cheap `ASL`/`LSR` powers-of-two and small-constant multiply.

### Why tables win

The 6502 has no multiply, no divide, and no floating point. Anything beyond add/subtract/shift is a loop, and loops cost cycles you rarely have inside a raster routine. A naive 8×8 shift-add multiply runs an 8-iteration loop — on the order of **150–200 cycles** depending on the operands. On a PAL line you have only ~63 CPU cycles (Appendix H, [Appendix H](appendix-h-timing.md) §H.1), and a *bad line* leaves ~23. A multiply per pixel is simply not affordable that way.

A table converts computation into a memory read. From [Appendix A](appendix-a-opcodes.md), `LDA abs,X` is **4 cycles** (5 on a page cross), and `LDA zp,X` is **4** with no page-cross penalty (it wraps). So "look up f(X)" is a flat 4 cycles regardless of how expensive f actually is. The trade is RAM: a 256-byte table costs one page; a 512-byte squares table costs two. On a 38 KB machine that is usually a bargain.

The discipline: **if a value is a pure function of a small input (0–255), and you read it more than a handful of times, precompute it.** Build the table at *assemble* time when you can (zero runtime cost, zero startup delay), or in an init routine at startup when the formula needs runtime parameters.

### Assemble-time sine and cosine tables

KickAssembler evaluates floating-point expressions on the host at assemble time. `.fill n, expr` emits `n` bytes; inside `expr` the loop variable `i` runs `0…n-1`. A full-period sine table scaled into an unsigned byte range is:

```asm
// 256-entry sine, one full period (i*360/256 degrees), centred at 'amp',
// swinging +/- 'amp'.  Values 0..255 here (amp=128) -> wrap-free as a byte.
.const amp = 128
sineTab:    .fill 256, round(amp + amp*sin(toRadians(i*360/256)))
```

A cosine table is just sine shifted 90 degrees. Build it the same way (cheaper than indexing `sineTab` with a +64 offset at runtime when you need both):

```asm
cosTab:     .fill 256, round(amp + amp*sin(toRadians(i*360/256 + 90)))
```

Drive motion by stepping an 8-bit angle. Because the angle is a byte, it wraps `255→0` for free — the table period and the byte period coincide, which is the whole point of a 256-entry table:

```asm
.const VIC_SPR0X = $d000
.const VIC_SPR0Y = $d001

            inc angle              // 0..255, wraps automatically
            ldx angle
            lda cosTab,x           // 4 cycles
            sta VIC_SPR0X          // circular X
            lda sineTab,x          // 4 cycles
            sta VIC_SPR0Y          // circular Y
// ...
angle:      .byte 0
```

Two `LDA abs,X` reads (8 cycles) give a point on a circle. To shrink amplitude, lower `amp`; to bias the centre, change the constant added inside `.fill`. For *signed* offsets (e.g. add a wobble to a coordinate) build the table as a signed value and add it with `CLC`/`ADC`, masking or sign-extending as needed.

> Page-cross note: `LDA sineTab,X` pays +1 cycle only when `X` carries the read into the next page ([Appendix A](appendix-a-opcodes.md)). A 256-byte table page-aligned with `.align $100` is read with a *constant* 4 cycles for every X — align hot tables in cycle-exact code (Appendix H §H.6).

### Fast multiply: the quarter-squares trick

The algebraic identity is:

```
a*b = f(a+b) - f(a-b)   where   f(x) = floor(x*x / 4)
```

Proof sketch: `(a+b)²/4 - (a-b)²/4 = (4ab)/4 = ab`. The `floor` makes it exact for integers because `(a+b)` and `(a-b)` always have the *same parity*, so the two `/4` truncations cancel. The inputs to `f` range `0…510` (for `a+b`) and `0…255` (for `a-b`, after taking the absolute value), so we need a **512-entry square table** `f(0…511)`.

Because each `f(x)` can exceed 255 (e.g. `f(510) = 65025`), store it as two parallel 512-byte tables: a low-byte table and a high-byte table. The multiply is then a fixed sequence of adds/subtracts and four table reads — no loop:

1. `s = a + b` (can be up to 510 → use it as a 9-bit index; here we keep `a,b ≤ 255` and let `s` fit a byte plus carry handling, or restrict to operands whose sum ≤ 255 for the simple form below).
2. `d = |a - b|`.
3. product = `f(s) - f(d)`, computed as a 16-bit subtract of the two table entries.

The complete runnable program below multiplies `12 * 10`. Both operands and their sum (22) fit in a byte, so the index is a plain `X`. (For the general case where `a+b` can exceed 255 you carry the 9th bit into a second 256-aligned half of the table; that is left as an extension.)

```asm
            BasicUpstart2(start)

.const RESULT_LO = $0340        // free RAM in the cassette buffer page
.const RESULT_HI = $0341        // ($0300-$03FF, Appendix B)
.const tlo = $fb                // scratch: f(a+b) low  (zero page)
.const thi = $fc                // scratch: f(a+b) high

start:
            cld                 // arithmetic hygiene (Part I)

            lda #12             // operand a
            sta opA
            lda #10             // operand b
            sta opB

            // ---- t = f(a + b) ----
            lda opA
            clc
            adc opB             // a + b  (= 22, fits a byte here)
            tax
            lda sqLo,x          // f(a+b) low  -> 4 cycles
            sta tlo
            lda sqHi,x          // f(a+b) high
            sta thi

            // ---- d = |a - b| ; assume a >= b for this fixed case ----
            lda opA
            sec
            sbc opB             // a - b  (= 2)
            tax

            // ---- product = t - f(d)  (16-bit subtract) ----
            lda tlo
            sec
            sbc sqLo,x          // low byte
            sta RESULT_LO
            lda thi
            sbc sqHi,x          // high byte (borrow propagates via carry)
            sta RESULT_HI

loop:       jmp loop            // park here forever

opA:        .byte 0
opB:        .byte 0

            // f(x) = floor(x*x / 4), x = 0..511, split into two byte tables.
            // Page-align so the abs,X reads never cross a page mid-table.
            .align $100
sqLo:       .fill 512, <(floor(i*i/4))
sqHi:       .fill 512, >(floor(i*i/4))
```

**Expected result:** `12 * 10 = 120 = $0078`. After the program runs, `$0340 = $78` and `$0341 = $00`. (Check: `f(22) = floor(484/4) = 121`; `f(2) = floor(4/4) = 1`; `121 - 1 = 120`. Correct.) This program assembles under KickAssembler v5.x and the asserted bytes were verified in VICE.

The hot path here is roughly: two byte adds/subs, one `TAX` each, and four `LDA abs,X` — about **30–40 cycles** versus ~150+ for a shift-add loop, and it is *constant time* regardless of operand values.

> Why two `.fill` passes? KickAssembler's `<` and `>` operators take the low/high byte of an assemble-time number, so `<(floor(i*i/4))` and `>(floor(i*i/4))` build the split tables directly. The `floor()` is essential — `i*i/4` is otherwise a host float, and emitting a non-integer byte would round inconsistently.

### Cheap ÷2, ×2, and small-constant multiply

Powers of two never need a table. `ASL` shifts left (×2), `LSR` shifts right (÷2), each **2 cycles** on the accumulator, **5–7** on memory ([Appendix A](appendix-a-opcodes.md)). For multi-byte values, shift the low byte first then `ROL`/`ROR` the high byte to carry the bit across:

```asm
            asl valLo           // value <<= 1  (×2, 16-bit)
            rol valHi           // carry from low byte rolls into high byte
```

Small constants combine shifts and adds. To multiply A by 10 without any table (`10 = 8 + 2`):

```asm
            // A holds n; compute n*10 in A (assumes n*10 < 256)
            asl                 // n*2
            sta tmp             // save n*2
            asl                 // n*4
            asl                 // n*8
            clc
            adc tmp             // n*8 + n*2 = n*10
```

Each `ASL A` is 2 cycles — for a fixed small multiplier this beats both the loop and the table-lookup overhead. Decompose the constant into shifts plus a couple of adds (e.g. `×3 = (n<<1)+n`, `×5 = (n<<2)+n`, `×6 = ((n<<1)+n)<<1`).

### Division via a reciprocal table

Division is the worst case on a 6502. When the *divisor* is known and small, replace `n / d` with `n * (1/d)` using a fixed-point reciprocal table: precompute `recip[d] = round(256 / d)` at assemble time, multiply `n * recip[d]` with the squares trick above, and take the high byte (an implicit ÷256). For example `n / 5 ≈ (n * 51) >> 8`, since `round(256/5) = 51`. This is approximate (rounding error grows with `n`), but for screen coordinates and similar 8-bit ranges it is usually exact enough and costs only a multiply plus a shift instead of a full restoring-division loop.

**Pitfalls**
- Forgetting `floor()` in the squares table — `i*i/4` is a host float; emit it as an integer or the table is silently wrong for odd indices.
- Not taking the **absolute value** of `a-b` in the general multiply. For `a < b` the subtract underflows; compute the magnitude (compare, swap, or negate) before indexing. The runnable example sidesteps this by fixing `a ≥ b`.
- Letting `a+b` exceed 255 without handling the 9th index bit — `TAX` only carries 8 bits. The simple form above requires `a+b ≤ 255`; the full multiply needs a 9-bit index path.
- Forgetting `CLC` before the addition chain or `SEC` before the subtraction chain — a stray carry/borrow poisons the 16-bit result ([Appendix A](appendix-a-opcodes.md), ADC/SBC notes).
- Page-cross jitter: an un-aligned `LDA tab,X` costs 4 *or* 5 cycles depending on X. Align timing-critical tables with `.align $100` (Appendix H §H.6).
- Putting stray `.byte` data *before* the program at `$0801` shifts the load address. Keep tables after the code (as above) or use explicit `*=`/`.label`, never loose bytes ahead of `BasicUpstart2`.

**Go deeper:** [Codebase64 — fast multiplication with the squares table](https://codebase64.c64.org/doku.php?id=base:seriously_fast_multiplication); cycle costs in [Appendix A](appendix-a-opcodes.md), the 1 MHz cycle budget in [Appendix H](appendix-h-timing.md), and the `$0340` free-RAM region in [Appendix B](appendix-b-memory-map.md).

## 8.2 RAM under the ROMs & the all-RAM map

**Objectives**
- Use the 6510 processor port at `$01` to bank ROM/I/O out and expose the 64 KB of RAM that physically lives underneath.
- Know the four common configs (`$37`, `$36`, `$35`, `$34`) and the dangerous all-RAM/Char-ROM configs, and when each is safe.
- Understand why hiding the KERNAL forces you to take responsibility for the hardware vectors at `$FFFA/$FFFE`, hence `SEI`.
- Copy the Character ROM out of bank `$33` into the RAM beneath it so you can edit a custom charset in place.

### Why there is RAM under the ROMs

The C64 has a full 64 KB of DRAM. The BASIC ROM (`$A000–$BFFF`), the I/O block / Character ROM (`$D000–$DFFF`) and the KERNAL ROM (`$E000–$FFFF`) are *overlaid* on top of that RAM. What the CPU sees in those windows is chosen by the three low bits of the 6510 port at `$0001` (LORAM, HIRAM, CHAREN). Crucially, the RAM never goes away: a write to a ROM address (e.g. `STA $E000`) lands in the hidden RAM *unless* I/O is currently mapped there, in which case the write hits an I/O register instead. See [Appendix B](appendix-b-memory-map.md) §B.3.

Zero page (`$00/$01`) and the stack page (`$0100–$01FF`) are *always* RAM and can never be banked out — that is what makes it safe to keep manipulating `$01` itself.

### The configs you will actually use

`$0000` is the data-direction register; on a running machine it is already `$2F` (`%00101111`), making bits 0–5 of `$01` outputs. You normally do not need to touch `$00`. Writing a `$3x` value to `$01` keeps the cassette bits (3–5) in their idle state and just sets the banking bits:

| `$01` | Bits 2-1-0 | `$A000–$BFFF` | `$D000–$DFFF` | `$E000–$FFFF` | Use |
|---|---|---|---|---|---|
| `$37` | 1 1 1 | BASIC ROM | I/O | KERNAL ROM | Default; everything visible |
| `$36` | 1 1 0 | **RAM** | I/O | KERNAL ROM | +8 KB RAM under BASIC; KERNAL still works |
| `$35` | 1 0 1 | **RAM** | I/O | **RAM** | +16 KB RAM; I/O kept; **KERNAL gone** |
| `$34` | 1 0 0 | **RAM** | I/O | **RAM** | Same map as `$35` here (CHAREN only matters when bit0/bit1=1) |
| `$33` | 0 1 1 | BASIC ROM | **Char ROM** | KERNAL ROM | Char ROM visible at `$D000–$DFFF` |
| `$30` | 0 0 0 | **RAM** | **RAM** | **RAM** | All-RAM: no I/O, no ROM at all |

Two subtleties from [Appendix B](appendix-b-memory-map.md):

- CHAREN (bit 2) only picks I/O-vs-Character-ROM while LORAM **or** HIRAM is 1. When both are 0 (`$34`, `$30`), CHAREN instead selects I/O (`$34`) vs RAM (`$30`) at `$D000`. So `$34` and `$35` show the *identical* map in the `$A000`/`$D000`/`$E000` windows — they differ only in the cassette-irrelevant CHAREN bit's documented role, not in what the CPU sees here.
- The Character ROM at `$D000` is a 4 KB image: `$D000–$D7FF` is the uppercase/graphics set, `$D800–$DFFF` is the lowercase set.

### The vector trap: hiding the KERNAL hides `$FFFA/$FFFE`

The 6510 fetches its interrupt vectors from fixed addresses: NMI `$FFFA/$FFFB`, RESET `$FFFC/$FFFD`, IRQ/BRK `$FFFE/$FFFF`. In the default map those live in KERNAL ROM and point at the KERNAL handlers. The moment you set HIRAM=0 (`$35`, `$34`, `$30`), the `$E000–$FFFF` window becomes **RAM** — and so do the vectors. Whatever garbage is in that RAM is now where the CPU will jump on the next IRQ, NMI or BRK.

Therefore, before banking the KERNAL out you must do one of:

1. `SEI` to mask IRQs, finish your RAM access quickly, and restore `$01=$37` before `CLI` (the approach in the runnable program below); **and** be aware that NMI is *not* masked by `SEI` — avoid `$35/$34/$30` windows long enough to risk an NMI (e.g. RESTORE key) unless you have also installed your own NMI vector, or
2. install your own IRQ/NMI/BRK handlers and write valid pointers into the RAM at `$FFFA/$FFFE` while the KERNAL is out (the technique for a self-contained, full-takeover program — see Part II 2.3 discipline: `SEI`, set up CIA/raster source, point the hardware vectors at your own code, only then `CLI`).

Banking out only BASIC (`$36`) is harmless to interrupts because the KERNAL — and thus its vectors and IRQ handler — stays mapped.

### Complete runnable program: prove `$E000` is RAM under the KERNAL

This program masks interrupts, switches to `$35` (RAM under BASIC and KERNAL, I/O still visible), writes `$42` to `$E000` — which with HIRAM=0 is RAM, not the KERNAL — reads it straight back, restores the default `$37`, and stores the read-back byte to `$0340`. Because the whole banked region is touched with IRQs masked and restored before `CLI`, the KERNAL is back before any interrupt can fire.

```asm
//----------------------------------------------------------
// 8.2  RAM under the KERNAL — write/read $E000 as RAM
//      Expected result: $0340 == $42
//----------------------------------------------------------
                *=$0801 "BASIC stub"
                // 10 SYS 2064
                .byte $0c,$08,$0a,$00,$9e,$20,$32,$30,$36,$34,$00,$00,$00

                *=$0810 "Main"
start:
                sei                 // mask IRQ: KERNAL about to vanish

                lda #$35            // %00110101: LORAM=1,HIRAM=0,CHAREN=1
                sta $01             // $A000=RAM, $D000=I/O, $E000=RAM

                lda #$42            // test value
                sta $e000           // HIRAM=0 -> this RAM, NOT the KERNAL
                lda $e000           // read it straight back from that RAM

                ldx #$37            // restore default banking
                stx $01             // KERNAL/BASIC/I/O all visible again

                sta $0340           // A still holds the byte read from RAM

                cli                 // safe now: KERNAL & its vectors restored
loop:           jmp *               // hang
```

After running, `$0340` contains **`$42`**. If `$E000` were still the KERNAL ROM, the `STA $e000` would have been swallowed (you cannot write ROM) and the subsequent `LDA $e000` would have returned a KERNAL byte (`$85` at the very start of the KERNAL), not `$42`. Reading back `$42` proves the write went to real RAM hidden beneath the KERNAL.

Note the discipline: `$01` is written, the RAM is touched, and `$01` is restored to `$37` *before* `CLI`. At no point with the KERNAL banked out do we allow an IRQ through, and we never rely on the (now-RAM) vectors.

### EXCERPT: copying the Character ROM into RAM to edit a charset

You cannot edit the Character ROM (it is ROM), but you can lift its bitmaps into RAM, point the VIC at that RAM, and modify glyphs. The classic recipe: bank in the Char ROM with `$33`, copy 2 KB (the uppercase set, `$D000–$D7FF`) down to a RAM charset (e.g. `$3000`), restore `$37`, then set `$D018` to select the new charset (and ensure VIC bank/`$DD00` agree). This is presented as an excerpt because the VIC re-pointing and visual result are covered in Part III; the copy loop itself is fully valid and runs:

```asm
                // Copy uppercase Char ROM ($D000-$D7FF) -> RAM at $3000.
                sei                 // KERNAL stays mapped here (HIRAM=1),
                                    // but I/O leaves while Char ROM is in,
                                    // so the system IRQ's CIA/VIC access
                                    // would misbehave -> mask it.
                lda #$33            // %00110011: LORAM=1,HIRAM=1,CHAREN=0
                sta $01             // $D000-$DFFF now = Character ROM

                ldx #$00
!copy:          lda $d000,x         // source: char ROM page 0..7
                sta $3000,x         // dest RAM
                lda $d100,x
                sta $3100,x
                // ... unrolled for $d200..$d700 / $3200..$3700 ...
                inx
                bne !copy-

                lda #$37            // I/O back; KERNAL never left
                sta $01
                cli
                // Now POKE new glyph bytes into $3000.. and set $D018 /
                // VIC bank as in Part III to display the custom charset.
```

While CHAREN=0 the I/O block is gone, so the SID, CIA timers and VIC registers are unreachable; the default KERNAL IRQ touches the CIA every frame, which is exactly why you `SEI` (or stop `$DC0D` IRQs) around the copy. Here HIRAM stays 1, so the KERNAL and its vectors remain in place — the `SEI` is about losing I/O, not about losing the vectors.

### EXCERPT: the all-RAM map (`$30`)

`$01 = $30` gives a flat 64 KB of RAM: no BASIC, no I/O, no KERNAL. This is what you want for a memory test or a program that owns the entire machine, but it is the most hostile config: you have **no** I/O (no way to read the keyboard or drive the VIC) and **no** KERNAL vectors. You must install your own IRQ/NMI handlers into RAM and keep a valid raster/CIA source, or run with interrupts permanently masked. Treat `$30` as a Part II 2.3 full-takeover scenario, never as a casual `$01` poke.

**Pitfalls**
- Forgetting `SEI` before clearing HIRAM (`$35/$34/$30`): the next IRQ jumps through RAM at `$FFFE/$FFFF` and crashes. Restore `$37` before `CLI`.
- `SEI` does **not** mask NMI. With the KERNAL banked out, an NMI (e.g. RESTORE key via CIA #2, or a timer NMI) still vectors through RAM at `$FFFA/$FFFB`. Keep KERNAL-out windows brief, or install an NMI handler.
- Writing to `$D000–$DFFF` expecting RAM while I/O is mapped: the write hits VIC/SID/CIA, not hidden RAM. RAM under `$D000` needs CHAREN-driven `$30`, not `$34/$35`.
- Assuming you can edit the Character ROM at `$D000` directly — it is ROM; you must copy it to RAM first (bank `$33`), edit the copy, and re-point the VIC.
- Confusing `$34` and `$35`: in the `$A000/$D000/$E000` windows they are identical (RAM/I-O/RAM). CHAREN only changes the map when LORAM or HIRAM is 1.
- Touching `$00` (DDR) unnecessarily. It is already `$2F`; clobbering it can make `$01` bits read-only and silently break banking.

**Go deeper:** 6510 port semantics and the full bank table are in [Appendix B](appendix-b-memory-map.md) §B.3; opcode timings for the copy loop in [Appendix A](appendix-a-opcodes.md) and [Appendix H](appendix-h-timing.md).

## 8.3 Loading from disk & fast loaders (overview)

**Objectives**
- Call the KERNAL load chain — SETLFS ($FFBA), SETNAM ($FFBD), LOAD ($FFD5) — and understand `,8` versus `,8,1`.
- Explain why fast loaders and IRQ loaders exist, and how the 1541 serial (IEC) bus protocol limits the stock KERNAL loader.
- Recognise the role of `.d64` images, the `c1541` tool, and hardware speeders (JiffyDOS, SD2IEC, the Ultimate).

The C64's mass storage is the Commodore 1541 disk drive, attached over the 6-pin serial **IEC bus**. The drive is itself a computer (a 6502 plus two 6522 VIAs) running its own DOS; the C64 talks to it byte-by-byte over a handshaked serial line. This lesson surveys the standard KERNAL way to read a file, then explains why almost every game and demo replaces it.

### The KERNAL load chain

Three calls do the work. First **SETLFS** ($FFBA) registers the *logical file*: `.A` = logical file number (any value 1-255 you pick to identify the channel), `.X` = device number (8 for the first disk drive), `.Y` = the *secondary address*. The secondary address is the key to load behaviour:

- **`.Y = 1`** means "use the file's own load address" — the first two bytes stored in the file are its destination address. This is the `,8,1` you type in BASIC (`LOAD "NAME",8,1`). Machine-code programs that must land at a fixed address always use this.
- **`.Y = 0`** means "relocate to the start of BASIC text" ($0801). This is plain `LOAD "NAME",8`, used for BASIC programs.

Next **SETNAM** ($FFBD) gives the filename: `.A` = name length, `.X`/`.Y` = lo/hi of a pointer to the PETSCII name. A zero length loads "the next file" (rarely what you want).

Finally **LOAD** ($FFD5): `.A = 0` performs a load (`.A = 1` verifies instead). When the secondary address was 0, `.X`/`.Y` supply the relocation target; when it was 1 those registers are ignored because the file carries its own address. On return the carry flag is set if an error occurred, and `.X`/`.Y` hold the address of the last byte loaded + 1. Always check status with **READST** ($FFB7): bit 6 = EOF, bit 7 = device not present.

> EXCERPT — needs a disk image attached. The headless harness in this course has no drive, so the following is shown for reference and is **not** run. Only the small program at the end of the lesson is assembled and verified.

```asm
// ---- EXCERPT: load "DATA" from device 8 to its own load address ----
.label SETLFS = $ffba
.label SETNAM = $ffbd
.label LOAD   = $ffd5
.label READST = $ffb7

loadfile:
        lda #1                  // logical file number (our choice)
        ldx #8                  // device 8 = first disk drive
        ldy #1                  // secondary 1 => use file's own load address (",8,1")
        jsr SETLFS

        lda #namelen            // .A = length of the filename
        ldx #<name              // .X = lo byte of name pointer
        ldy #>name              // .Y = hi byte of name pointer
        jsr SETNAM

        lda #0                  // .A = 0 => LOAD (1 would VERIFY)
        jsr LOAD               // X/Y ignored here because sec.addr = 1
        bcs error              // carry set => load failed

        jsr READST             // read I/O status word
        and #%10111111         // ignore EOF (bit6); keep real-error bits
        bne error
        rts                    // success: X/Y = end address + 1
error:
        // ... handle device-not-present / read error ...
        rts

name:    .text "DATA"
.label namelen = 4
```

To relocate a BASIC-style file to $0801 instead, you would set `ldy #0` in SETLFS and pass the target in `.X`/`.Y` to LOAD. Note SETLFS/SETNAM only *stash* parameters; LOAD is what actually drives the bus.

### Why fast loaders exist

The stock KERNAL serial routine is slow. The original 1541 firmware ships a conservative, bug-shy serial handshake that moves roughly one byte at a time with generous timing margins; transferring a full 170 KB disk the stock way can take minutes. The bottleneck is **software protocol, not hardware** — the IEC lines can be driven far faster than the KERNAL does.

A **fast loader** replaces the byte-transfer routine on *both* sides. It uploads custom 6502 code into the 1541's RAM, then both machines clock data across the (normally handshaked) CLK and DATA lines with tight, cycle-counted timing — often 2 bits per transfer step, sometimes using CIA timers for synchronisation. This can be 5-25x faster than stock.

An **IRQ loader** goes further: it streams disk data in the background, a chunk at a time, driven from a raster or CIA interrupt while the main program (a demo part, a game level) keeps running. The classic demo trick of "no visible loading" is an IRQ loader filling buffers between frames.

Because fast loaders depend on exact timing, they are sensitive to drive type and to anything that steals cycles (sprites, badlines, NMIs), which is why they are notoriously fiddly to write and why most projects reuse a battle-tested one.

### Disk images and tooling

On the development side you work with **`.d64`** files — byte-for-byte images of a 35-track, 170 KB single-sided 1541 disk. The VICE-bundled **`c1541`** tool builds and edits them, e.g. formatting an image and writing a PRG into it:

```
c1541 -format "mydisk,01" d64 game.d64 -write build/game.prg game
```

Emulators and modern hardware then "attach" the `.d64`. Hardware that speeds disk access up:

- **JiffyDOS** — a patched KERNAL + drive ROM with a faster default protocol; transparent to normal LOAD.
- **SD2IEC** — an SD-card device on the IEC bus that emulates a 1541 and serves `.d64`/PRG files.
- **The Ultimate (Ultimate-II+ / Ultimate 64)** — cycle-accurate 1541/1571/1581 emulation from USB/microSD, mounting `.D64/.D71/.D81/.G64`, plus a DMA loader for instant load-and-run. See [C64 Ultimate](c64-ultimate.md).

### Verification program (no disk required)

Since the harness has no drive, the runnable check below does not touch the bus. It demonstrates the *user-facing* half of a loader — clearing the screen, printing a "LOADING..." banner via CHROUT ($FFD2), and setting the border — then stores a known marker so the result is assertable.

After this program runs, the byte at **$0340 is $2A** and the border colour register $D020 holds 2 (red).

```asm
.label CHROUT = $ffd2           // KERNAL: output PETSCII char in A
.label BORDER = $d020           // VIC-II border colour (low nibble)
.label RESULT = $0340           // assertion target

*=$0801 "BASIC"
:BasicUpstart2(start)           // SYS 2061 stub; keeps load addr at $0801

*=$080d
start:
        lda #$93                // PETSCII clear-screen control code
        jsr CHROUT

        ldx #0                  // print the banner
print:  lda message,x
        beq printed             // 0 terminates the string
        jsr CHROUT
        inx
        bne print
printed:

        lda #2                  // red
        sta BORDER             // border = red while "loading"

        lda #$2a                // known marker value
        sta RESULT             // $0340 = $2A

loop:   jmp *                   // park the CPU

message:
        .text "LOADING..."
        .byte $0d, 0           // carriage return, then null terminator
```

The `.text`/`.byte` data sits *after* the code, so the BASIC load address stays at $0801 — never place stray `.byte` before the program start (a common KickAssembler gotcha that shifts the load address).

**Pitfalls**
- Forgetting the secondary address distinction: `,8` (sec 0) relocates to $0801 and will scatter a machine-code program; use `,8,1` (sec 1) for fixed-address binaries.
- Not checking the carry flag *and* READST ($FFB7) after LOAD — a "device not present" (bit 7) or read error otherwise passes silently. Mask off the EOF bit (bit 6) when testing for real errors.
- SETLFS/SETNAM do nothing visible on their own; they only stash parameters consumed by LOAD/SAVE/OPEN.
- Fast loaders are timing-critical: they break if you let sprites, badlines, or NMIs steal cycles during a transfer. Disable interrupts / DMA appropriately while loading.
- Loading over $0801 from inside a running program can clobber your own code/data if the file's destination overlaps it — know where the file lands.

**Go deeper:** KERNAL routine details (SETLFS/SETNAM/LOAD/CHROUT/READST) in [Appendix F — KERNAL & BASIC ROM Jump Tables](appendix-f-kernal-basic.md); border register $D020 in [Appendix C — VIC-II Registers](appendix-c-vic-registers.md); hardware speeders and DMA loading in [C64 Ultimate](c64-ultimate.md).

## 8.4 PAL vs NTSC portability

**Objectives**
- Understand exactly how PAL and NTSC VIC-II chips differ in cycles/line, lines/frame and refresh rate, and why that breaks naive raster and timing code.
- Detect the host video standard at runtime by measuring the maximum raster line.
- Compensate for the difference with per-standard timing tables so music and game logic run at the intended speed on both machines.

### Why this matters

The Commodore 64 shipped with two incompatible video chips. PAL machines use the 6569; NTSC machines use the 6567 (revision R8, with an older R56A in early units). They are *not* compatible at the cycle or raster level. From [Appendix H](appendix-h-timing.md) H.1 and H.5:

| System (chip) | Cycles/line | Lines/frame | Cycles/frame | Refresh | Max raster line |
|---|---:|---:|---:|---:|---:|
| PAL (6569) | 63 | 312 | 19656 | ~50.12 Hz | 311 ($137) |
| NTSC (6567R8) | 65 | 263 | 17095 | ~59.83 Hz | 262 ($106) |
| NTSC old (6567R56A) | 64 | 262 | 16768 | ~60.05 Hz | 261 ($105) |

Three consequences fall out of this table, and they are the whole reason this lesson exists:

1. **Raster splits land in the wrong place.** A split timed for PAL's 63-cycle line drifts horizontally on NTSC's 65-cycle line, and a raster IRQ set for line `$140` (320) never fires on NTSC because NTSC only counts up to 262.
2. **Once-per-frame code runs ~20% faster on NTSC.** NTSC refreshes at ~59.8 Hz vs PAL's ~50.1 Hz. A music routine or game loop ticked once per frame plays roughly 60/50 = 1.19× faster on NTSC. Tunes sound sharp and fast; games feel rushed.
3. **There are fewer raster lines (and fewer CPU cycles per frame) on NTSC.** NTSC gives 17095 cycles/frame vs PAL's 19656 — about 13% less CPU time between frames. Effects that *just* fit in a PAL frame can overrun on NTSC even though NTSC's individual lines are longer.

> Note the raster-line counter is 9 bits: `$D012` holds the low 8 bits and `$D011` bit 7 (RST8) holds bit 8 (see [Appendix C](appendix-c-vic-registers.md), `$D011`/`$D012`). PAL's peak of 311 = `$137` therefore has RST8 set; NTSC's peak of 262 = `$106` also has RST8 set. To read the *full* line number you must combine both — but for detection we only need the low byte plus the MSB, and a simpler trick works (below).

### Runtime detection: find the maximum raster line

The robust, portable method does not rely on reading RST8 at all. It exploits the fact that `$D012` counts up each line and then **wraps back to 0** at the top of the frame. If we keep sampling `$D012` and remember the largest value we have seen *for the low byte alone*, that maximum differs between the standards:

- PAL counts low bytes 0..255 then wraps the 9-bit counter through 256..311, so `$D012` runs 0..255, then 0..55 again (311 = `$137` → low byte `$37`). The largest low byte ever seen is **255 (`$FF`)**.
- NTSC (6567R8) tops out at 262 = `$106`, so `$D012` runs 0..255 then 0..6. The largest low byte seen is also `$FF`.

So the naive "largest low byte" is `$FF` on both — useless. The reliable discriminator is the **total number of distinct lines**, i.e. whether the counter ever reaches a line number that only PAL has. The simplest correct approach uses both `$D012` and the RST8 bit and asks one question: *does the raster counter ever exceed 262?* If yes, the machine is PAL.

A clean, widely-used variant is: **wait until `$D012` stops increasing within a frame and record the highest full line number.** PAL peaks at 311, NTSC at ~262. We compare the captured maximum against a threshold safely between them, e.g. 263. Because we need the 9-bit value we sample `$D011` bit 7 together with `$D012`.

The program below does exactly that. It runs with interrupts disabled and the default I/O map, watches a full frame, captures the maximum 9-bit raster value, and classifies:

- max ≥ 263 → PAL → store `$00`
- max < 263 → NTSC → store `$01`

It stores the flag to **$0340**. Under VICE's default PAL machine the captured maximum is 311, so the expected result is **$0340 = $00 (PAL)**.

```asm
//============================================================
// 8.4  PAL/NTSC detection  ->  $0340 = 0 (PAL) / 1 (NTSC)
// KickAssembler v5.x
//============================================================
        *=$0801 "BASIC"
        // BASIC stub: 10 SYS 2064  ($0810)
        .byte $0c,$08,$0a,$00,$9e,$32,$30,$36,$34,$00,$00,$00

        *=$0810 "MAIN"
start:
        sei                     // we busy-wait on the raster; no IRQs

        // maxLine is a 16-bit running maximum, start at 0
        lda #0
        sta maxLo
        sta maxHi

        // Sample for two full frames worth of lines so we are sure
        // to have passed the top of one frame regardless of where we
        // started. 2*312 = 624 iterations covers PAL's longest frame
        // with margin; we loop a fixed, generous count.
        ldx #0                  // outer counter (256 * inner)
        ldy #0                  // inner counter
sample:
        // read the 9-bit raster line into curLo/curHi
        lda $d012
        sta curLo
        lda $d011
        and #$80                // isolate RST8 (bit 7 of $D011)
        // shift RST8 down to bit 0 so curHi is 0 or 1
        asl                     // bit7 -> carry
        lda #0
        rol                     // carry -> bit0
        sta curHi

        // compare current (curHi:curLo) against max (maxHi:maxLo)
        // if current > max, update max
        lda curHi
        cmp maxHi
        bcc notbigger           // curHi < maxHi -> not bigger
        bne update              // curHi > maxHi -> bigger
        // high bytes equal: compare low bytes
        lda curLo
        cmp maxLo
        bcc notbigger           // curLo < maxLo -> not bigger
        beq notbigger           // equal -> no update needed
update:
        lda curLo
        sta maxLo
        lda curHi
        sta maxHi
notbigger:
        // loop control: run 256*3 = 768 samples (> 2 PAL frames)
        iny
        bne sample
        inx
        cpx #3
        bne sample

        // classify: PAL max = 311 ($0137), NTSC max ~262 ($0106).
        // threshold 263 ($0107): max >= 263 -> PAL(0), else NTSC(1).
        // compare maxHi:maxLo against $0107
        lda maxHi
        cmp #$01
        bcc isNtsc              // maxHi < 1 -> max < 256 -> NTSC region
        bne isPal               // maxHi > 1 -> impossible high -> treat PAL
        // maxHi == 1: compare low byte against $07
        lda maxLo
        cmp #$07                // >= 7 means line >= 263
        bcc isNtsc
isPal:
        lda #$00
        sta $0340
        jmp done
isNtsc:
        lda #$01
        sta $0340

done:
        jmp *                   // park forever

//---- state (kept after the program, harmless) -------------
curLo:  .byte 0
curHi:  .byte 0
maxLo:  .byte 0
maxHi:  .byte 0
```

Note the layout discipline from earlier parts: the program begins with `*=$0801` for the BASIC stub and a `*=$0810` for code; the state variables (`curLo`, `maxLo`, …) are declared **after** the code with `.byte`, never as stray `.byte` ahead of `$0801`, so the load address stays correct.

Why sample 768 times? We do not know where in the frame the program starts. Sampling for more than two full PAL frames (2 × 312 = 624 lines) guarantees we cross the top of the frame at least once and therefore observe the true maximum line, on both standards. The loop here is a simple counted busy-wait, not cycle-exact — exactness is irrelevant for detection.

> A subtle correctness point: you must read `$D011` (for RST8) immediately after `$D012`. The line can advance between the two reads, but at worst that introduces a one-line error, which is far smaller than the ~49-line gap between PAL's and NTSC's maxima, so the classification is never affected.

### Compensating for the difference

Detection is only half the job; you then have to *act* on the flag. Two common strategies:

**Per-standard timing tables.** Keep two copies of any raster-line constant and index by the detected flag. For example, a stable raster split you want near the bottom of the screen:

```asm
        // EXCERPT — choose a raster compare line per standard
        ldx flag                // 0 = PAL, 1 = NTSC  (from $0340)
        lda splitLineLo,x
        sta $d012
        lda $d011
        and #$7f
        ora splitLineHi,x       // sets RST8 from the per-standard MSB
        sta $d011
        // ...
splitLineLo: .byte $f8, $f0     // PAL line 248, NTSC line 240
splitLineHi: .byte $00, $00     // both fit in low 8 bits here (RST8=0)
```

Always pick raster targets that *exist on NTSC* (≤ 262) if the same value must serve both, or split the constant into two as above. A raster IRQ armed for a line beyond NTSC's 262 simply never fires there (see [Appendix C](appendix-c-vic-registers.md), `$D012`/`$D01A`).

**Adjusting tempo / frame pacing.** Because NTSC ticks ~1.19× more often per second, code driven once per frame plays fast on NTSC. The cheapest fix is to *skip one frame periodically* on NTSC so the effective tick rate matches PAL: PAL runs 50 ticks/sec, NTSC 60 ticks/sec, so dropping 1 in 6 NTSC frames yields 50 effective ticks/sec. Alternatively, drive your player from a CIA timer set to a per-standard reload value rather than from the raster IRQ, so the *real-time* tempo is identical regardless of refresh rate. A per-standard table of timer reload values, indexed by the same `$0340` flag, keeps music tempo constant across machines.

```asm
        // EXCERPT — pick a "frames per music tick" reload per standard
        ldx flag
        lda musicDivider,x
        sta tickReload
        // ... main loop decrements a counter; on underflow advance the
        //     music one step, reload from tickReload.
musicDivider: .byte 1, 1        // tune to taste; combine with frame-skip
                                // on NTSC for true 50 Hz equivalence
```

**Pitfalls**
- Reading only `$D012` and ignoring `$D011` bit 7 (RST8) loses the top of the 9-bit line counter; both PAL and NTSC wrap the low byte through `$FF`, so the low byte alone cannot distinguish them. Always combine RST8 with `$D012` ([Appendix C](appendix-c-vic-registers.md)).
- Sampling for less than two full frames can miss the frame's top and capture a too-low maximum, misclassifying a PAL machine as NTSC. Sample generously (> 624 lines).
- Arming a raster IRQ for a line above 262 works on PAL but silently never triggers on NTSC — split or clamp the compare line per standard.
- Assuming "63 cycles" everywhere: cycle-exact raster code (FLI, opened borders, timed splits) is inherently per-standard because the line length differs (63 vs 65 vs 64 cycles, [Appendix H](appendix-h-timing.md) H.1).
- Driving music/game speed straight from the raster or once-per-frame on both machines makes NTSC run ~20% fast; compensate with frame-skip or a per-standard CIA timer reload.
- The early NTSC 6567R56A has 262 lines / 64 cycles, slightly different from the R8; if you must support it, treat any non-PAL maximum (< 263) as "NTSC family" and, where it matters, distinguish R56A by its 261 vs 262 peak.

**Go deeper:** Christian Bauer's VIC-II article (authoritative timing) — https://www.cebix.net/VIC-Article.txt ; see [Appendix H](appendix-h-timing.md) for per-system frame timing and raster geometry, and [Appendix C](appendix-c-vic-registers.md) for the `$D011`/`$D012` raster registers.

## 8.5 The C64 Ultimate & modern hardware for developers

**Objectives**
- Understand the developer-relevant features of the FPGA C64s (C64 Ultimate / Ultimate-64 / Ultimate-II+): turbo mode, the REU, GeoRAM, the on-machine Ultimate Command Interface, and the host-side REST API.
- Drive a whole-block memory move through the REU DMA registers at `$DF00–$DF0A` (stash / fetch / swap).
- See how this repo's `tools/vice_run.py` / `tools/vice_reload.py` mirror the Ultimate's REST API for a tight edit→deploy loop.
- Write a deterministic program that runs on a *plain* C64 and verifies a known result.

### The landscape

Most people who target the C64 today eventually run their code on an FPGA re-creation rather than (or alongside) original silicon. The current flagship is the officially Commodore-branded **Commodore 64 Ultimate**, built on Gideon Zweijtzer's **Ultimate-64** board; the same firmware family powers the standalone **Ultimate-64** and the **Ultimate-II+** cartridge that adds these features to a *real* breadbin. For a developer, all three are effectively one target. See [the C64 Ultimate page](c64-ultimate.md) for the full hardware breakdown, editions, and authoritative links.

The key insight: your normal KickAssembler workflow is unchanged. You still write 6502, still assemble a `.prg`, still test in VICE. The new machine adds *optional* capabilities you can opt into — but if you want your demo to also run on stock hardware, you must keep it stock-clean and only *probe* for extras at runtime.

### Turbo mode — useful, but not for cycle-exact effects

The recreated 6510 can run far above the stock ~1.023 MHz (PAL) / ~1.023 MHz region. This is a free win for CPU-bound work: compression, level generation, AI, anything that just needs cycles.

It is a trap for **cycle-exact** code. Raster splits, FLI, stable rasters, and SID timing all assume the stock relationship between the CPU clock and the VIC-II's 504/525-cycle line. Turbo decouples that. The discipline:

- Develop and validate cycle-exact effects at **1 MHz** in `x64sc` (the single-cycle-accurate VICE build — see [toolchain.md](toolchain.md)).
- Never *depend* on turbo being on. If you want a speed bonus, detect/allow it but degrade gracefully.

There is no portable, documented "am I in turbo?" bit you should hardcode a demo around — treat turbo as a user/firmware setting, not an API.

### The REU — RAM Expansion Unit (up to 16 MB)

The classic Commodore REU is a DMA controller plus extra RAM that lives behind I/O area #2 (`$DF00–$DFFF`, the expansion port second I/O page — see [appendix-b-memory-map.md](appendix-b-memory-map.md)). On the C64 Ultimate, 16 MB of the onboard DDR2 is allocated to an REU that ships **enabled** out of the box.

The point of an REU is that it does not move bytes one `lda/sta` at a time. You set up a few registers and trigger a **block DMA**: the controller copies a whole region between C64 RAM and REU RAM in (essentially) one go. The four operations:

- **STASH** — copy C64 RAM → REU RAM.
- **FETCH** — copy REU RAM → C64 RAM.
- **SWAP** — exchange the two blocks.
- **VERIFY** — compare without copying.

#### The DMA register block

| Addr | Name | Meaning |
|------|------|---------|
| `$DF00` | Status | Read: interrupt/fault flags (end-of-block, fault, REU size). Cleared on read. |
| `$DF01` | Command | Write to launch DMA. Bit 7 = execute, bits 1:0 select STASH/FETCH/SWAP/VERIFY. |
| `$DF02/$DF03` | C64 address | 16-bit C64-side start address (low, high). |
| `$DF04/$DF05/$DF06` | REU address | 24-bit REU-side start address (low, mid, high). |
| `$DF07/$DF08` | Transfer length | 16-bit byte count (low, high). `$0000` means 65536. |
| `$DF09` | Interrupt mask | Enable end-of-block / fault interrupts. |
| `$DF0A` | Address control | Bit 7 = fix C64 address, bit 6 = fix REU address (don't auto-increment). |

The two low bits of the command select the operation; the common encodings are STASH = `%00`, FETCH = `%01`, SWAP = `%10`, VERIFY = `%11`. Bit 7 (`$80`) is "execute now". A very common pattern uses the "FF00 decode disable" trick (`$DF01` bit 4) so the DMA fires the instant you write `$FF00`; the simplest correct form, used below, just sets bit 7 in the command itself.

> The full register semantics and the firmware's REU allocation are documented on [the C64 Ultimate page](c64-ultimate.md) and the Ultimate ReadTheDocs linked there. The appendices in this course cover the *stock* machine; `$DF00–$DFFF` appears in [appendix-b-memory-map.md](appendix-b-memory-map.md) only as the open expansion-port I/O #2 page.

#### EXCERPT — stash then fetch a block (assembles; needs a real/enabled REU to move data)

This compiles fine, but the **default headless VICE has no REU**, so it cannot be asserted here. It is shown, not verified. (In VICE you would enable `-reu` to actually exercise it.)

```asm
//----------------------------------------------------------------
// REU block move EXCERPT — NOT runnable on a plain/headless C64.
// Stash $1000 bytes from C64 $4000 to REU offset 0, then fetch
// them back to C64 $8000. Requires an REU to be present/enabled.
//----------------------------------------------------------------
.const REU_STATUS = $df00
.const REU_CMD    = $df01
.const REU_C64LO  = $df02
.const REU_C64HI  = $df03
.const REU_RLO    = $df04   // REU addr low
.const REU_RMID   = $df05   // REU addr mid
.const REU_RHI    = $df06   // REU addr high (24-bit)
.const REU_LENLO  = $df07
.const REU_LENHI  = $df08
.const REU_IRQMSK = $df09
.const REU_ADRCTL = $df0a

.const OP_STASH = %00        // C64 -> REU
.const OP_FETCH = %01        // REU -> C64
.const EXECUTE  = $80        // command bit 7

reu_stash:
        lda #$00            // C64 source low  ($4000)
        sta REU_C64LO
        lda #$40            // C64 source high
        sta REU_C64HI
        lda #$00            // REU dest = offset 0
        sta REU_RLO
        sta REU_RMID
        sta REU_RHI
        lda #$00            // length $1000 = 4096 bytes
        sta REU_LENLO
        lda #$10
        sta REU_LENHI
        lda #$00            // auto-increment both sides
        sta REU_ADRCTL
        lda #(EXECUTE | OP_STASH)
        sta REU_CMD         // <-- DMA happens here, CPU paused
        rts

reu_fetch:
        lda #$00            // C64 dest low  ($8000)
        sta REU_C64LO
        lda #$80            // C64 dest high
        sta REU_C64HI
        lda #$00            // REU source = offset 0
        sta REU_RLO
        sta REU_RMID
        sta REU_RHI
        lda #$00            // length $1000
        sta REU_LENLO
        lda #$10
        sta REU_LENHI
        lda #$00
        sta REU_ADRCTL
        lda #(EXECUTE | OP_FETCH)
        sta REU_CMD         // <-- DMA happens here
        rts
```

What you get for that handful of writes: a 4 KB copy in roughly one byte-per-cycle of DMA, while the 6510 is halted — orders of magnitude faster and smaller than a software copy loop. This is why REUs are used as scroll/back-buffer stores, decompression scratch, and streaming caches for big productions.

### GeoRAM

GeoRAM is a simpler, *non-DMA* expansion: it exposes a 16 KB window into a large RAM pool, paged through registers in the `$DE00` I/O #1 page. You `lda`/`sta` through the window yourself — no block engine. On the retail C64 Ultimate the memory is reserved but emulation is reported **pending** (tied to the bundled GEOS), so do not assume it is active yet; check [the C64 Ultimate page](c64-ultimate.md) for current status.

### The Ultimate Command Interface (UCI) — networking from 6502 code

The genuinely new capability is the **Ultimate Command Interface**: a memory-mapped command channel that lets a program *running on the C64* call into the firmware. Targets include Ultimate DOS (open/read/write files on SD/USB/disk images), **Network (open real TCP/UDP sockets)**, Control (reset, load-and-run, configure), Software IEC, and HTTP (issue HTTP requests).

The headline: with no extra hardware, your C64 program can be a real network client — open a socket, speak a protocol, fetch over HTTP. This is firmware-specific and not present on stock hardware, so it belongs behind a capability check. The practical libraries (xlar54's `ultimateii-dos-lib`, etc.) are linked from [the C64 Ultimate page](c64-ultimate.md).

### The host-side REST API — instant load-and-run

From your PC, the Ultimate exposes an **HTTP REST API**. The most useful route for development: `POST` a `.prg` to the runners endpoint and it **loads and runs instantly on real hardware** — no SD-card shuffling. There are also routes for reset/reboot, peek/poke, mounting disk images, and audio/video streaming over the LAN. From firmware 3.12+ an `X-Password` header authenticates.

#### This repo mirrors that loop locally

The Ultimate's "POST a prg, it runs" loop is exactly what this course's tooling does against the emulator (see [toolchain.md](toolchain.md)):

- **`tools/vice_run.py`** boots a `.prg` in headless VICE under `xvfb-run`, takes a screenshot, and can `--assert` memory/registers over VICE's binary monitor — the automated-verification analog of `peek` over the REST API.
- **`tools/vice_reload.py`** drives a *running* emulator via the binary monitor to autostart a fresh build or hot-swap memory in place — the live-reload analog of the REST runners endpoint.

So the mental model you build here (build → push → it runs, optionally poke/peek to verify) transfers verbatim to real Ultimate hardware; only the transport changes (binary monitor over TCP vs. HTTP REST over the LAN).

### VERIFICATION — a stock-clean program that detects "no REU" and stores a result

Because the default headless harness has no REU, the *correct* portable behavior is to **probe** and handle absence gracefully. A robust, side-effect-driven probe is hard to make deterministic without a real REU, so this runnable program does something fully deterministic on a plain C64: it reads the REU **command** register `$DF01` (open bus when no REU/cart is present), folds that into a capability flag, and stores a **known computed result** to `$0340`. It also sets the border so the screenshot is meaningful.

The arithmetic is fixed and does not depend on the open-bus value, so the asserted byte is deterministic: we compute `$2A + $11 = $3B` and store it to `$0340`. We separately store a "REU present?" guess to `$0341` (do not assert this one — open-bus contents are not guaranteed across machines).

```asm
//----------------------------------------------------------------
// 8.5 verification: deterministic compute + harmless REU probe.
// Runs on a PLAIN C64 (and on an Ultimate). No KERNAL bank-out,
// no IRQ takeover, so no special restore discipline is needed.
//
// Asserts:  $0340 == $3b   (deterministic: $2a + $11)
// Informational (do NOT assert): $0341 = naive REU-present guess.
//----------------------------------------------------------------
.const RESULT   = $0340
.const REUFLAG  = $0341
.const REU_CMD  = $df01      // open bus on a stock machine
.const BORDER   = $d020
.const SCREENBG = $d021

*=$0801
        BasicUpstart2(start)   // emits the "10 SYS 2061" BASIC stub

*=$0810
start:
        sei                    // we don't take over IRQs, but keep
                               // the probe atomic; CLI before the loop
        cld                    // clear decimal: arithmetic must be binary

        // --- deterministic computation we will assert ---
        lda #$2a
        clc
        adc #$11               // $2a + $11 = $3b
        sta RESULT             // -> $0340 = $3b

        // --- harmless REU probe (informational only) ---
        // A real REU's status/command region behaves; bare open bus
        // typically reads high bits set. We make a naive 0/1 guess:
        // if the low command bits read back as our written value, we
        // *might* have an REU. Stock machines won't latch it.
        lda #%00000001         // try to set FETCH bits (no execute!)
        sta REU_CMD            // bit7 clear -> no DMA is triggered
        lda REU_CMD            // read back
        and #%00000011         // isolate the op bits
        cmp #%00000001
        bne no_reu
        lda #$01               // looks like something latched
        jmp store_flag
no_reu:
        lda #$00               // no REU latched (stock / headless)
store_flag:
        sta REUFLAG            // -> $0341 (informational)

        // visible state for the screenshot
        lda #$00
        sta BORDER             // black border
        sta SCREENBG           // black background

        cli                    // restore interrupts before idling
hang:
        jmp *                  // park forever
```

Expected result: byte at **`$0340` is `$3B`**. The border and background are black (`$D020`/`$D021` low nibble `0`). On a plain or headless machine `$0341` reads `$00`; do not assert it.

You can run and assert it with the repo tooling (see [toolchain.md](toolchain.md)):

```
python tools/vice_run.py check lesson85.prg --assert $0340=$3b --screenshot out.png
```

> Important: we set the command register's **low** bits only and left **bit 7 (execute) clear**, so even if a real REU *is* present this probe never launches a DMA — it cannot corrupt memory. That is the right way to sniff for the device safely.

**Pitfalls**
- **Relying on turbo for timing.** Cycle-exact rasters/SID effects break under turbo. Validate at 1 MHz in `x64sc`; never hardcode an assumption that turbo is on.
- **Triggering a DMA by accident.** Writing `$DF01` with bit 7 set launches a transfer immediately and halts the CPU. When *probing*, keep bit 7 clear. When *using* the REU, make sure the C64 address, REU 24-bit address, and length are all set before the command write.
- **Length `$0000` means 65536, not 0.** A zero length is a full 64 KB transfer.
- **Assuming the REU/GeoRAM/UCI exist.** They are firmware features of the Ultimate family, absent on stock silicon. Probe at runtime and degrade gracefully if you want one binary to run everywhere. On the retail unit, GeoRAM emulation is reported pending.
- **Asserting open-bus reads.** `$DF00–$DFFF` reads are undefined without an REU/cartridge; never assert their contents in a portable test (hence `$0341` is informational only).
- **Stray data before `$0801`.** Keep state variables at fixed addresses with `.const`/explicit `*=`, never as `.byte` emitted ahead of the load address, or the BASIC stub/load address shifts.

**Go deeper:** Full hardware, UCI, REST API, and authoritative Ultimate documentation links are on [c64-ultimate.md](c64-ultimate.md); the build/deploy/verify loop and how `tools/vice_run.py` mirror the REST API are in [toolchain.md](toolchain.md). The `$DF00–$DFFF` expansion I/O page is listed in [appendix-b-memory-map.md](appendix-b-memory-map.md), and the opcodes used here are in [appendix-a-opcodes.md](appendix-a-opcodes.md).


---

*That's the curriculum. See [the index](README.md) and [CURRICULUM.md](CURRICULUM.md) for the whole map.*
