# Part I — 6502/6510 Assembly Foundations

The 6502/6510 in depth — the processor you'll write every demo and game in. Eleven lessons from the register model up through 16-bit math, data-driven techniques, illegal opcodes, optimization, and calling the KERNAL. All code is KickAssembler and assembles cleanly; the exhaustive tables live in the [appendices](appendix-a-opcodes.md).

**In this part:** 1.1 · 1.2 · 1.3 · 1.4 · 1.5 · 1.6 · 1.7 · 1.8 · 1.9 · 1.10 · 1.11

## 1.1 CPU model: registers & status flags

**Objectives**
- Name every register in the 6510 programming model and know how wide each one is.
- Read and write the `P` status register flag by flag, and know which instructions touch each flag.
- Understand reset state, why you `CLD` at startup, and where the stack lives.

### The 6510 is a 6502

The C64's CPU is the MOS 6510: a 6502 core with an extra on-chip 6-bit I/O port at `$0000/$0001` (used for ROM/RAM banking — covered later). For the programming model the two chips are identical, so every 6502 reference applies. It is an 8-bit machine: there is no hardware multiply, divide, or 16-bit arithmetic. You build everything wider than a byte out of 8-bit operations plus the carry flag.

### The registers

There are only a handful of registers, and that scarcity shapes all 6502 code.

| Register | Width | Role |
|---|---|---|
| `A` | 8-bit | Accumulator. The only register that can do arithmetic (`ADC`/`SBC`) and logic (`AND`/`ORA`/`EOR`). |
| `X` | 8-bit | Index register. Used to index addressing modes (`$nnnn,X`), loop counters, the `(zp,X)` indexed-indirect mode. |
| `Y` | 8-bit | Index register. Used to index (`$nnnn,Y`) and is the *only* register usable with `(zp),Y` indirect-indexed addressing — the workhorse for walking memory through a 16-bit zero-page pointer. |
| `SP` | 8-bit | Stack pointer. An offset into page 1, so the actual stack address is `$0100 + SP`. |
| `PC` | 16-bit | Program counter. The only 16-bit register; points at the next instruction byte. |
| `P` | 8-bit | Processor status. A bag of single-bit condition flags (see below). |

`A`, `X`, and `Y` are interchangeable for *loading and storing*, but only `A` does math, and `X`/`Y` differ in which addressing modes accept them. Because the index registers are 8-bit, an indexed table is naturally limited to 256 bytes; larger structures need `(zp),Y` indirection or self-modifying code.

#### The stack

The stack is a fixed 256-byte region, page 1 (`$0100–$01FF`). `SP` is just the low byte; the high byte is always `$01`. Pushes (`PHA`, `PHP`, and the implicit pushes done by `JSR`/`BRK`/interrupts) **decrement** `SP`; pulls (`PLA`, `PLP`, `RTS`, `RTI`) **increment** it. The CPU does *not* detect overflow or underflow — if you push 257 things you silently wrap around and corrupt page 1. You set the stack pointer with `TXS` (transfer `X` to `SP`) and read it with `TSX`; note `TXS` does *not* affect any flags, while `TSX` sets `N` and `Z`.

### The P status register

`P` holds seven meaningful flag bits laid out as `N V - B D I Z C` from bit 7 down to bit 0. Bit 5 (the `-`) is unused and reads as 1. Most flags are set as a side effect of ordinary instructions; you rarely manipulate them all at once except through `PHP`/`PLP` or interrupt entry/exit.

| Bit | Flag | Meaning | Typically set/cleared by |
|---|---|---|---|
| 7 | **N** Negative | Copy of bit 7 of the last result (so a "signed-negative" value sets it). | Almost every load/arithmetic/logic/inc/dec op, and the transfers `TAX/TAY/TXA/TYA/TSX`, `PLA`, `PLP`, `CMP/CPX/CPY`, `BIT` (from `M7`). |
| 6 | **V** Overflow | Signed overflow from `ADC`/`SBC`; also loaded from `M6` by `BIT`. | `ADC`, `SBC`, `BIT`; cleared by `CLV`; restored by `PLP`/`RTI`. There is *no* `SEV`. |
| 5 | — | Unused; reads as 1. | — |
| 4 | **B** Break | Not a real register bit — it only exists in the *copy of P pushed on the stack*. `BRK` pushes it as 1, a hardware IRQ pushes it as 0, which is how a handler tells them apart. | `BRK` vs. IRQ entry. Ignored when pulled by `PLP`/`RTI`. |
| 3 | **D** Decimal | When 1, `ADC`/`SBC` operate in BCD (binary-coded decimal) instead of binary. | `SED` sets it, `CLD` clears it; restored by `PLP`/`RTI`. |
| 2 | **I** Interrupt disable | When 1, maskable IRQs are blocked. | `SEI` sets it, `CLI` clears it; the CPU sets it automatically on IRQ/`BRK` entry; restored by `RTI`. |
| 1 | **Z** Zero | 1 when the last result was zero (or, for compares, when the operands were equal). | Same broad set as `N`: loads, arithmetic, logic, inc/dec, transfers, `PLA`, `PLP`, `CMP/CPX/CPY`, `BIT`. |
| 0 | **C** Carry | Unsigned carry-out from `ADC` / borrow-not from `SBC`; the bit shifted out by `ASL/LSR/ROL/ROR`; for compares, 1 when register ≥ operand. | `ADC`, `SBC`, the shifts/rotates, `CMP/CPX/CPY`; explicitly `SEC`/`CLC`; restored by `PLP`/`RTI`. |

Key consequences for everyday code:

- **`Z` and `N` are set by far more than just comparisons.** `LDA #$00` sets `Z`; `LDX #$80` sets `N`. You can branch right after a load without an explicit compare.
- **Carry is an explicit input to add/subtract.** `CLC` before an `ADC` chain, `SEC` before an `SBC` chain — see [Appendix A](appendix-a-opcodes.md).
- **`STA`/`STX`/`STY` and the transfer `TXS` change no flags.** Storing a value never updates `Z`/`N`.

### Reset state and why you CLD

On a hardware RESET the CPU does **not** zero `A`, `X`, or `Y` — their contents are undefined. What reset *does* guarantee is that the interrupt-disable flag `I` is set, and the CPU fetches `PC` from the RESET vector at `$FFFC/$FFFD`. The decimal flag `D` is **not** reliably cleared by reset on the NMOS 6502/6510, so the very first thing defensive code does is `CLD`. If `D` is accidentally left set, every `ADC`/`SBC` you write will silently produce BCD results instead of binary ones — a maddening bug.

In practice, when your program is started from BASIC via `RUN`/`SYS` the KERNAL has already left `D` clear and `I` clear, so a BasicUpstart2 program often runs fine without `CLD`. But it costs two cycles and removes all doubt, so make it a habit at the top of any routine that does arithmetic. The stack pointer is left wherever the KERNAL had it (typically near `$FF`); if you fully take over the machine you may reset it yourself with `LDX #$FF : TXS`.

### Example: flags as a side effect of a load

```asm
*=$0801
BasicUpstart2(start)          // emits the BASIC "10 SYS 2061" stub

*=$0810
start:
        cld                   // clear decimal mode (defensive; see reset notes)

        lda #$00              // load 0 into A -> Z is set, N is clear
        beq zero_path         // BEQ branches because Z=1...
        // (not reached)

zero_path:
        lda #$80              // load $80 -> bit7 set, so N is set, Z is clear
        bmi neg_path          // BMI branches because N=1
        // (not reached)

neg_path:
        lda #$05
        sta $fb              // STA changes NO flags; $fb still reflects the LDA
        ldx $fb              // LDX from memory: sets N/Z from the loaded value

loop:   jmp loop             // park here
```

Notice that the `STA $fb` in the middle does not disturb `N`/`Z` — only the surrounding loads do.

### Example: carry as an input, and saving P across a routine

```asm
// 16-bit add: result = a + b, all in zero page. Demonstrates the carry chain.
.const a = $fb               // 2 bytes: $fb (lo) / $fc (hi)
.const b = $fd               // 2 bytes: $fd (lo) / $fe (hi)

add16:
        clc                  // clear carry BEFORE the low byte add
        lda a
        adc b                // A = a_lo + b_lo, C = carry-out
        sta a
        lda a+1
        adc b+1              // high byte adds in the carry from the low byte
        sta a+1              // (no CLC here -- we WANT the propagated carry)
        rts

// Preserving the caller's flags around a subroutine:
some_isr:
        pha                  // save A
        php                  // save P (the pushed copy has B=1, ignored on PLP)
        // ... do work that clobbers A and flags ...
        plp                  // restore P exactly as it was
        pla                  // restore A
        rti                  // RTI pulls P then PC (it does not add 1 like RTS)
```

**Pitfalls**
- Forgetting `CLD`: a stray decimal flag turns `ADC`/`SBC` into BCD math. There is no compile-time warning.
- Treating `STA`/`STX`/`STY` as if they set `Z`/`N`. They do not — branch on the load/op that produced the value, not on the store.
- Forgetting to set carry correctly: `CLC` before an add chain, `SEC` before a subtract chain. `ADC`/`SBC` always fold the current `C` in.
- Assuming `B` is a readable register bit. It only appears in the pushed copy of `P`; `PHP`/`BRK` push it as 1, IRQ pushes 0, and `PLP`/`RTI` ignore it.
- The stack is only 256 bytes at `$0100–$01FF` and never grows. Deep `JSR` nesting plus pushes can wrap silently and corrupt it.
- Reset leaves `A`/`X`/`Y` undefined — never assume they are zero at program start.

**Go deeper:** MOS/6502 programming model and per-instruction flag effects — [Appendix A](appendix-a-opcodes.md); for where the stack, zero page, and vectors live in the address space, see [Appendix B](appendix-b-memory-map.md).

## 1.2 Addressing modes

**Objectives**

- Recognise all thirteen 6502 addressing modes and the KickAssembler syntax for each.
- Know when to reach for `(zp),Y` (pointer walking) versus `abs,X` (table indexing).
- Understand the page-cross +1-cycle penalty and where it does and does not apply.

### What an addressing mode is

An addressing mode is how an instruction decides *where its operand comes from*. The same logical operation (say "load A") has several opcodes, one per supported mode — `lda #$05` (A9) and `lda $0400` (AD) are different machine instructions. The 6502 has thirteen modes; the operand size (0, 1, or 2 extra bytes) follows directly from the mode, which is why instruction length varies from 1 to 3 bytes.

KickAssembler picks the right opcode from the operand syntax you write. The mode is encoded in punctuation: `#` means immediate, a bare value means an address, `,X`/`,Y` add an index register, and parentheses mean indirection (the value found at that address is itself an address).

### The non-indexed modes

#### Implied — operand is built into the opcode

The instruction has no operand byte; the registers/flags it touches are fixed. Use it for register-only and flag operations.

```asm
inx        // X = X + 1
clc        // clear carry, e.g. before an ADC chain
rts        // return from subroutine
```

#### Accumulator — operate on A itself

A special form of "implied" for the shift/rotate group, written with no operand (or an explicit `A`). Use it to shift/rotate the value already in A.

```asm
asl        // A = A << 1, bit 7 -> carry
lsr        // A = A >> 1, bit 0 -> carry
```

#### Immediate — the operand byte IS the value

Written with `#`. Use it for constants. Forgetting the `#` is the single most common 6502 bug (see Pitfalls).

```asm
lda #$05      // A = 5  (the literal byte 5)
and #%00001111  // mask off the high nibble
cmp #'A'      // compare A against the PETSCII code for 'A'
```

#### Zero page — a one-byte address in `$00`–`$FF`

Written as an 8-bit address. Faster and shorter than absolute (one fewer byte, one fewer cycle: `lda $nn` is 3 cycles vs 4 for `lda $nnnn`). Use it for hot variables and pointers. On the C64, much of zero page is used by BASIC/KERNAL, but a handful of bytes are free for your code.

```asm
lda $fb       // load the byte at $00FB (a free zero-page byte)
sta $02       // store to $0002
```

#### Absolute — a full two-byte address

Written as a 16-bit address. The default for anything outside zero page: hardware registers, screen RAM, code labels.

```asm
lda $d012     // read the current raster line
sta $0400     // write to the top-left screen cell
jmp loop      // a label resolves to an absolute address
```

### Indexed modes — address + register offset

#### Zero page,X and zero page,Y

Effective address = (zero-page base + index), wrapped within zero page. `zp,Y` exists only for `LDX`/`STX` (and a few illegals); everything else uses `zp,X`. Use for small (≤256-byte) tables held in zero page.

```asm
lda $fb,x     // load from ($FB + X), still in zero page
```

#### Absolute,X and absolute,Y — the workhorse for tables

Effective address = (16-bit base + index). This is *the* mode for stepping through arrays and screen/colour RAM. You hold the table's start address in the instruction and walk it with X or Y.

```asm
lda table,x   // table[X]
sta $0400,x   // screen[X]
```

Reads in `abs,X`/`abs,Y` cost a base 4 cycles **+1 if the effective address crosses a 256-byte page** (the `*` in Appendix A). Stores always pay the full 5 cycles regardless. More on this below.

### Indirect modes — the value at an address is an address

#### Indirect (JMP only)

`JMP ($nnnn)` reads a 16-bit pointer from `$nnnn`/`$nnnn+1` and jumps there. Use it for jump tables and re-routable vectors. This is the only instruction with plain absolute-indirect mode.

```asm
jmp ($0314)   // jump through the IRQ vector stored at $0314/$0315
```

#### Indexed-indirect — `(zp,X)`

Effective address = the 16-bit pointer read from zero page at (`zp` + X), wrapped in zero page. The index is added *before* the indirection. It is rarely used on the C64; its niche is selecting one pointer from a small table of pointers in zero page (X = entry × 2).

```asm
lda ($02,x)   // pointer = word at ($02 + X); load from that pointer
```

#### Indirect-indexed — `(zp),Y` — the workhorse for pointers

Effective address = the 16-bit pointer read from `zp`/`zp+1`, **then** Y is added. This is the canonical way to dereference and walk a pointer: store a 16-bit address in two consecutive zero-page bytes (low byte first — the 6502 is little-endian) and index into it with Y.

```asm
.const ptr = $fb
        lda #<source   // low byte of address
        sta ptr
        lda #>source   // high byte
        sta ptr+1
        ldy #$00
        lda (ptr),Y    // load source[Y] through the pointer
```

Because Y is only 8 bits you can reach 256 bytes per pointer; to cross that boundary you increment `ptr+1`. Read forms cost a base 5 cycles **+1 on page cross**; stores (`STA (ptr),Y`) always cost 6.

### Relative — branches only

Branch instructions (`BCC`, `BNE`, `BEQ`, …) take a single signed byte: a −128…+127 offset from the address of the *next* instruction. You write a label and KickAssembler computes the offset, erroring if the target is out of reach. Use it for all conditional control flow; for longer jumps, branch over a `JMP`.

```asm
        ldx #$00
loop:   inx
        cpx #$10
        bne loop      // branch back while X != $10 (range -128..+127)
```

Branch timing is 2 cycles if not taken, 3 if taken, 4 if taken to a different page (the `**` notation in Appendix A).

### The page-cross penalty

A "page" is a 256-byte block (`$xx00`–`$xxFF`). When an indexed read forms an effective address whose high byte differs from the base's high byte, the CPU spends one extra cycle fixing up the high byte. It applies to **reads** in `abs,X`, `abs,Y`, and `(zp),Y`. It never applies to writes, to read-modify-write instructions, or to zero-page-indexed modes (which wrap instead of crossing). In tight raster code you avoid the variable cost by aligning tables so a loop never straddles a page boundary. Defer the exact per-instruction counts to Appendix A.

### A complete, runnable example

This program fills the top row of the screen using `abs,X` (table indexing) and then walks a string through a zero-page pointer with `(zp),Y` (pointer walking), demonstrating both workhorse modes plus immediate, absolute, relative, and implied modes together.

```asm
*=$0801
        BasicUpstart2(start)   // emits the SYS 2061 BASIC stub

*=$0810
.const SCREEN = $0400
.const ptr    = $fb            // two free zero-page bytes: $fb/$fc

start:  // 1) abs,X: write 16 chars from a table into screen RAM
        ldx #$00               // immediate: X = 0
fill:   lda chars,X            // abs,X: chars[X]  (read, may cross a page)
        sta SCREEN,X           // abs,X store: always full cost, no penalty
        inx                    // implied
        cpx #16                // immediate compare
        bne fill               // relative branch back while X != 16

        // 2) (zp),Y: print a message through a pointer
        lda #<message          // low byte of address
        sta ptr
        lda #>message          // high byte of address
        sta ptr+1
        ldy #$00
walk:   lda (ptr),Y            // indirect-indexed: message[Y]
        beq done               // 0 byte terminates the string
        sta SCREEN+40,Y        // abs,Y store into the second screen row
        iny                    // implied
        bne walk               // relative (Y wraps at 256, ends loop)
done:   rts                    // implied: back to BASIC

chars:  .fill 16, i            // bytes 0,1,2,...,15 (screen codes)
message:
        .byte 8, 5, 12, 12, 15 // screen codes for "HELLO"
        .byte 0                // terminator
```

**Pitfalls**

- Dropping the `#` turns a constant into an address: `LDA 5` loads from `$0005`, not the value 5. This assembles cleanly and is a classic silent bug.
- Pointers in zero page are little-endian: low byte at `ptr`, high byte at `ptr+1`. Swap them and `(ptr),Y` reads from the wrong place.
- `(zp,X)` and `(zp),Y` are different modes: the parenthesis placement is load-bearing. `(zp,X)` adds X *inside* the indirection; `(zp),Y` adds Y *after* it. You almost always want `(zp),Y`.
- `zp,X`/`zp,Y` wrap within zero page rather than crossing into `$0100`: `LDA $f0,X` with X=`$20` reads `$10`, not `$0110`.
- The page-cross penalty applies to indexed *reads* only; stores and read-modify-write always pay the full count. Do not budget a "free" cycle on `STA $nnnn,X`.
- `JMP ($xxFF)` hits the NMOS indirect-vector page-wrap bug (high byte fetched from `$xx00`). Keep `JMP (ind)` vectors off a page boundary.
- Branch range is only −128…+127 from the following instruction; KickAssembler will error on an out-of-range branch — restructure with a `JMP`.

**Go deeper:** see [Appendix A](appendix-a-opcodes.md) for per-instruction opcodes, byte counts, and exact cycle costs including the `*` page-cross and `**` branch notation.

## 1.3 The instruction set by group

**Objectives**

- Recognise the 6510's documented instructions organised by what they do, not by alphabet.
- Know the flag side effects and ordering traps that bite newcomers (carry before `ADC`/`SBC`, `CMP` setting carry, branch direction).
- Be able to read and write small KickAssembler routines that combine loads, arithmetic, comparisons, branches and subroutines.

### Why group the instructions?

The 6510 has only 56 documented mnemonics, and most of them fall into a handful of jobs: move bytes around, do arithmetic or logic, change a counter, test something, and then either branch or call based on the result. Once you see the groups, the chip stops looking like a random list of three-letter codes and starts looking like a small toolbox.

This lesson is a guided tour. It does **not** restate cycle counts, opcode bytes, or addressing-mode tables — those live in [Appendix A](appendix-a-opcodes.md) and are the source of truth. What it adds is *why* and *when* you reach for each group, plus the gotchas that the tables alone won't warn you about.

Two things to keep in front of you while reading:

- The 6510 has three data registers: the accumulator **A** (the only register that can do arithmetic/logic), and two index registers **X** and **Y** (mainly for counting and indexing). Plus the stack pointer **SP** and the processor status register **P** holding the flags.
- The flags that matter most are **N** (negative = bit 7 of the last result), **Z** (zero = last result was 0), **C** (carry/borrow), and **V** (signed overflow). Almost every group below changes some subset of these, and the branches read them.

### Load / store: moving bytes

`LDA`/`LDX`/`LDY` copy a byte from memory (or an immediate constant) into a register; `STA`/`STX`/`STY` copy a register back to memory. Loads set **N** and **Z** from the value loaded. Stores affect **no flags** at all.

```asm
            lda #$05        // A = 5         (immediate; sets Z=0, N=0)
            ldx $d012       // X = raster line (zero-page-ish abs read)
            sta $0400       // screen RAM <- A; flags untouched
            ldy #$00        // Y = 0         (sets Z=1 because value is zero)
```

A subtle point that trips up C newcomers: a store does not tell you anything about the value stored. If you need to know whether the value was zero, you must test it *before* (or with the load), because `STA` leaves the flags as they were.

### Register transfers: shuffling between registers

`TAX TAY TXA TYA` copy between A and an index register (these set N/Z from the moved value). `TSX` copies SP into X, and `TXS` copies X into SP — `TXS` is the only transfer that does **not** touch the flags, because it is how you set up the stack.

```asm
            ldx #$ff
            txs             // SP = $FF: stack reset to top of page 1. No flags changed.
            lda count
            tay             // Y = A, and N/Z reflect the value just copied
```

### Stack: PHA / PLA / PHP / PLP

The stack is a fixed 256-byte region in page 1 (`$0100–$01FF`); SP is just an offset into it. `PHA` pushes A, `PLA` pulls it back (and sets N/Z). `PHP` pushes the flags, `PLP` restores them. The classic use is saving registers at the top of an interrupt handler and restoring them before returning.

```asm
            pha             // save A
            txa
            pha             // save X (via A)
            // ... do work that clobbers A and X ...
            pla
            tax             // restore X
            pla             // restore A (note the reverse order!)
```

The CPU does **not** check for overflow or underflow — push more than you pull and you silently corrupt page 1. Order matters: pulls come back in the reverse order of pushes.

### Arithmetic: ADC and SBC (and the carry)

The 6510 has no plain "add" or "subtract" — only *add/subtract with carry*. `ADC` computes `A + M + C`; `SBC` computes `A − M − (1−C)`. This is what lets you chain bytes into multi-byte numbers, but it means you must **set the carry up first**:

- Before an addition: **`CLC`** (clear carry) so nothing extra is added.
- Before a subtraction: **`SEC`** (set carry) so no spurious borrow is taken.

Forgetting this is the single most common 6502 bug. Both instructions set N, Z, C and V.

```asm
            // 16-bit add: result = a16 + b16, all stored low byte first
            clc             // REQUIRED: start the chain with carry clear
            lda a16+0
            adc b16+0
            sta result+0    // low byte; carry now holds the carry-out
            lda a16+1
            adc b16+1       // adds the carry from the low byte
            sta result+1    // high byte

            // 16-bit subtract: result = a16 - b16
            sec             // REQUIRED: start with carry set (= no borrow)
            lda a16+0
            sbc b16+0
            sta result+0
            lda a16+1
            sbc b16+1
            sta result+1
```

After a subtract, **C=1 means no borrow occurred** (the result was non-negative). Decimal mode (`SED`) changes `ADC`/`SBC` to BCD; you almost never want it on the C64, so keep `D` cleared with `CLD`.

### Logic: AND / ORA / EOR / BIT

`AND`, `ORA`, `EOR` are the bitwise operators on A (set N/Z). Typical uses: `AND` to mask bits off, `ORA` to set bits on, `EOR` to toggle bits (`EOR #$ff` inverts a byte; `EOR` against itself is a common "is this register a known value" trick).

`BIT` is special: it ANDs A with memory **only to set the Z flag** (A is not changed), and it copies bit 7 of the memory byte into **N** and bit 6 into **V**. That makes it perfect for polling a hardware status bit without disturbing A.

```asm
            lda spritebits
            and #%00000001  // keep only sprite-0 enable bit
            ora #%10000000  // force bit 7 on
            eor #%11111111  // invert every bit

            bit $d011       // test VIC control reg: N <- bit7, V <- bit6, Z <- (A & it)
            bmi rasterHigh  // bit 7 (RST8) was set -> branch (uses N)
```

### Increment / decrement

`INC`/`DEC` add or subtract 1 directly in memory (read-modify-write, so they are slower — see [Appendix A](appendix-a-opcodes.md)). `INX INY DEX DEY` do the same to the index registers. All set N/Z. None touch the carry, so you cannot chain them across bytes the way `ADC` does. They wrap modulo 256: `$FF + 1 = $00` (sets Z), `$00 − 1 = $FF` (sets N).

```asm
            ldx #$00
loop:       lda source,x
            sta dest,x
            inx
            cpx #16         // compare X with 16
            bne loop        // not yet 16? go again
```

### Shifts and rotates

`ASL` shifts left (bit 7 falls into carry, a 0 enters bit 0 — effectively a multiply by 2). `LSR` shifts right (bit 0 falls into carry, 0 enters bit 7 — an unsigned divide by 2; N is always cleared). `ROL`/`ROR` rotate *through* the carry, so the old carry becomes the incoming bit — this is how you shift multi-byte values. All four can operate on A directly or on memory, and all set N, Z, C.

```asm
            // 16-bit shift left of value16 (low,high)
            asl value16+0   // bit7 -> carry, 0 -> bit0
            rol value16+1   // carry -> bit0, bit7 -> carry

            lsr             // divide A by 2, remainder ends up in carry
```

### Compare: CMP / CPX / CPY

A compare is an internal subtraction (`register − operand`) that **throws away the result and only sets flags** — the register is unchanged. The flag rules (from [Appendix A](appendix-a-opcodes.md)):

- **C = 1** when register ≥ operand (unsigned).
- **Z = 1** when they are equal.
- **N** comes from bit 7 of the subtraction result.

So after a compare you branch with `BEQ`/`BNE` for equality and `BCS`/`BCC` for unsigned ≥ / <. Note the asymmetry with `ADC`/`SBC`: you do **not** clear or set carry before `CMP`; the compare establishes the carry itself.

```asm
            lda level
            cmp #$0a
            bcc below       // level < 10  (carry clear)
            beq exactly     // level == 10 (zero set)
            // falls through: level > 10
```

### Branches

The eight conditional branches each read one flag and jump a signed −128…+127 bytes from the *next* instruction. They affect no flags themselves.

| Branch | Taken when | Common reading |
|---|---|---|
| `BEQ` / `BNE` | Z=1 / Z=0 | equal / not-equal (after CMP), or result was/wasn't zero |
| `BCS` / `BCC` | C=1 / C=0 | unsigned ≥ / < (after CMP), or carry out of ADC/shift |
| `BMI` / `BPL` | N=1 / N=0 | result negative / non-negative (bit 7 set/clear) |
| `BVS` / `BVC` | V=1 / V=0 | signed overflow set/clear |

Because the offset is limited to ±127 bytes, a branch can only reach nearby code. For longer distances, branch over a `JMP` (the "branch-around-jump" idiom). The penalty for crossing a page when taken is in [Appendix A](appendix-a-opcodes.md).

```asm
            lda flag
            bne near        // close enough: direct branch
            jmp far_away    // ... but if the target were far, do this:
near:
            // 6502 has no "BGT"/"BLT" - you synthesise them from BCC/BCS/BEQ
```

### Jumps and subroutines

`JMP` is an unconditional goto (absolute, or indirect through a pointer — beware the `JMP ($xxFF)` page-wrap bug noted in [Appendix A](appendix-a-opcodes.md)). `JSR` calls a subroutine by pushing the return address; `RTS` pops it and returns. `RTI` returns from an interrupt and additionally restores the flags. None of these affect the data flags.

```asm
            jsr clearScreen   // pushes return address, jumps to routine
            // execution resumes here after RTS
            rts

clearScreen:
            ldx #$00
            lda #$20          // PETSCII space
!loop:      sta $0400,x
            sta $0500,x
            sta $0600,x
            sta $0700,x
            inx
            bne !loop-        // loop until X wraps to 0 (256 iterations)
            rts
```

`JSR` pushes the address of its *last byte*, and `RTS` adds 1 on return — you rarely need to care, but it explains the "+1" you'll see described in the appendix. You can also push a hand-built address and `RTS` to it (the "RTS trick") for computed jumps.

### Status-flag instructions

These one-byte instructions directly poke a flag: `CLC`/`SEC` (carry), `CLI`/`SEI` (interrupt-disable), `CLD`/`SED` (decimal), and `CLV` (clear overflow only — there is no `SEV`). The ones you'll use constantly are `CLC`/`SEC` (arithmetic setup, above) and `SEI`/`CLI` (around code that installs its own interrupt handler or must not be interrupted).

```asm
            sei             // block IRQs while we reconfigure interrupts
            // ... install raster IRQ vector ...
            cli             // allow IRQs again
```

### NOP and BRK

`NOP` does nothing for 2 cycles — useful for fine timing or alignment padding. `BRK` forces a software interrupt through the vector at `$FFFE/$FFFF`; it is a debugging/trap instruction, not something you place in normal code. As [Appendix A](appendix-a-opcodes.md) notes, `BRK` pushes `PC+2`, so it effectively skips the byte after it (treat that byte as a signature) and sets B=1 in the pushed status so a handler can tell a `BRK` from a real IRQ.

### A complete program tying it together

```asm
*=$0801
            BasicUpstart2(start)    // emits the "10 SYS 2061" BASIC line

*=$0810
start:
            lda #$00
            sta sum+0               // sum = 0 (16-bit, low byte first)
            sta sum+1
            ldx #$00                // X = index / counter

addLoop:
            clc                     // carry clear before each add step
            lda sum+0
            adc data,x              // sum.low += data[x]
            sta sum+0
            lda sum+1
            adc #$00                // fold the carry into the high byte
            sta sum+1

            inx
            cpx #$05                // processed all 5 bytes?
            bne addLoop             // no -> repeat (BNE reads Z from CPX)

            lda sum+0               // show low byte of the total in screen RAM
            sta $0400
            rts                     // back to BASIC

data:       .byte 10, 20, 30, 40, 50   // 5 values; total = 150 = $96
sum:        .word 0                    // 16-bit accumulator
```

Assemble and run this in VICE (`kickass prog.asm` then `x64 prog.prg`); `$0400` will hold `$96`. Notice every group at work: load/store moves the bytes, `CLC`+`ADC` does carrying arithmetic, `INX`/`CPX`/`BNE` form the loop, and `RTS` returns to BASIC.

**Pitfalls**

- **Arithmetic carry setup is mandatory.** Always `CLC` before an `ADC` chain and `SEC` before an `SBC` chain. Compares are the opposite — never set carry before `CMP`; the compare defines it.
- **After `SBC`/`CMP`, carry means "no borrow".** `C=1` ⇒ result ≥ 0 (or register ≥ operand). It's easy to read it backwards.
- **Stores and `TXS` change no flags.** Don't expect `STA`/`STX`/`STY` to tell you if a value was zero; test before storing.
- **`INC`/`DEC`/`INX`… don't touch carry**, so they can't carry into a second byte — use `ADC #$00` for multi-byte counters.
- **Branches only reach ±127 bytes.** A "branch out of range" error means you need a branch-around-`JMP`. There are no signed greater/less branches — synthesise them from `BCC`/`BCS`/`BEQ`/`BMI`.
- **The stack is unguarded** and lives in `$0100–$01FF`. Unbalanced `PHA`/`PLA` (or `JSR` without matching `RTS`) corrupts it; pull in reverse order of pushing.
- **`LSR` always clears N**, and `ROL`/`ROR` move through carry — set carry deliberately before a rotate if the incoming bit matters.
- **Avoid the illegal opcodes** (and never execute a `JAM`/`KIL` byte) until you specifically understand them; stick to the documented set while learning.

**Go deeper**: full opcode bytes, addressing modes, cycle counts and the illegal-opcode catalogue are in [Appendix A](appendix-a-opcodes.md); flag and timing nuances such as page-cross and branch penalties are in [Appendix H](appendix-h-timing.md).

## 1.4 Memory map & banking

**Objectives**

- Know what lives where in the 6510's `$0000-$FFFF` address space (zero page, stack, screen, BASIC RAM, ROMs, I/O).
- Understand how the 6510 processor port at `$00`/`$01` banks BASIC ROM, KERNAL ROM, I/O, and Character ROM in and out.
- Be able to switch to a useful config (e.g. `$35`) to reclaim the RAM hidden under the ROMs.
- Know that the VIC-II sees only a 16K *bank* selected by CIA2, while Color RAM is fixed at `$D800`.

### The big picture

The 6510 has a flat 64 KB address space. The catch is that **64 KB of RAM, the ROMs, and the I/O chips all share the same addresses**. What you actually see at `$A000-$BFFF`, `$D000-$DFFF`, and `$E000-$FFFF` is decided at runtime by three bits in the processor port. RAM physically exists *everywhere* underneath; a write to a banked-out ROM address falls through to the hidden RAM (a write where I/O is banked in hits the I/O register instead).

A working mental model of the default layout (`$01 = $37`):

| Range | What | Notes |
|---|---|---|
| `$0000-$00FF` | Zero page | `$00`/`$01` = 6510 port; fast addressing modes live here |
| `$0100-$01FF` | Stack | Hardware stack, grows downward; `JSR`/`PHA`/IRQ use it |
| `$0200-$03FF` | OS work area | Input buffer, KERNAL vectors (`$0314-$0319`) |
| `$0400-$07E7` | Screen RAM | Default 40x25 video matrix (1000 bytes) |
| `$0800-$9FFF` | BASIC RAM | 38 KB; free for your machine code once BASIC is out of the way |
| `$A000-$BFFF` | BASIC ROM | …or RAM, banked by `$01` |
| `$C000-$CFFF` | Free RAM | 4 KB never touched by BASIC/KERNAL — always available |
| `$D000-$DFFF` | I/O | …or Character ROM, or RAM, banked by `$01` |
| `$E000-$FFFF` | KERNAL ROM | …or RAM, banked by `$01` |

The full table, including the I/O sub-blocks (VIC `$D000`, SID `$D400`, Color RAM `$D800`, CIA1 `$DC00`, CIA2 `$DD00`) and key zero-page pointers, is in [Appendix B](appendix-b-memory-map.md). Don't memorize it — bookmark it.

### Three regions that are NOT RAM by default

Three things in particular cost you address space until you bank them out:

- **`$A000-$BFFF` — BASIC ROM** (8 KB). You almost never call BASIC from assembly, so this is the easiest 8 KB to reclaim.
- **`$E000-$FFFF` — KERNAL ROM** (8 KB). Contains the OS routines (see [Appendix F](appendix-f-kernal-basic.md)) *and* the CPU hardware vectors at `$FFFA-$FFFF`. Bank it out only when you've taken over IRQ/NMI/RESET yourself.
- **`$D000-$DFFF` — I/O** (4 KB). This is where VIC-II, SID, Color RAM, and the two CIAs live. You usually *want* this visible. The same window can instead show the 4 KB **Character ROM** (the font), which is otherwise invisible.

### The 6510 processor port: `$00` and `$01`

The 6510 has a built-in 6-bit I/O port. `$0000` is its data-direction register (DDR), `$0001` is the port itself. On a running C64 the DDR is `$2F` so the relevant bits are outputs; you normally leave `$00` alone and just write `$01`.

Three bits of `$01` do the banking:

| Bit | Name | 1 means | 0 means |
|---|---|---|---|
| 0 | LORAM | BASIC ROM at `$A000` | RAM there |
| 1 | HIRAM | KERNAL ROM at `$E000` | RAM there |
| 2 | CHAREN | I/O at `$D000` | Character ROM there* |

\*CHAREN only selects the *Character ROM* while LORAM or HIRAM is 1. If both LORAM and HIRAM are 0, CHAREN instead picks I/O (=1) vs RAM (=0) at `$D000`. Bits 3-5 are the cassette lines, which is why the common values appear in `$3x` form.

The configs you will actually use:

| `$01` | `$A000-$BFFF` | `$D000-$DFFF` | `$E000-$FFFF` | When |
|---|---|---|---|---|
| `$37` | BASIC ROM | I/O | KERNAL ROM | **Default.** BASIC + KERNAL + I/O all visible |
| `$35` | RAM | I/O | RAM | Most common ML setup: RAM under BASIC & KERNAL, keep VIC/SID/CIA |
| `$34` | RAM | I/O | RAM | Like `$35`, also Char ROM banked the same; effectively all-RAM + I/O |
| `$33` | BASIC ROM | Char ROM | KERNAL ROM | Read the font from `$D000` |
| `$30` | RAM | RAM | RAM | All 64 KB RAM, no I/O — pure RAM access |

`$35` is the workhorse: you get the 8 KB under BASIC and the 8 KB under KERNAL as free RAM (on top of the always-free `$C000-$CFFF`), while VIC, SID and the CIAs stay reachable at `$D000`. The full eight-value table is in [Appendix B](appendix-b-memory-map.md).

> Zero page (`$00`/`$01`) and the stack page (`$0100-$01FF`) are *always* RAM. You can never bank them out.

### Switching the bank

The mechanics are a single store:

```asm
        lda #$35
        sta $01            // RAM under BASIC+KERNAL, I/O still visible
```

If you are going to bank out the KERNAL (clearing HIRAM, e.g. `$35`, `$34`, `$30`), disable interrupts first. The KERNAL's IRQ handler lives in the ROM you're about to hide; if an interrupt fires while it's gone, the CPU jumps through `$FFFE/$FFFF` into whatever RAM is now there and crashes. With I/O still banked in (`$35`) you must take over the IRQ vector before re-enabling; with I/O banked out (`$30`) the VIC/CIA registers vanish too, so keep IRQs off the whole time.

### Reading the Character ROM

A classic reason to bank: copying the font out of Character ROM so you can edit it. The font is only visible when CHAREN=0, which also removes I/O — so do it with interrupts off and restore immediately.

```asm
*=$0801
BasicUpstart2(main)             // SYS 2061 stub

*=$0900
main:
        sei                     // no IRQs while KERNAL/I-O state is unusual
        lda #$33                // BASIC ROM + Char ROM + KERNAL ROM
        sta $01                 // now $D000-$DFFF = 4 KB Character ROM

        ldx #$00
copy:
        lda $d000,x             // uppercase/graphics font, page 0
        sta $3000,x             // stash into free RAM at $3000
        lda $d100,x
        sta $3100,x
        inx
        bne copy                // 256 iterations (one page each)

        lda #$37                // restore default: I/O back, ROMs back
        sta $01
        cli
        rts
```

While `$01 = $33`, `$D000` is the font, not the VIC — reads/writes there do not touch video registers. After restoring `$37`, `$D000` is the VIC-II again. (`$3000` is ordinary BASIC RAM here, chosen to avoid clobbering the screen at `$0400`.)

### The VIC sees a different memory than the CPU

The CPU's `$01` banking does **not** affect the VIC-II. The VIC has its own 14-bit address bus and can see only one **16 KB bank** at a time. Which bank is chosen by the low two bits of **CIA2 port A at `$DD00`** (inverted): the four banks are `$0000`, `$4000`, `$8000`, `$C000`. So when you place screen RAM, sprites, or a custom charset, they must live inside the VIC's current 16 KB bank — independent of where the CPU thinks RAM and ROM are. (Bank/charset/screen pointer details belong to the VIC lessons.)

One important exception: **Color RAM is hardwired at `$D800-$DBE7`** (1000 nybbles, low 4 bits only). It is not part of the VIC bank and not affected by CIA2 — it is always at `$D800` for the CPU regardless of which 16 KB bank the VIC reads. See [Appendix B](appendix-b-memory-map.md) and [Appendix E](appendix-e-cia-registers.md).

### Pitfalls

- **Banking out the KERNAL without `sei`.** An IRQ then jumps through `$FFFE/$FFFF` into RAM garbage and hangs. Disable interrupts before clearing HIRAM, and either restore the ROM or install your own vector before `cli`.
- **Forgetting that writes fall through to hidden RAM.** With BASIC banked out, `STA $A000` writes RAM; with `$37`, that same store *also* writes the RAM under the ROM, but a *read* returns the ROM byte. Reads and writes can hit different layers.
- **Expecting `$01` to change what the VIC sees.** It doesn't. The VIC bank is CIA2 `$DD00`; the two banking systems are completely separate.
- **Looking for Color RAM in the VIC bank.** It's fixed at `$D800` and only the low nybble is meaningful; the high nybble reads back as undefined.
- **Writing the wrong DDR.** Don't store `$00` over `$0000`; the default DDR is `$2F`. If `$01`'s bits aren't outputs, your `sta $01` has no effect on banking.
- **Leaving I/O banked out.** Under `$30`/`$34` reading the keyboard or talking to VIC/SID silently does nothing — those addresses are RAM or absent.

**Go deeper:** [Appendix B](appendix-b-memory-map.md) — full memory map, `$01` config table, and key zero-page pointers; see also [Appendix F](appendix-f-kernal-basic.md) for the KERNAL routines you give up when you bank it out.

## 1.5 Zero page

**Objectives**
- Understand why the first 256 bytes of RAM ($0000–$00FF) are the most valuable real estate on the C64: shorter, faster instructions.
- Know that zero page is the *only* place a 16-bit pointer for the `(zp),Y` and `(zp,X)` addressing modes can live.
- Learn which zero-page bytes BASIC/KERNAL reserve and which are safe to borrow ($02, $FB–$FE, and a lot more once the ROMs are banked out).
- Build and walk a 16-bit pointer with `LDA (ptr),Y`.

### What "zero page" means

The 6502/6510 address space is 64 KB. The byte's address is 16 bits: a *high* byte (which 256-byte "page" it is in) and a *low* byte (the offset within that page). Page 0 is `$0000–$00FF` — every address whose high byte is `$00`. Because that high byte is implicitly zero, the CPU offers a family of **zero-page addressing modes** whose operand is a single byte instead of two.

This page is always RAM. It can never be banked out — unlike `$A000–$BFFF`, `$D000–$DFFF` and `$E000–$FFFF`, which switch between ROM, I/O and RAM depending on the processor port at `$0001` (see [Appendix B](appendix-b-memory-map.md)).

### Why it is faster and smaller

A zero-page instruction is two bytes (opcode + one address byte); the absolute form is three bytes (opcode + low + high). The shorter encoding also takes one fewer cycle, because the CPU does not fetch a second address byte. Compare these rows from [Appendix A](appendix-a-opcodes.md):

| Instruction | Mode | Bytes | Cycles |
|---|---|---|---|
| `LDA $02` | zero page | 2 | 3 |
| `LDA $C000` | absolute | 3 | 4 |
| `LDA $02,X` | zero page,X | 2 | 4 |
| `LDA $C000,X` | absolute,X | 3 | 4 (+1 on page cross) |
| `INC $02` | zero page | 2 | 5 |
| `INC $C000` | absolute | 3 | 6 |

One byte and one cycle saved per access does not sound like much, but a variable read thousands of times per frame in a raster routine makes zero page the natural home for your hottest loop counters, pointers and flags. KickAssembler picks the zero-page opcode automatically whenever the operand resolves to an address `< $100`.

### The real reason: indirect addressing needs zero page

The killer feature is that the two **indirect** modes only work through a pointer stored in zero page:

- `(zp),Y` — *indirect indexed*: read the 16-bit address stored at `zp` (low byte) and `zp+1` (high byte), add `Y`, then access that final address. This is the 6502's array/string/pointer-walking workhorse.
- `(zp,X)` — *indexed indirect*: add `X` to the zero-page operand first, then read the 16-bit pointer from there. Used far less often (typically for tables of pointers).

There is no absolute equivalent. If you want a *variable* 16-bit address — a pointer you compute at runtime and dereference — it **must** live in two consecutive zero-page bytes. From [Appendix A](appendix-a-opcodes.md), `LDA ($nn),Y` is opcode `B1`, 2 bytes, 5 cycles (+1 on page cross); `STA ($nn),Y` is `91`, 2 bytes, and always 6 cycles (stores never get the page-cross discount).

> Note the page-wrap rule: the pointer's two bytes are read from `zp` and `zp+1` with 8-bit wrap, so a pointer placed at `$FF` would read its high byte from `$00`. Never put a `(zp),Y` pointer at `$FF`.

### Who already owns zero page

On a running C64 with the default banking (`$01 = $37`, BASIC + KERNAL + I/O all in), most of zero page is spoken for:

- `$00`/`$01` — the 6510 data-direction register and I/O port (banking). **Never** repurpose these.
- `$02–$8F` — BASIC's working storage (text/variable/array pointers such as `TXTTAB` at `$2B`, `VARTAB`, `FRETOP`, etc. — see [Appendix B](appendix-b-memory-map.md) §B.2).
- `$90–$FF` — KERNAL's working storage (I/O status `STATUS` at `$90`, keyboard state at `$C5`/`$C6`/`$CB`, and so on).

Bytes that are conventionally free even with the ROMs active:

- **`$02`** — one spare byte BASIC does not use.
- **`$FB`–`$FE`** — four bytes the KERNAL leaves alone; the classic spot for one or two 16-bit pointers. (`$FF` is used by BASIC's FAC-to-string area, so avoid it.)

If you take over the machine completely — disable BASIC/KERNAL IRQs (`SEI`), bank out the ROMs via `$01`, and run your own raster IRQs — then almost all of `$02–$FF` becomes yours, because BASIC and the KERNAL are no longer running to clobber it. Demos and games routinely use dozens of zero-page bytes this way. Until you reach that point, stick to `$02` and `$FB–$FE`.

### Example: walk memory with a 16-bit zero-page pointer

This complete, runnable program stores a pointer to default screen RAM (`$0400`) in `$FB/$FC`, then uses `LDA (ptr),Y` / `STA (ptr),Y` to fill the first 256 screen cells with the letter "A" (screen code 1). It only walks one page, so `Y` alone covers it.

```asm
*=$0801
            BasicUpstart2(main)     // emits the SYS 2061 BASIC stub

*=$080d
.const ptr   = $fb                  // free ZP pair $FB/$FC holds a 16-bit pointer
.const SCREEN = $0400               // default video matrix
.const COLRAM = $d800               // color RAM

main:
            // --- set up the pointer: low byte then high byte ---
            lda #<SCREEN            // < = low byte of $0400  -> $00
            sta ptr
            lda #>SCREEN            // > = high byte of $0400 -> $04
            sta ptr+1

            ldy #$00                // index 0..255 within the page
            lda #$01                // screen code for 'A'
loop:
            sta (ptr),y            // store A at (ptr + Y) = $0400 + Y
            iny
            bne loop               // until Y wraps from $FF back to $00 (256 writes)

            // make those 256 cells white so the letters are visible
            ldy #$00
            lda #$01                // color white
colorfill:
            sta COLRAM,y           // absolute,Y is fine here: address is constant
            iny
            bne colorfill

forever:    jmp forever
```

Two things to internalise from this example:

- `#<SCREEN` and `#>SCREEN` are KickAssembler's low-byte / high-byte operators. A 16-bit pointer is built one byte at a time, low byte into `ptr`, high byte into `ptr+1`.
- The screen fill uses `(ptr),Y` because we are dereferencing a pointer; the color fill uses plain `COLRAM,Y` because that address is a fixed constant known at assembly time. Reach for `(zp),Y` only when the *base address itself* is a runtime value.

### Example: covering more than 256 bytes

To clear the full 1000-byte screen you walk four pages, incrementing the pointer's high byte after each inner `Y` loop:

```asm
            lda #<SCREEN
            sta ptr
            lda #>SCREEN
            sta ptr+1

            ldx #$04               // 4 pages (covers $0400..$07FF, > the 1000 cells)
            ldy #$00
            lda #$20               // screen code for space (blank)
pageloop:
            sta (ptr),y
            iny
            bne pageloop           // finish the current 256-byte page
            inc ptr+1              // advance pointer to the next page
            dex
            bne pageloop           // do the next page
```

This is the canonical 6502 idiom for processing buffers larger than a page: inner loop over `Y` (0–255), outer loop bumping the zero-page pointer's high byte. It only works because the pointer lives in zero page where `(zp),Y` can reach it.

**Pitfalls**
- Do not touch `$00` or `$01`. Writing them changes the 6510 I/O port / banking and can crash the machine or hide the ROMs you still depend on.
- While BASIC/KERNAL are active, only `$02` and `$FB–$FE` are reliably free. Scattering data across `$03`–`$FA` will be silently corrupted by the next BASIC line or KERNAL call (keyboard scan, IRQ, etc.).
- A `(zp),Y` pointer must not straddle the page boundary: never place it at `$FF`, because the high byte would be fetched from `$00` (8-bit wrap on the zero-page read).
- `(zp),Y` is read-modify only in the sense that it needs *both* bytes set — forgetting to initialise `ptr+1` leaves the high byte as whatever stale value was there, pointing into the wrong page.
- `STA (zp),Y` always costs 6 cycles; it does **not** get the page-cross "+1 only when crossing" discount that the *read* form `LDA (zp),Y` has. Budget timing accordingly (see [Appendix H](appendix-h-timing.md)).
- KickAssembler chooses zero-page vs absolute by the operand's value, not by intent. `LDA $00FB` and `LDA $FB` assemble to the same 2-byte zero-page instruction; an address `>= $100` cannot use a zero-page mode no matter how you write it.

**Go deeper:** C64 zero-page and full memory map — [Appendix B](appendix-b-memory-map.md); instruction sizes, cycle counts and the `(ind),Y` opcodes — [Appendix A](appendix-a-opcodes.md).

## 1.6 Subroutines, the stack & calling conventions

**Objectives**
- Call and return from subroutines with `JSR`/`RTS`, understanding how the return address is stored on the hardware stack.
- Use `PHA`/`PLA`/`PHP`/`PLP` to save and restore registers and flags, and respect the 256-byte stack limit.
- Choose a calling convention (registers, zero page, or inline data) to pass arguments.
- Write a correct IRQ handler that saves `A`/`X`/`Y` and returns with `RTI`.

### The stack: page 1, descending

The 6510 has a single hardware stack fixed at **page 1, `$0100`–`$01FF`** (256 bytes). It is also used by BASIC/KERNAL as a work area, so you never get the full 256 bytes to yourself. The **stack pointer (SP)** is an 8-bit register holding the low byte of the next free slot; the effective address is always `$0100 + SP`. After reset/KERNAL init SP points near the top (`$01FF`).

- A **push** writes to `$0100+SP`, then **decrements** SP (stack grows *downward*).
- A **pull** **increments** SP, then reads from `$0100+SP`.

The CPU does **not** detect overflow or underflow: if you push past `$0100` it wraps to `$01FF` and silently corrupts whatever was below. Keep nesting and pushes shallow.

You can read/set SP via `X`: `TSX` copies SP→X, `TXS` copies X→SP. Note `TXS` affects no flags and is the only way to reset SP (e.g. at program start: `ldx #$ff : txs`).

### JSR / RTS

`JSR addr` (Jump to SubRoutine) pushes a **return address** then jumps:
- It pushes **`PC+2`** — the address of the last (third) byte of the `JSR` instruction — high byte first, then low byte. So two bytes go on the stack.
- `RTS` pulls those two bytes back into PC and then **adds 1**, landing on the instruction *after* the `JSR`.

Both `JSR` and `RTS` take 6 cycles and affect no flags (see [Appendix A](appendix-a-opcodes.md)). Because the return address lives on the stack, subroutines nest naturally — each `JSR` pushes 2 bytes, each `RTS` pulls 2. Deep recursion or runaway nesting is what overflows page 1.

```asm
*=$0801
BasicUpstart2(main)        // emits the SYS 2061 BASIC stub

main:
        jsr clearScreen     // pushes return addr (PC+2), jumps
        rts                 // returns to BASIC

clearScreen:
        lda #$20            // PETSCII/screen code for space
        ldx #$00
!loop:                      // anonymous label; referenced as !loop-
        sta $0400,x         // screen RAM page 1
        sta $0500,x
        sta $0600,x
        sta $0700,x
        inx
        bne !loop-          // loop 256 times
        rts                 // pulls return addr, +1 -> back in main
```

### Saving registers and flags: PHA/PLA, PHP/PLP

`JSR`/`RTS` preserve only the PC; a subroutine is free to clobber `A`, `X`, `Y`, and the flags. If the caller needs them intact, save them. The push/pull pairs each cost 3/4 cycles respectively:

- `PHA` push `A`; `PLA` pull `A` (PLA sets N and Z from the value).
- `PHP` push the processor status; `PLP` pull it. `PHP` always pushes with the B flag set; `PLP` restores **N V D I Z C** (B is ignored). This is how you save/restore flags around code that would otherwise change them.

There is no single-instruction push for `X`/`Y`; route them through `A` (`TXA`/`PHA`, `TYA`/`PHA`). **Order matters** — pulls come back in reverse (LIFO):

```asm
// Caller-transparent subroutine: leaves A/X/Y/flags exactly as found.
doWork:
        php             // save flags first
        pha             // save A
        txa
        pha             // save X (via A)
        tya
        pha             // save Y (via A)

        // ... body may freely use A, X, Y, and flags ...

        pla             // restore Y  (reverse order!)
        tay
        pla             // restore X
        tax
        pla             // restore A
        plp             // restore flags last
        rts
```

Pushes and pulls must be balanced before `RTS`: if you leave an extra byte on the stack, `RTS` pulls the wrong return address and the program crashes.

### Calling conventions: passing arguments

The 6502 has no built-in calling convention. Three common patterns:

**1. In registers** — fastest, but only three 8-bit slots (`A`, `X`, `Y`).

```asm
// Set border color. Arg: A = color (0..15).
        lda #6          // blue
        jsr setBorder
        // ...
setBorder:
        sta $d020       // VIC border color register
        rts
```

**2. In zero page** — for more or wider arguments. Zero page is scarce; pick free locations (see [Appendix B](appendix-b-memory-map.md)) and document them.

```asm
.const ARG_PTR = $fb    // $fb/$fc are a commonly free ZP pointer pair

// Print a $00-terminated string whose address is in ARG_PTR.
        lda #<message
        sta ARG_PTR
        lda #>message
        sta ARG_PTR+1
        jsr printZStr
        rts

printZStr:
        ldy #0
!loop:  lda (ARG_PTR),y // indirect-indexed read
        beq !done+
        jsr $ffd2       // CHROUT KERNAL call, see Appendix F
        iny
        bne !loop-
!done:  rts

message: .byte $93      // clear-screen, then text
         .text "hi"
         .byte 0
```

**3. Inline data after the JSR** — the arguments are bytes following the `JSR`; the subroutine reads them via the return address on the stack and adjusts that address so `RTS` skips over them. Compact, but advanced: you must hand-edit the stacked return address.

```asm
// Usage:  jsr printInline : .text "HELLO" : .byte 0
printInline:
        // Return addr (points at the byte AFTER the JSR = our text) is on the
        // stack as low,high. JSR pushed PC+2, RTS will +1, so it currently
        // addresses (text-1). Pull it, walk the string, then push it back.
        pla
        sta ARG_PTR     // low byte of (text-1)
        pla
        sta ARG_PTR+1   // high byte
        ldy #0
!loop:  iny
        lda (ARG_PTR),y // first iteration reads (text-1)+1 = text
        beq !done+
        jsr $ffd2
        bne !loop-      // (always taken: non-zero byte just printed)
!done:  // ARG_PTR + Y now points at the terminating 0; RTS must resume after it.
        tya
        clc
        adc ARG_PTR
        sta ARG_PTR
        bcc !nc+
        inc ARG_PTR+1
!nc:    lda ARG_PTR+1   // push new return addr back, high first
        pha
        lda ARG_PTR
        pha
        rts             // resumes just past the terminating 0
```

### Interrupts: save A/X/Y, return with RTI

A hardware IRQ is like a `JSR` the CPU makes for you, with one extra step: it also **pushes the processor status**, then jumps through the IRQ vector. You return with `RTI`, which **pulls the status first, then the exact PC** — unlike `RTS`, `RTI` does **not** add 1 ([Appendix A](appendix-a-opcodes.md)). Because the flags are saved/restored automatically, you do *not* `PHP`/`PLP` in the handler — but you **must** save and restore any registers you touch, since the interrupted code expects them unchanged.

The standard skeleton:

```asm
*=$0801
BasicUpstart2(start)

.const RASTER = $d012

start:
        sei                 // disable IRQs while we install
        lda #<irq
        sta $0314           // CINV: KERNAL RAM IRQ vector low (Appendix F)
        lda #>irq
        sta $0315           // ...high
        lda #100
        sta RASTER          // raster line to trigger on
        lda #$01
        sta $d01a           // enable raster interrupts (VIC)
        lda $d011
        and #$7f
        sta $d011           // clear RST8 (raster compare bit 8) for line 100
        cli                 // re-enable IRQs
!hold:  jmp !hold-          // main loop does nothing here

irq:
        pha                 // save A
        txa
        pha                 // save X
        tya
        pha                 // save Y

        inc $d020           // visible effect: cycle border color
        lda #$01
        sta $d019           // acknowledge the raster IRQ (write 1 to clear)

        pla                 // restore Y
        tay
        pla                 // restore X
        tax
        pla                 // restore A
        rti                 // pulls status, then PC -- resumes interrupted code
```

This example replaces the KERNAL handler at `$0314`. (A real raster IRQ requires acknowledging `$d019`, as shown; raster/timing details are in [Appendix H](appendix-h-timing.md).)

**Pitfalls**
- Forgetting that `JSR` pushes 2 bytes per call: deep nesting or recursion can overflow the 256-byte stack with no warning, silently corrupting it.
- Unbalanced pushes/pulls before `RTS`/`RTI` — one stray byte makes the CPU return to a garbage address.
- Pulling registers in the wrong order: the stack is LIFO, so restore in reverse of how you saved.
- Using `RTS` where `RTI` is required (or vice versa): `RTS` adds 1 to the pulled PC and ignores the status byte that an interrupt pushed; `RTI` does not add 1 and restores the flags.
- In an IRQ handler, not saving `A`/`X`/`Y` — the interrupted program will resume with clobbered registers. (You need not `PHP`/`PLP`: the IRQ entry already saved status and `RTI` restores it.)
- Resetting SP with `TXS` clears nothing flag-wise, but doing it mid-program throws away every pending return address — only reset SP at startup.
- Choosing zero-page argument locations that BASIC/KERNAL also use; verify against the memory map before claiming them.

**Go deeper**: opcode/cycle details for `JSR`/`RTS`/`RTI`/`PHA`/`PLA`/`PHP`/`PLP`/`TXS`/`TSX` in [Appendix A](appendix-a-opcodes.md); the stack page and free zero-page locations in [Appendix B](appendix-b-memory-map.md); the `$0314` IRQ vector and `CHROUT` ($FFD2) in [Appendix F](appendix-f-kernal-basic.md); raster-IRQ timing in [Appendix H](appendix-h-timing.md).

## 1.7 Multi-byte & signed math

**Objectives**
- Build 16-bit (and wider) add, subtract, and compare from the 8-bit `ADC`/`SBC`/`CMP` instructions.
- Increment a 16-bit value or pointer correctly across the carry.
- Multiply and divide by powers of two with `ASL`/`LSR`, and implement a general 8×8→16 multiply by shift-and-add.
- Understand how two's-complement signed values interact with `N`, `V`, and the branch instructions.

The 6502 has exactly one arithmetic width: 8 bits. There is no multiply or divide instruction, and `ADC`/`SBC` only ever touch one byte at a time. Everything wider is built by chaining single-byte operations and threading the **carry flag** between them. The carry is the glue: it is the bit that "falls off the end" of one byte and into the next.

### The carry is your inter-byte link

`ADC` computes `A + M + C → A` and sets `C` if the result exceeded 255. `SBC` computes `A − M − (1−C) → A`; here carry acts as an *inverted borrow*, so `C=1` means "no borrow" and `C=0` means "borrow happened". This is why the two chains start differently:

- **Addition:** `CLC` once, before the lowest byte (no carry-in). Each `ADC` then feeds its carry-out into the next.
- **Subtraction:** `SEC` once, before the lowest byte (no borrow-in). Each `SBC` feeds its borrow into the next.

Process bytes **least-significant first**, and do *not* clear or set carry again between bytes — the whole point is to let it propagate.

### 16-bit add and subtract

Store 16-bit values little-endian in two zero-page (or absolute) bytes: low byte first. The routines below add and subtract `num1` and `num2`, leaving the result in `num1`.

```asm
*=$0801
BasicUpstart2(main)

*=$0810
main:
        jsr add16
        jsr sub16
        rts

// --- 16-bit values, little-endian (lo, hi) ---
num1:   .word $1234     // .word emits lo byte then hi byte
num2:   .word $0abc

// num1 = num1 + num2   (carry threads lo -> hi)
add16:
        clc                     // no carry into the lowest byte
        lda num1
        adc num2                // A = num1.lo + num2.lo, C = carry-out
        sta num1
        lda num1+1
        adc num2+1              // A = num1.hi + num2.hi + C
        sta num1+1
        rts                     // C now holds the 17th bit (overflow into byte 2)

// num1 = num1 - num2   (carry/borrow threads lo -> hi)
sub16:
        sec                     // no borrow into the lowest byte
        lda num1
        sbc num2
        sta num1
        lda num1+1
        sbc num2+1
        sta num1+1
        rts                     // C=1 means no final borrow (num1 >= num2)
```

To go to 24- or 32-bit, just keep appending `lda byteN / adc byteN` (or `sbc`) blocks without touching the carry in between. See [Appendix A](appendix-a-opcodes.md) for the exact flag definitions and cycle counts of `ADC` (`69/65/6D…`) and `SBC` (`E9/E5/ED…`).

### Incrementing a 16-bit value or pointer

`INC` does not affect the carry, so you cannot use carry to detect rollover. Instead, increment the low byte and only touch the high byte when the low byte wrapped from `$FF` to `$00` — detectable because `INC` sets `Z`:

```asm
// ptr = ptr + 1   (ptr is a 16-bit zero-page pointer: ptr lo, ptr+1 hi)
inc16:
        inc ptr
        bne done        // low byte didn't wrap -> high byte unchanged
        inc ptr+1       // low byte wrapped $FF->$00, carry into high byte
done:
        rts

ptr:    .word $cfff     // try this: after inc16, ptr = $d000
```

Decrement is trickier because `DEC` also leaves carry alone and there is no "was it `$FF`" flag directly; the common idiom tests the low byte first:

```asm
// ptr = ptr - 1
dec16:
        lda ptr
        bne nohi        // if lo != 0, decrementing it won't borrow
        dec ptr+1       // lo is 0 -> it will wrap to $FF, so borrow from hi
nohi:
        dec ptr
        rts
```

### 16-bit compare

A compare is a subtract that throws away the result and keeps only the flags. For 16-bit, compare the **high bytes first**; if they differ, that decides the ordering and you skip the low byte. Recall (from [Appendix A](appendix-a-opcodes.md)) that `CMP` sets `C=1` when register ≥ operand, `Z=1` when equal, and `N` from bit 7 of `register − operand`.

```asm
// Compare unsigned 16-bit num1 vs num2.
// On exit: BCC = num1 < num2, BEQ = equal, BCS = num1 >= num2.
cmp16:
        lda num1+1
        cmp num2+1
        bne notequal    // high bytes differ -> C already reflects the answer
        lda num1
        cmp num2        // high bytes equal -> low byte decides
notequal:
        rts
```

Note the structure: when the high bytes are equal you fall through to compare the low bytes, and the final `CMP` leaves `C`/`Z` set correctly for the whole 16-bit comparison. This works only for **unsigned** values; signed comparison needs the `N`/`V` handling described below.

### Multiply and divide by powers of two

`ASL` shifts every bit left, putting a `0` into bit 0 and bit 7 into carry — exactly a multiply by 2. `LSR` shifts right, `0` into bit 7 and bit 0 into carry — an unsigned divide by 2 (the carry is the discarded remainder). Repeat N times to multiply/divide by 2^N.

For a 16-bit value, chain a shift on the low byte into a **rotate** on the high byte so the carry crosses the byte boundary:

```asm
// val16 = val16 * 2   (unsigned)
asl16:
        asl val16       // bit7 of lo -> C, 0 -> bit0
        rol val16+1     // C -> bit0 of hi, bit7 of hi -> C
        rts

// val16 = val16 / 2   (unsigned)
lsr16:
        lsr val16+1     // bit0 of hi -> C, 0 -> bit7
        ror val16       // C -> bit7 of lo
        rts

val16:  .word $1234
```

`ROL`/`ROR` rotate *through* carry, which is what makes the inter-byte hand-off work; see their entries in [Appendix A](appendix-a-opcodes.md).

### General 8×8→16 multiply (shift-and-add)

When the multiplier is not a constant power of two, use the classic shift-and-add ("Russian peasant") algorithm: for each `1` bit in the multiplier, add a shifted copy of the multiplicand into the 16-bit accumulator. This routine multiplies `mult_a` × `mult_b` (both 8-bit) into the 16-bit `product`.

```asm
*=$0801
BasicUpstart2(start)

*=$0810
start:
        lda #200
        sta mult_a
        lda #150
        sta mult_b
        jsr mul8x8      // product = 200 * 150 = 30000 = $7530
        rts

mult_a:   .byte 0       // multiplicand (8-bit)
mult_b:   .byte 0       // multiplier (8-bit)
product:  .word 0       // 16-bit result (lo, hi)

// product = mult_a * mult_b
mul8x8:
        lda #0
        sta product
        sta product+1           // clear 16-bit accumulator
        ldx #8                  // 8 multiplier bits to process

loop:
        lsr mult_b              // shift next multiplier bit into carry
        bcc skip                // bit was 0 -> nothing to add this round
        // add the (shifted) multiplicand into the running product
        clc
        lda product
        adc mult_a
        sta product
        lda product+1
        adc #0                  // propagate carry into high byte
        sta product+1
skip:
        asl mult_a              // multiplicand *= 2 ... but it can exceed 8 bits!
        rol mult_a_hi           // so capture its high bit here
        dex
        bne loop
        rts

mult_a_hi: .byte 0
```

The subtlety: as `mult_a` is doubled each pass it grows past 8 bits, so we extend it with `mult_a_hi` and the `ADC product+1 / adc #0` step actually needs the high part too. For inputs whose product fits in 16 bits the version above is the standard teaching form; production code usually keeps a 16-bit multiplicand and a 16-bit (or 24-bit) accumulator. The control flow — *test a bit, conditionally add, shift, repeat 8 times* — is the part to internalise.

### Signed values: two's complement

The 6502 has no separate signed instructions; signedness is purely an interpretation you place on the bytes. In two's complement, bit 7 of the most-significant byte is the **sign bit**: `0` = non-negative, `1` = negative. To negate a value, invert all bits and add 1:

```asm
// A = -A  (8-bit two's complement negate)
negate:
        eor #$ff        // invert all bits
        clc
        adc #1          // ... then add 1
        rts
```

Branch on the sign with `BPL` (N=0, "plus/zero") and `BMI` (N=1, "minus"); both read the `N` flag, which most instructions set from bit 7 of their result.

```asm
        lda value
        bmi is_negative
        // value >= 0 here
is_negative:
```

The same `ADC`/`SBC` chains work for signed arithmetic — the bit patterns are identical. The difference is detecting *out-of-range* results. For unsigned math you check `C`; for signed math you check the **overflow flag `V`**, which `ADC`/`SBC` set when the signed result won't fit (e.g. adding two positives yields a negative). Branch with `BVC`/`BVS`. For a signed compare, the correct ordering test combines `N` and `V`: after `CMP`, the value is "less than" (signed) when `N ≠ V`, which you compute by branching on `BVC`/`BVS` and then on `BPL`/`BMI`.

**Pitfalls**
- Forgetting the `CLC` before an add chain or `SEC` before a subtract chain — the lowest byte then silently picks up a stale carry. Set it once, only before the first byte.
- Re-issuing `CLC`/`SEC` *between* bytes of a multi-byte operation. That breaks the carry propagation and corrupts the high bytes.
- Assuming `INC`/`DEC` affect carry. They only set `N`/`Z`; use the `BNE`/test-for-zero idioms shown above for 16-bit increment/decrement.
- Using unsigned compare logic (`BCC`/`BCS`) on signed values. `$FF` (−1) is "greater" than `$01` to an unsigned compare but less to a signed one — you must consult `N` and `V`.
- Confusing `LSR` (always shifts 0 into bit 7) with an arithmetic right shift. `LSR` is an *unsigned* divide-by-2; dividing a negative two's-complement number requires preserving the sign bit manually.
- Letting a doubled multiplicand or an accumulating product overflow its byte width. Size your accumulator for the worst-case result (8×8 needs 16 bits).
- Endianness: `.word` emits low byte first. Keep low at the lower address and always process low-to-high for add/sub, high-to-low for compare and right shift.

**Go deeper:** [Appendix A](appendix-a-opcodes.md) — exact opcodes, flags, and cycle counts for `ADC`, `SBC`, `CMP`/`CPX`/`CPY`, `ASL`/`LSR`/`ROL`/`ROR`, the branches, and `CLC`/`SEC`/`CLV`; cycle timing in [Appendix H](appendix-h-timing.md).

## 1.8 Tables, pointers, indirect-indexed & self-modifying code

**Objectives**

- Build lookup tables at assemble time with `.byte`/`.fill` and read them with `abs,X`.
- Use lo/hi pointer tables to dispatch to one of many routines, and walk buffers larger than 256 bytes with a zero-page pointer and `(zp),Y`.
- Apply self-modifying code (SMC) to patch an instruction's operand, and use the RTS-based jump-table trick — knowing exactly when each is safe.

The 6502 has no multiply, no divide, and a tiny set of registers. The way you make it fast is to *precompute* answers into tables and *index* into them. This lesson is about the addressing machinery that makes data-driven code idiomatic: indexed reads, zero-page pointers, indirect-indexed access, and two forms of computed jump.

### Lookup tables read with `abs,X`

A table is just bytes in memory plus a label. KickAssembler can compute the contents at assemble time, so a sine table costs zero runtime cycles to build. `.fill n, expr` emits `n` bytes, evaluating `expr` once per byte with the loop variable `i` running `0..n-1`.

```asm
*=$0801
BasicUpstart2(start)

*=$0810
start:
        ldx #$00
loop:
        lda sine,x          // A = sine[X]   (LDA abs,X = 4 cycles, +1 if page cross)
        sta $0400,x         // poke into screen RAM as a crude plot
        inx
        bne loop            // X wraps 255->0, covering the whole 256-byte table
        jmp *               // park here

// 256-entry sine table, range 0..200, computed by the assembler.
// i is the .fill loop index (0..255).
sine:   .fill 256, round(100 + 99 * sin(toRadians(i * 360 / 256)))
```

Key points:

- `lda sine,x` is the workhorse: effective address = `sine + X`. It is 4 cycles, plus 1 if `sine+X` crosses a page boundary (see the `*` notation in [Appendix A](appendix-a-opcodes.md)). Aligning a hot table to a page start avoids the penalty entirely.
- `round(...)` keeps each value in `0..255` so it fits one byte; emitting a value outside `0..255` is an assemble error.
- The index register is 8-bit, so plain `abs,X` reaches only 256 entries. For larger spans you need a pointer (below).

### Pointer tables (lo/hi split) and dispatch

The 6502 cannot hold a 16-bit address in a register, so address tables are stored as **two parallel byte arrays**: one of low bytes, one of high bytes. KickAssembler's `<expr` / `>expr` operators take the low and high byte of a 16-bit value.

```asm
// Build the tables from a list of labels — no manual byte-twiddling.
messages:
        .word msg0, msg1, msg2          // for reference; we use the split tables below

msg_lo: .byte <msg0, <msg1, <msg2
msg_hi: .byte >msg0, >msg1, >msg2

msg0:   .text "alpha"
        .byte 0
msg1:   .text "beta"
        .byte 0
msg2:   .text "gamma"
        .byte 0
```

To "dispatch" — select entry N and act on it — load both halves with `abs,X` into a zero-page pointer, then read through it (next section). For selecting a *routine* rather than a string, the same lo/hi pair feeds either `JMP (ptr)` or the RTS trick at the end of this lesson.

### Walking >256 bytes: a ZP pointer and `(zp),Y`

`(zp),Y` (indirect indexed) is the canonical way to dereference a 16-bit pointer. It reads a little-endian address from `zp` and `zp+1`, adds Y, and accesses that byte. The pointer **must** live in zero page; the operand is a single zp byte naming the *low* half.

```asm
.const ptr = $fb            // $fb/$fc is a free zero-page pair on the C64

// Clear $C000..$C7FF (2 KB = 8 pages) to zero, walking the pointer across pages.
        lda #<$c000
        sta ptr
        lda #>$c000
        sta ptr+1

        ldx #8              // 8 pages to clear
        lda #$00
pageloop:
        ldy #$00
byteloop:
        sta (ptr),y         // STA (zp),Y is always 6 cycles (no page-cross discount on writes)
        iny
        bne byteloop        // do all 256 bytes of this page
        inc ptr+1           // advance pointer to the next page
        dex
        bne pageloop
```

Notes that trip people up:

- You advance the high byte (`inc ptr+1`) only after Y wraps through a full 256-byte page. Within a page you let `Y` count `0..255`; `bne` exits when `INY` wraps to 0.
- `(zp),Y` **reads** are `5*` cycles (+1 on page cross); **writes** via `STA (zp),Y` are a flat 6 cycles. See [Appendix A](appendix-a-opcodes.md) for the exact figures.
- Do not confuse `(zp),Y` (indirect *then* index, the common one) with `(zp,X)` (index *then* indirect, rare). They are different opcodes and different semantics.

### Self-modifying code (SMC)

Because code is just bytes in RAM, you can write into the *operand* of an instruction to change what it touches without re-loading registers each pass. The classic use is patching the absolute address that a `STA`/`LDA` targets.

`STA $nnnn` assembles to three bytes: opcode `8D`, then the address low byte, then high byte. If you give that instruction a label, `label+1` is the low operand byte and `label+2` is the high byte.

```asm
// Fill screen RAM by self-modifying the STA target each line, instead of a pointer.
        ldx #$00
        lda #<$0400
        sta target+1        // patch low byte of the STA below
        lda #>$0400
        sta target+2        // patch high byte
        lda #$20            // PETSCII space
fillrow:
        ldy #$00
fillcol:
target: sta $ffff,y         // <-- $ffff is a placeholder; operand is overwritten above
        iny
        cpy #40
        bne fillcol
        // advance target by 40 to next screen row
        clc
        lda target+1
        adc #40
        sta target+1
        bcc nohi
        inc target+2
nohi:
        inx
        cpx #25
        bne fillrow
```

**Safety note.** SMC is only valid in code running from RAM, and the patched instruction must not be in flight when you patch it (no patching the very instruction you are currently executing, and on later machines/emulators with prefetch quirks, keep a few bytes' distance). It is invisible to anyone reading the source — comment every patch site loudly. Avoid SMC in code that may run from ROM or be shared between IRQ and main; an interrupt that fires mid-patch can read a half-written operand.

### The RTS-based jump table

`RTS` pulls a 16-bit address off the stack and jumps to it **plus one**. So if you push `target-1` (high byte first, then low byte) and execute `RTS`, control transfers to `target`. This gives a compact computed jump driven by lo/hi tables, and unlike `JMP (ptr)` it needs no zero-page pointer.

```asm
// Call routine number A (0,1,2) via an RTS jump table.
dispatch:
        asl                 // index*? no — we index two parallel tables, so keep A as N
        tax
        lda jmphi,x         // high byte of (routine-1)
        pha
        lda jmplo,x         // low byte of (routine-1)
        pha
        rts                 // jumps to routine, because RTS adds 1

jmplo:  .byte <(do0-1), <(do1-1), <(do2-1)
jmphi:  .byte >(do0-1), >(do1-1), >(do2-1)

do0:    inc $d020
        rts
do1:    inc $d021
        rts
do2:    dec $d020
        rts
```

Push order matters: the 6502 stack grows downward and `RTS` pulls low byte first, so you **push high, then low**. Each target is encoded as `label-1`. Compared with `JMP (jmptable,x)` — which does not exist as an addressing mode — the RTS trick is how you do an indexed indirect jump on this CPU. The plain alternative is loading a zero-page pointer from `jmplo/jmphi` and using `JMP (ptr)` (5 cycles, but beware the `$xxFF` indirect page-wrap bug noted in [Appendix A](appendix-a-opcodes.md)).

**Pitfalls**

- `abs,X`/`abs,Y`/`(zp),Y` *reads* add a cycle on page cross; *writes* and read-modify-write never do. Page-align hot tables to keep timing flat.
- `(zp),Y` requires a zero-page operand; you cannot indirect through a non-ZP address. Pick free ZP like `$fb/$fc` (`$fd/$fe`, `$02`-ish locations vary — check the memory map).
- Forgetting `inc ptr+1` (or doing it every iteration instead of on Y wrap) corrupts walks across page boundaries.
- SMC patch arithmetic: `label+1` is the low operand byte, `label+2` the high byte — only for instructions whose operand is the last two bytes (absolute modes). Implied/immediate instructions have different layouts.
- RTS jump table: push **high byte then low byte**, and store each address as `target-1`. Off-by-one here jumps into the middle of code and crashes.
- `JMP (ptr)` has the NMOS page-wrap bug when `ptr` is at `$xxFF`; keep indirect vectors off page boundaries.

**Go deeper**: [Appendix A](appendix-a-opcodes.md) for exact opcodes/cycles of `LDA abs,X`, `STA (zp),Y`, `JMP (ind)`, `JSR`/`RTS`; [Appendix B](appendix-b-memory-map.md) for free zero-page and RAM regions; [Appendix H](appendix-h-timing.md) for page-cross and badline timing on real hardware.

## 1.9 Useful illegal opcodes

**Objectives**
- Understand what the NMOS "illegal" opcodes are and why they exist.
- Use the *stable* combined ops (LAX, SAX, DCP, ISC, SLO, RLA, and friends) to save a byte and/or a cycle in real C64 code.
- Recognize the *unstable* opcodes (SHA/SHX/SHY/TAS/ANE/LXA) and know to never use them in portable code.

### Why these exist

The 6510 (and its 6502 core) decodes instructions with combinational logic, not a clean lookup table. Of the 256 possible opcode bytes, only 151 are documented. The remaining bytes are not "errors" — the decode logic still drives the datapath, and for many of them it activates *two* documented micro-operations at once. The result is a set of undocumented instructions that are perfectly deterministic on real NMOS hardware and on cycle-accurate emulators such as VICE.

KickAssembler v5.x assembles all of the stable illegal mnemonics directly — `LAX`, `SAX`, `DCP`, `ISC`, `SLO`, `RLA`, `SRE`, `RRA`, `ANC`, `ALR`, `ARR`, `SBX` — no macro or `.byte` poking required.

These instructions matter in two situations:
- **Speedcode** — generated, unrolled inner loops (pixel plotters, scroll routines, music players) where shaving one cycle per iteration over thousands of iterations is real time saved.
- **Size-coding** — 256-byte / 4K intros where every byte of the binary counts.

### The stable combined ops

Most stable illegal opcodes fuse one ALU operation with a load, store, or read-modify-write. The read-modify-write forms (`SLO`, `RLA`, `SRE`, `RRA`, `DCP`, `ISC`) cost exactly what their documented `INC`/`DEC`/shift counterpart costs — there is *no* extra cycle for the second operation, and notably no page-cross penalty (so `abs,X` is a flat 7 cycles, `(ind),Y` a flat 8). That is the whole point: you get two operations for the price of one. See the full per-mode tables in [Appendix A](appendix-a-opcodes.md).

The ones you will reach for most often:

- **LAX `M` → `A = X = M`** (flags N Z). One instruction instead of `LDA mem` + `TAX`. Saves 1 byte and 2 cycles. Common in copy/clear loops and table lookups where you need the same value in both registers.
- **SAX `M` → `M = A & X`** (no flags). Stores the bitwise AND of A and X without disturbing either register. Useful for masking on the way out to memory.
- **DCP `M` → `DEC M; CMP A,M`** (flags N Z C). Decrement a counter *and* compare it to A in one instruction — handy for countdown loops that branch on a threshold.
- **ISC `M` → `INC M; SBC M`** (flags N V Z C). Increment memory and subtract it from A. (Requires carry set for a clean subtract, like any `SBC`.)
- **SLO `M` → `ASL M; ORA M`**, **RLA `M` → `ROL M; AND M`**, **SRE `M` → `LSR M; EOR M`**, **RRA `M` → `ROR M; ADC M`** — shift/rotate memory while folding the result into A. These show up in bit-unpacking and checksum-style speedcode.

There is also a useful immediate-only group (all 2 bytes, 2 cycles):

- **SBX `#imm` → `X = (A & X) − imm`** (flags N Z C). Subtracts an immediate from `A & X` into X, setting carry like `CMP` (no borrow-in). A favourite for fast pointer/index arithmetic that also leaves a clean carry to branch on.
- **ANC `#imm` → `A = A & imm`, then C = bit 7** — AND that also copies the sign bit into carry, saving a following `ASL`/`CMP`.
- **ALR `#imm` → `A = (A & imm) >> 1`** and **ARR `#imm` → `A = (A & imm) ROR 1`** with special V/C behaviour — mask-and-shift in one step.

### Example: LAX and SAX in a fill loop

A complete, runnable program. It uses `LAX` to load A and X together from a table, and `SAX` to write masked bytes to the screen.

```asm
*=$0801
    BasicUpstart2(start)        // SYS 2064 stub

*=$0810
start:
    lda #$00
    sta $d020               // black border
    sta $d021               // black background

    ldy #$00
loop:
    lax pattern,y           // A = X = pattern[y]  (one op: LDA+TAX)
                            // -> 1 byte / 2 cycles cheaper than LDA+TAX
    lda #$3f                // mask in A
    sax $0400,y             // screen[y] = A & X = $3f & pattern[y]
                            //   (A and X are NOT modified by SAX)
    iny
    cpy #40
    bne loop

hang:
    jmp hang

pattern:
    .fill 40, i             // 0,1,2,...,39
```

Note the subtlety in `SAX`: it stores `A & X`, so we deliberately reload A with the mask after the `LAX`. Because `SAX` sets no flags and leaves the registers alone, the loop counter logic is unaffected.

### Example: DCP as a combined countdown-and-compare

This fragment is illustrative speedcode (syntactically valid KickAssembler). A timer byte is decremented and compared against A in a single 5-cycle instruction:

```asm
        lda #$10            // threshold
checkloop:
        dcp timer           // timer = timer - 1; then CMP A,timer (sets C/Z/N)
        bcs still_above     // branch taken while timer >= A
        // ... timer dropped below threshold; do something ...
still_above:
        // ...

timer:  .byte $20
```

Without `DCP` this is `DEC timer` + `LDA timer` + `CMP #...` (or a `LDA`/`CMP` pair) — `DCP` collapses the decrement and the comparison and never touches A.

### The unstable opcodes — WARNING

A second family of illegal opcodes is **not** deterministic and must be avoided:

**SHA (AHX), SHX, SHY, TAS, ANE (XAA), LXA (LAX #imm)**

These depend on analog effects: an internal "magic constant" that varies with chip revision, temperature and supply voltage (ANE, LXA), and an address-high-byte term `(H+1)` that gets corrupted when an indexed access crosses a page boundary (SHA/SHX/SHY/TAS). Their results can differ between two C64s, between PAL and NTSC, and between real hardware and emulators. Treat them strictly as curiosities — do not put them in code you expect to run anywhere. The intended operations and the specific reasons each is unstable are tabulated in [Appendix A](appendix-a-opcodes.md).

Separately, the bytes `02 12 22 …` are **JAM/KIL** — they halt the CPU until a hardware reset. They are never useful in running code; they appear in the table only so you can recognize a crashed program.

**Pitfalls**
- Illegal opcodes only work on real NMOS 6510/6502 chips and accurate emulators (VICE). They will fail on the 65C02, on some clones, and break compatibility with documented-only assemblers/disassemblers — comment them clearly.
- `SAX` stores `A & X` and sets *no* flags; do not expect it to behave like a plain `STA`/`STX`, and do not branch on flags after it.
- The RMW illegal ops (`SLO`, `DCP`, `ISC`, …) read-modify-*write* memory, so they cannot target ROM or read-only I/O, and they take the full RMW cycle count even in `(ind),Y` mode (8 cycles, no page-cross discount).
- `ISC` does an `SBC`, so the carry flag must be set first for a clean subtract — forgetting `SEC` is the same trap as with ordinary `SBC`.
- Never reach for the unstable group (SHA/SHX/SHY/TAS/ANE/LXA) to "save a cycle"; the savings are not worth nondeterministic output. If you see them in old source, replace them.
- Mnemonics have many aliases (SAX = AXS/AAX, LAX immediate = LXA/ATX, ISC = ISB/INS). KickAssembler accepts the canonical forms shown here; verify the opcode byte in the assembler listing if porting code that used a different name.

**Go deeper:** Full opcode bytes, all addressing modes, cycle counts, and the unstable-opcode hazard notes are in [Appendix A](appendix-a-opcodes.md); for cycle-budgeting these instructions in raster code see [Appendix H](appendix-h-timing.md).

## 1.10 Optimization: cycles, speedcode & LUTs

**Objectives**
- Think in terms of a per-frame *cycle budget* and learn to estimate the cost of a code path by adding up instruction cycles.
- Apply the core 6502 speed techniques: zero-page hot variables, lookup tables (LUTs), loop unrolling / speedcode, branch reduction, and page-cross avoidance.
- Read a before/after example and explain the cycle difference from first principles.

### The frame budget mindset

On the C64 almost everything worth optimizing is measured against one number: how many CPU cycles you get per video frame. On a PAL machine that is **19656 cycles/frame** (63 cycles/line × 312 lines); NTSC is smaller. The exact figures, and the deductions for *bad lines* (~40 cycles stolen on each text row) and *sprite DMA* (~2 cycles per active sprite per line), live in [Appendix H](appendix-h-timing.md) — defer to it for specifics.

The practical consequence: if your per-frame update routine costs, say, 25000 cycles, it *cannot* finish inside one PAL frame. It will run "every other frame" at best, halving your effective frame rate. Optimization on the 6502 is rarely about clever algorithms; it is about shaving cycles off hot loops until the whole job fits in the budget.

To estimate a routine's cost, add up the base cycle counts of its instructions (see [Appendix A](appendix-a-opcodes.md)) and multiply loop bodies by their iteration count. A few rules from Appendix A dominate the arithmetic:

- A taken branch is **+1 cycle** (3 instead of 2), and **+1 more** if it lands on a different page.
- An indexed *read* (`abs,X`, `abs,Y`, `(zp),Y`) that crosses a 256-byte page boundary costs **+1 cycle**. Indexed *writes* and RMW always pay the max count, so they never surprise you.
- Zero-page operands are cheaper than absolute: `LDA $nn` is **3** cycles vs `LDA $nnnn` at **4**.

### Hot variables and pointers in zero page

Zero page is the 6502's "fast RAM". Compare the same operation:

```asm
        lda $fb         // zp:  3 cycles
        lda $c000       // abs: 4 cycles
```

The savings look tiny, but in a loop that runs thousands of times per frame they add up. More importantly, the indirect indexed mode `(zp),Y` — the only general pointer-dereference the 6502 has — *requires* its pointer to live in zero page. Keep your hot pointers and counters there.

```asm
        // a 16-bit source pointer in zero page
        .const SRC = $fb        // uses $fb/$fc
        ldy #0
        lda (SRC),y     // 5 cycles (+1 if the read crosses a page)
```

### Lookup tables beat computation

The 6502 has no multiply, no divide, and shifting is one bit at a time (2 cycles per `ASL`). Anything you can precompute, you should. A multiply-by-something, a `sin`/`cos`, a "screen row → address" mapping — turn it into a table and index it.

KickAssembler lets you build tables at assemble time, so they cost zero runtime cycles to produce:

```asm
// y*40 lookup: row -> screen-memory offset, generated by the assembler
rowLo:  .fill 25, <(i*40)
rowHi:  .fill 25, >(i*40)

// sine table, 256 entries, amplitude 0..63, generated at assemble time
sinTab: .fill 256, 32 + round(31 * sin(toRadians(i*360/256)))
```

Reading `rowLo,X` / `rowHi,X` (4 cycles each, or +1 on a page cross) replaces a multiply that would otherwise be a loop of additions. A LUT trades ROM/RAM space for speed — the classic 6502 bargain.

### Loop unrolling and speedcode

Every loop pays *overhead* per iteration: the counter update and the branch. Consider decrementing X and looping: `DEX` (2) + `BNE` (3 taken) = **5 cycles** of pure bookkeeping per pass, on top of the useful work. Unrolling the loop body N times spreads that overhead across N iterations.

Taken to the extreme, you remove the loop *entirely* and emit one straight-line instruction per element. This fully-unrolled form is called **speedcode**: no counter, no branch, maximum throughput, at the cost of code size. KickAssembler's `.for` directive generates it for you so you do not hand-type hundreds of stores.

### Branch-reduction tricks

Branches are cheap individually but they add up, and a *mispredicted* control path (the 6502 has no prediction, but a taken branch still costs more) wastes cycles. Common reductions:

- **Count down to zero, not up to a limit.** `DEX` / `DEY` sets the Z flag for free, so you branch on `BNE` with no separate `CMP`. Counting up forces a `CPX #limit` (2 cycles) every pass.
- **Unroll** so the branch executes once per N elements instead of every element.
- **Use the carry/flags from the previous op** instead of re-testing.

### Before / after: a 256-byte copy

A straightforward indexed copy loop:

```asm
// --- BEFORE: looped copy, 256 bytes from source to dest ---
        ldx #0
loop:   lda source,x    // 4  (256-aligned, so no page-cross penalty)
        sta dest,x      // 5  (indexed store always pays the max)
        inx             // 2
        bne loop        // 3 taken (2 on the final fall-through)
        // body per iteration = 4+5+2+3 = 14 cycles
```

Per iteration: `LDA abs,X` 4 + `STA abs,X` 5 + `INX` 2 + `BNE` 3 = **14 cycles**. Over 256 iterations that is 256×14 = 3584 cycles, minus 1 because the last `BNE` falls through (−1) ≈ **3583 cycles**. The `INX`/`BNE` overhead alone is 5 of every 14 cycles — about 36% pure bookkeeping.

Now the fully-unrolled speedcode version. `.for` emits 256 load/store pairs with *constant* addresses, so there is no index, no counter, and no branch:

```asm
// --- AFTER: fully-unrolled speedcode, generated at assemble time ---
        .for (var i = 0; i < 256; i++) {
            lda source + i      // 4 (absolute, constant address)
            sta dest + i        // 4 (absolute store, no index -> 4 not 5)
        }
        // per byte = 4 + 4 = 8 cycles
```

Per byte: `LDA abs` 4 + `STA abs` 4 = **8 cycles**, ×256 = **2048 cycles**. Note two wins: the loop overhead vanished *and* the store dropped from 5 to 4 cycles, because a non-indexed `STA abs` is 4 cycles while `STA abs,X` is always 5 (Appendix A). That is **2048 vs 3583**, roughly a **1.75× speedup** — at the price of ~1.5 KB of generated code instead of an 8-byte loop.

A middle ground — unroll by 8, keep a loop — recovers most of the speed for a fraction of the size:

```asm
// --- COMPROMISE: unroll x8, 32 loop passes ---
        ldx #0
loop:
        .for (var i = 0; i < 8; i++) {
            lda source,x
            sta dest,x
            inx
        }
        cpx #0          // X wrapped? no -- use a fixed trip count instead
        bne loop
```

Here the `INX` stays (you still need the index), but the *branch* overhead is paid once per 8 bytes instead of once per byte. Choose the point on the size/speed curve that fits your budget and your free memory.

### A complete, runnable harness

This program copies 256 bytes once per frame using the unrolled approach and tints the border so you can see the work happening on a raster line.

```asm
*=$0801
        BasicUpstart2(start)

*=$0810
start:
        sei
loop:
        // mark start of work in the border
        lda #$02            // red
        sta $d020

        // unrolled copy: screen row 0 (40 bytes) duplicated to row 1
        .for (var i = 0; i < 40; i++) {
            lda $0400 + i   // 4
            sta $0400 + 40 + i  // 4
        }

        // mark end of work
        lda #$00            // black
        sta $d020

        jmp loop

// example data + tables the assembler builds for free
rowLo:  .fill 25, <($0400 + i*40)
rowHi:  .fill 25, >($0400 + i*40)
```

The width of the red band on screen is a direct, visual cycle meter: each CPU cycle is 8 horizontal pixels ([Appendix H](appendix-h-timing.md), H.4). Shrink the band, and you have spent fewer cycles.

**Pitfalls**
- **Page-cross penalties hide in indexed reads.** `LDA table,X` is 4 cycles but **5** when `table+X` crosses a 256-byte page. In cycle-exact code, page-align tables (`*=$xx00`) so timing stays constant. Indexed *writes* always pay max, so they never vary — only reads do.
- **Speedcode is huge.** A fully-unrolled 256-byte copy is ~1.5 KB. Unrolling everything can blow your memory budget or collide with other data. Profile first; unroll the hot loop only.
- **Don't guess cycle counts.** Add them up from [Appendix A](appendix-a-opcodes.md). A common error is forgetting that `STA abs,X` is 5 (not 4) and that taken branches are 3 (not 2).
- **The "budget" is not constant across the frame.** Bad lines and sprite DMA steal cycles on the specific raster lines they touch ([Appendix H](appendix-h-timing.md), H.2/H.3). Code timed on a sprite-free line will overrun where sprites or the text window are active.
- **Counting up needs an extra compare.** Prefer counting down with `DEX`/`DEY` + `BNE` to get the loop test for free, unless you specifically need an ascending index.
- **Illegal opcodes can save cycles** (e.g. `LAX`, `SAX`) but only the *stable* ones are safe, and they hurt readability. Use them deliberately, never by accident — see Appendix A's illegal-opcode section.

**Go deeper:** Christian Bauer's VIC-II article (https://www.cebix.net/VIC-Article.txt) is the authoritative timing source; for per-opcode cycle counts see [Appendix A](appendix-a-opcodes.md) and for the frame/bad-line/sprite budget see [Appendix H](appendix-h-timing.md).

## 1.11 KERNAL & BASIC ROM routines

**Objectives**
- Understand the KERNAL jump table at `$FF81–$FFF3` as a stable, version-independent API.
- Call the routines you will actually use: CHROUT, GETIN, SETLFS/SETNAM/LOAD, CLRCHN, PLOT.
- Know that the KERNAL ROM must be banked in to call it, and why demos/games often bank it out or take over the IRQ.

### What "the KERNAL" is

The KERNAL is the C64's built-in operating system, living in the 8 KB ROM at `$E000–$FFFF`. It provides screen output, keyboard input, the serial (IEC) bus driver for disk/printer, the tape driver, the jiffy clock, and the interrupt dispatch. You reach all of it through a small **jump table** of fixed 3-byte entries at the very top of memory (`$FF81–$FFF3`).

Each table entry is a `JMP` to the real routine somewhere inside the ROM. The real targets move between KERNAL revisions; the jump-table addresses do not. That is the contract: **always `JSR` the `$FFxx` entry, never the internal address it jumps to.** This is what makes the KERNAL a stable API — code written in 1983 still calls `$FFD2` to print a character today.

Data is passed in the CPU registers `.A`, `.X`, `.Y`, and for some routines the carry flag selects read-vs-set. Each routine documents which registers carry input/output and which it clobbers; see the full table in Appendix F.

### The routines you actually use

| Address | Name | What it does |
|---|---|---|
| `$FFD2` | CHROUT | Output the PETSCII char in `.A` to the current output channel (screen by default). |
| `$FFE4` | GETIN | Get one queued keypress into `.A`; `.A = 0` if the buffer is empty (non-blocking). |
| `$FFCF` | CHRIN | Input one char from the current input channel into `.A` (blocks, used after CHKIN). |
| `$FFBA` | SETLFS | Set logical file: `.A`=logical#, `.X`=device#, `.Y`=secondary address. |
| `$FFBD` | SETNAM | Set file name: `.A`=length, `.X`/`.Y`=lo/hi address of the name. |
| `$FFD5` | LOAD | Load or verify: `.A`=0 load (1 verify), `.X`/`.Y`=load address (used when secondary=0). |
| `$FFCC` | CLRCHN | Restore default channels (input=keyboard, output=screen). |
| `$FFF0` | PLOT | Read (`C=1`) or set (`C=0`) cursor position: `.X`=row, `.Y`=column. |

A useful habit: define labels for the entries so the code reads clearly.

```asm
.label CHROUT = $ffd2   // output A as PETSCII
.label GETIN  = $ffe4   // get queued keypress into A (0 = none)
.label SETLFS = $ffba
.label SETNAM = $ffbd
.label LOAD   = $ffd5
.label CLRCHN = $ffcc
.label PLOT   = $fff0
```

### CHROUT: printing characters and strings

`CHROUT` ($FFD2) sends the PETSCII value in `.A` to whatever the current output channel is. By default that is the screen, where it also interprets control codes: `$0D` is carriage return, `$93` clears the screen, `$05` switches to white text, and so on. To print a string you loop, one byte at a time.

```asm
*=$0801 "BASIC"
:BasicUpstart2(start)            // emits the SYS 2061 BASIC stub

*=$080d
start:
        lda #$93                 // PETSCII: clear screen
        jsr $ffd2               // CHROUT
        ldx #0
loop:   lda message,x
        beq done                 // 0 terminates the string
        jsr $ffd2               // CHROUT: print the char in A
        inx
        bne loop
done:   rts

message:
        .text "HELLO, COMMODORE 64!"
        .byte $0d, 0             // carriage return, then null terminator
```

`CHROUT` clobbers only `.A`, so `.X` survives the call and remains valid as the loop index across iterations.

### GETIN: polling the keyboard

`GETIN` ($FFE4) pulls the next character out of the keyboard buffer into `.A`, returning `.A = 0` when the buffer is empty. It is **non-blocking**: it does not wait for a key. The buffer is filled by the KERNAL's IRQ handler (which calls SCNKEY each frame), so GETIN works only while the normal KERNAL interrupt is running — a reason to keep the KERNAL IRQ if you rely on it.

The following polls until a key is pressed, exits on RUN/STOP, and echoes everything else.

```asm
*=$0801 "BASIC"
:BasicUpstart2(start)

*=$080d
start:
wait:   jsr $ffe4               // GETIN: A = key, 0 if buffer empty
        beq wait                 // nothing yet -> keep polling
        cmp #$03                 // RUN/STOP = PETSCII $03
        beq exit
        jsr $ffd2               // CHROUT: echo the key
        jmp wait
exit:   rts
```

(For blocking line input use `CHRIN` ($FFCF) instead, which waits for a full line ending in RETURN.)

### PLOT: positioning the cursor

Subsequent `CHROUT` output appears at the current cursor position. `PLOT` ($FFF0) reads it with carry set, or sets it with carry clear.

```asm
        clc                      // C=0 => SET cursor
        ldx #10                  // row    (0..24)
        ldy #5                   // column (0..39)
        jsr $fff0               // PLOT
        // following CHROUT output now starts at row 10, column 5
```

### Loading a file: SETLFS + SETNAM + LOAD

Disk and tape access is a three-step pattern. First describe the logical file (SETLFS), then the file name (SETNAM), then call LOAD. The secondary address chosen in SETLFS matters: secondary `0` tells LOAD to use the address you pass in `.X`/`.Y`; secondary `1` tells it to load to the address stored in the file's own two-byte PRG header.

```asm
*=$0801 "BASIC"
:BasicUpstart2(start)

*=$080d
start:
        // SETLFS: logical file 1, device 8 (disk), secondary 0 = use X/Y addr
        lda #1
        ldx #8
        ldy #0
        jsr $ffba               // SETLFS

        // SETNAM: name length in A, X/Y = pointer to the name bytes
        lda #fnameEnd-fname
        ldx #<fname
        ldy #>fname
        jsr $ffbd               // SETNAM

        // LOAD: A=0 => load (not verify); X/Y = target address (secondary was 0)
        lda #0
        ldx #<$c000
        ldy #>$c000
        jsr $ffd5               // LOAD
        bcs error                // carry set on entry-from-routine => error
        // on success X/Y = address of the last byte loaded + 1
        rts
error:  rts

fname:    .text "DATA.BIN"
fnameEnd:
```

`CLRCHN` ($FFCC) is the cleanup partner for the channel routines (OPEN/CHKIN/CHKOUT): after you finish reading or writing a channel, call it to restore the default keyboard-in / screen-out channels so normal I/O resumes. The full sequence for byte-by-byte file I/O (OPEN, CHKIN/CHKOUT, CHRIN/CHROUT, CLRCHN, CLOSE) is tabulated in Appendix F.

### Banking: the KERNAL must be in to call it

The KERNAL ROM shares the address range `$E000–$FFFF` with RAM. The 6510 processor port at `$0001` selects which is visible:

- Bit 1 (HIRAM): `1` = KERNAL ROM at `$E000–$FFFF`, `0` = RAM there.
- Bit 0 (LORAM): `1` = BASIC ROM at `$A000–$BFFF`, `0` = RAM there.
- Bit 2 (CHAREN): `1` = I/O at `$D000–$DFFF`, `0` = Character ROM (when bit0 or bit1 is set).

The default value is `$37` — BASIC in, KERNAL in, I/O visible. If HIRAM is `0`, a `JSR $FFD2` lands in whatever RAM occupies that address, not the KERNAL, and your program crashes. So: to call KERNAL routines, the KERNAL must be banked in.

Note that zero page (`$00`/`$01`) and the stack page (`$0100–$01FF`) are always RAM and can never be banked out, so the processor port itself is always reachable.

```asm
        // Bank out BASIC, keep KERNAL + I/O (frees $A000-$BFFF for your data)
        lda #$36                 // LORAM=0, HIRAM=1, CHAREN=1
        sta $01

        // ... use KERNAL routines, VIC/SID/CIA here ...

        // Bank everything back to the default for a clean BASIC return
        lda #$37
        sta $01
```

### Why demos and games avoid or replace the KERNAL

Three reasons push experienced C64 coders away from the KERNAL once a program is up and running:

1. **More RAM.** Banking the KERNAL out (HIRAM=0) reclaims 8 KB at `$E000–$FFFF`; banking BASIC out reclaims another 8 KB at `$A000–$BFFF`. A common "all RAM, keep I/O" value is `$35`. With ROMs out you cannot call `$FFxx` routines, so the program supplies its own I/O.
2. **Taking over the IRQ.** The default KERNAL IRQ (vectored through CINV at `$0314`) spends cycles scanning the keyboard, blinking the cursor, and updating the jiffy clock on every frame. Effects code installs its own raster IRQ instead — pointing `$0314/$0315` (or the CPU vector `$FFFE/$FFFF` directly when the KERNAL is banked out) at a custom handler — to get precise raster timing and spend cycles where it wants. Once you replace the IRQ, GETIN/SCNKEY no longer run, so you scan the keyboard yourself via the CIA.
3. **Determinism and speed.** KERNAL routines have variable timing and use the registers/zero page in documented but inconvenient ways. Hand-rolled equivalents are smaller, faster, and predictable.

The trade-off: the KERNAL is the easy, portable way to do I/O and is perfect while learning and for utilities. Performance-critical real-time code typically banks it out and reimplements only the few things it needs.

**Pitfalls**
- Calling a `$FFxx` routine while the KERNAL is banked out (HIRAM=0) jumps into RAM and crashes. Confirm `$01` has KERNAL in before any `JSR $FFxx`.
- Never `JSR` the internal ROM target of a jump-table entry; those addresses change between KERNAL versions. Only the `$FF81–$FFF3` entries are stable.
- GETIN is non-blocking — `.A = 0` means "no key", not "key 0". Loop on `beq` if you want to wait.
- GETIN/CHRIN depend on the KERNAL IRQ filling the keyboard buffer. If you replace the IRQ or bank the KERNAL out, they stop working; scan the keyboard directly.
- After channel I/O (CHKIN/CHKOUT), call CLRCHN before normal CHROUT/GETIN, or output goes to the wrong device.
- For LOAD, the secondary address from SETLFS decides whether `.X`/`.Y` or the file's PRG header sets the load address. Secondary 0 = use `.X`/`.Y`; secondary 1 = use the header.
- BASIC ROM entry points (`$A000–$BFFF`, plus some interpreter code in `$E000–$E4D2`) are **not** part of the stable contract — they are version-specific addresses, unlike the `$FFxx` jump table.

**Go deeper**: full KERNAL jump table, CPU/RAM interrupt vectors, and BASIC ROM entry points in [Appendix F](appendix-f-kernal-basic.md); processor-port banking bits in [Appendix B](appendix-b-memory-map.md); PETSCII control codes in [Appendix G](appendix-g-petscii.md).


---

*Next: [Part II — Interrupts & Timing](part-2-interrupts.md) (coming next)*
