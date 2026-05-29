# Appendix A — 6502/6510 Opcode Reference

The Commodore 64's 6510 CPU is binary-compatible with the MOS 6502 (it adds an on-chip
6-bit I/O port at `$0000/$0001` but the instruction set is identical). This appendix lists
every documented instruction with its addressing modes, opcode bytes, lengths and cycle
counts, followed by a full 16×16 opcode matrix and a section on the undocumented
("illegal") opcodes.

**How to read the tables**

- **Opcode** is the single instruction byte in hex. **Bytes** is the total instruction
  length (opcode + operand). **Cycles** is the base machine-cycle count at 1 MHz.
- `*` = **add 1 cycle if a page boundary is crossed** while forming the effective address
  (applies to `abs,X` / `abs,Y` / `(ind),Y` reads — never to writes, read-modify-write, or
  stores, which always pay the full count).
- `**` = **branch timing**: a branch costs **2** cycles if not taken; **+1** if taken;
  **+1 more** (i.e. 4 total) if the branch target is on a different page than the
  instruction after the branch.
- `***` = `JMP (ind)` is 5 cycles and on the NMOS 6502/6510 has the well-known page-wrap
  bug: an indirect vector at `$xxFF` reads its high byte from `$xx00`, not `$(xx+1)00`.
- Flags column uses: **N** negative, **V** overflow, **B** break, **D** decimal,
  **I** interrupt-disable, **Z** zero, **C** carry. "—" means no flags affected.
- Addressing-mode abbreviations: `imm` immediate `#$nn`; `zp` zero page; `zp,X`/`zp,Y`
  zero page indexed; `abs` absolute; `abs,X`/`abs,Y` absolute indexed; `(ind,X)` indexed
  indirect; `(ind),Y` indirect indexed; `ind` absolute indirect; `rel` relative;
  `A` accumulator; `imp` implied.
- Decimal mode (`D=1`) affects `ADC`/`SBC` only; it is functional on the 6510 but rarely
  used in C64 demos. All cycle counts below are NMOS values.

---

## Load / Store

### LDA — Load accumulator (`M → A`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `LDA #$nn` | A9 | 2 | 2 |
| Zero page | `LDA $nn` | A5 | 2 | 3 |
| Zero page,X | `LDA $nn,X` | B5 | 2 | 4 |
| Absolute | `LDA $nnnn` | AD | 3 | 4 |
| Absolute,X | `LDA $nnnn,X` | BD | 3 | 4* |
| Absolute,Y | `LDA $nnnn,Y` | B9 | 3 | 4* |
| (Indirect,X) | `LDA ($nn,X)` | A1 | 2 | 6 |
| (Indirect),Y | `LDA ($nn),Y` | B1 | 2 | 5* |

### LDX — Load X (`M → X`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `LDX #$nn` | A2 | 2 | 2 |
| Zero page | `LDX $nn` | A6 | 2 | 3 |
| Zero page,Y | `LDX $nn,Y` | B6 | 2 | 4 |
| Absolute | `LDX $nnnn` | AE | 3 | 4 |
| Absolute,Y | `LDX $nnnn,Y` | BE | 3 | 4* |

### LDY — Load Y (`M → Y`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `LDY #$nn` | A0 | 2 | 2 |
| Zero page | `LDY $nn` | A4 | 2 | 3 |
| Zero page,X | `LDY $nn,X` | B4 | 2 | 4 |
| Absolute | `LDY $nnnn` | AC | 3 | 4 |
| Absolute,X | `LDY $nnnn,X` | BC | 3 | 4* |

### STA — Store accumulator (`A → M`) · flags —
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `STA $nn` | 85 | 2 | 3 |
| Zero page,X | `STA $nn,X` | 95 | 2 | 4 |
| Absolute | `STA $nnnn` | 8D | 3 | 4 |
| Absolute,X | `STA $nnnn,X` | 9D | 3 | 5 |
| Absolute,Y | `STA $nnnn,Y` | 99 | 3 | 5 |
| (Indirect,X) | `STA ($nn,X)` | 81 | 2 | 6 |
| (Indirect),Y | `STA ($nn),Y` | 91 | 2 | 6 |

### STX — Store X (`X → M`) · flags —
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `STX $nn` | 86 | 2 | 3 |
| Zero page,Y | `STX $nn,Y` | 96 | 2 | 4 |
| Absolute | `STX $nnnn` | 8E | 3 | 4 |

### STY — Store Y (`Y → M`) · flags —
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `STY $nn` | 84 | 2 | 3 |
| Zero page,X | `STY $nn,X` | 94 | 2 | 4 |
| Absolute | `STY $nnnn` | 8C | 3 | 4 |

---

## Register Transfers

### TAX — Transfer A to X (`A → X`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `TAX` | AA | 1 | 2 |

### TAY — Transfer A to Y (`A → Y`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `TAY` | A8 | 1 | 2 |

### TXA — Transfer X to A (`X → A`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `TXA` | 8A | 1 | 2 |

### TYA — Transfer Y to A (`Y → A`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `TYA` | 98 | 1 | 2 |

### TSX — Transfer SP to X (`SP → X`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `TSX` | BA | 1 | 2 |

### TXS — Transfer X to SP (`X → SP`) · flags — (SP is not a flag source)
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `TXS` | 9A | 1 | 2 |

---

## Stack

### PHA — Push accumulator · flags —
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `PHA` | 48 | 1 | 3 |

### PHP — Push processor status (pushed with B=1) · flags —
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `PHP` | 08 | 1 | 3 |

### PLA — Pull accumulator · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `PLA` | 68 | 1 | 4 |

### PLP — Pull processor status · flags N V D I Z C (B ignored)
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `PLP` | 28 | 1 | 4 |

> The stack lives in page 1 (`$0100–$01FF`); SP is an 8-bit offset into it. Pushes
> decrement SP, pulls increment it. The CPU does not detect stack overflow/underflow.

---

## Arithmetic (ADC / SBC)

### ADC — Add with carry (`A + M + C → A`) · flags N V Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `ADC #$nn` | 69 | 2 | 2 |
| Zero page | `ADC $nn` | 65 | 2 | 3 |
| Zero page,X | `ADC $nn,X` | 75 | 2 | 4 |
| Absolute | `ADC $nnnn` | 6D | 3 | 4 |
| Absolute,X | `ADC $nnnn,X` | 7D | 3 | 4* |
| Absolute,Y | `ADC $nnnn,Y` | 79 | 3 | 4* |
| (Indirect,X) | `ADC ($nn,X)` | 61 | 2 | 6 |
| (Indirect),Y | `ADC ($nn),Y` | 71 | 2 | 5* |

### SBC — Subtract with carry (`A − M − (1−C) → A`) · flags N V Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `SBC #$nn` | E9 | 2 | 2 |
| Zero page | `SBC $nn` | E5 | 2 | 3 |
| Zero page,X | `SBC $nn,X` | F5 | 2 | 4 |
| Absolute | `SBC $nnnn` | ED | 3 | 4 |
| Absolute,X | `SBC $nnnn,X` | FD | 3 | 4* |
| Absolute,Y | `SBC $nnnn,Y` | F9 | 3 | 4* |
| (Indirect,X) | `SBC ($nn,X)` | E1 | 2 | 6 |
| (Indirect),Y | `SBC ($nn),Y` | F1 | 2 | 5* |

> Set carry (`SEC`) before a subtraction chain; clear carry (`CLC`) before an addition
> chain. An undocumented second `SBC #` exists at `$EB` (see illegal opcodes).

---

## Logic (AND / EOR / ORA / BIT)

### AND — Logical AND (`A & M → A`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `AND #$nn` | 29 | 2 | 2 |
| Zero page | `AND $nn` | 25 | 2 | 3 |
| Zero page,X | `AND $nn,X` | 35 | 2 | 4 |
| Absolute | `AND $nnnn` | 2D | 3 | 4 |
| Absolute,X | `AND $nnnn,X` | 3D | 3 | 4* |
| Absolute,Y | `AND $nnnn,Y` | 39 | 3 | 4* |
| (Indirect,X) | `AND ($nn,X)` | 21 | 2 | 6 |
| (Indirect),Y | `AND ($nn),Y` | 31 | 2 | 5* |

### EOR — Exclusive OR (`A ^ M → A`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `EOR #$nn` | 49 | 2 | 2 |
| Zero page | `EOR $nn` | 45 | 2 | 3 |
| Zero page,X | `EOR $nn,X` | 55 | 2 | 4 |
| Absolute | `EOR $nnnn` | 4D | 3 | 4 |
| Absolute,X | `EOR $nnnn,X` | 5D | 3 | 4* |
| Absolute,Y | `EOR $nnnn,Y` | 59 | 3 | 4* |
| (Indirect,X) | `EOR ($nn,X)` | 41 | 2 | 6 |
| (Indirect),Y | `EOR ($nn),Y` | 51 | 2 | 5* |

### ORA — Logical OR (`A | M → A`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `ORA #$nn` | 09 | 2 | 2 |
| Zero page | `ORA $nn` | 05 | 2 | 3 |
| Zero page,X | `ORA $nn,X` | 15 | 2 | 4 |
| Absolute | `ORA $nnnn` | 0D | 3 | 4 |
| Absolute,X | `ORA $nnnn,X` | 1D | 3 | 4* |
| Absolute,Y | `ORA $nnnn,Y` | 19 | 3 | 4* |
| (Indirect,X) | `ORA ($nn,X)` | 01 | 2 | 6 |
| (Indirect),Y | `ORA ($nn),Y` | 11 | 2 | 5* |

### BIT — Test bits (`A & M` sets Z; `M7 → N`, `M6 → V`) · flags N V Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `BIT $nn` | 24 | 2 | 3 |
| Absolute | `BIT $nnnn` | 2C | 3 | 4 |

---

## Increment / Decrement

### INC — Increment memory (`M + 1 → M`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `INC $nn` | E6 | 2 | 5 |
| Zero page,X | `INC $nn,X` | F6 | 2 | 6 |
| Absolute | `INC $nnnn` | EE | 3 | 6 |
| Absolute,X | `INC $nnnn,X` | FE | 3 | 7 |

### DEC — Decrement memory (`M − 1 → M`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `DEC $nn` | C6 | 2 | 5 |
| Zero page,X | `DEC $nn,X` | D6 | 2 | 6 |
| Absolute | `DEC $nnnn` | CE | 3 | 6 |
| Absolute,X | `DEC $nnnn,X` | DE | 3 | 7 |

### INX — Increment X (`X + 1 → X`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `INX` | E8 | 1 | 2 |

### INY — Increment Y (`Y + 1 → Y`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `INY` | C8 | 1 | 2 |

### DEX — Decrement X (`X − 1 → X`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `DEX` | CA | 1 | 2 |

### DEY — Decrement Y (`Y − 1 → Y`) · flags N Z
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `DEY` | 88 | 1 | 2 |

---

## Shifts / Rotates

### ASL — Arithmetic shift left (`C ← bit7 … bit0 ← 0`) · flags N Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Accumulator | `ASL` | 0A | 1 | 2 |
| Zero page | `ASL $nn` | 06 | 2 | 5 |
| Zero page,X | `ASL $nn,X` | 16 | 2 | 6 |
| Absolute | `ASL $nnnn` | 0E | 3 | 6 |
| Absolute,X | `ASL $nnnn,X` | 1E | 3 | 7 |

### LSR — Logical shift right (`0 → bit7 … bit0 → C`) · flags N(=0) Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Accumulator | `LSR` | 4A | 1 | 2 |
| Zero page | `LSR $nn` | 46 | 2 | 5 |
| Zero page,X | `LSR $nn,X` | 56 | 2 | 6 |
| Absolute | `LSR $nnnn` | 4E | 3 | 6 |
| Absolute,X | `LSR $nnnn,X` | 5E | 3 | 7 |

### ROL — Rotate left through carry (`C ← bit7 … bit0 ← C`) · flags N Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Accumulator | `ROL` | 2A | 1 | 2 |
| Zero page | `ROL $nn` | 26 | 2 | 5 |
| Zero page,X | `ROL $nn,X` | 36 | 2 | 6 |
| Absolute | `ROL $nnnn` | 2E | 3 | 6 |
| Absolute,X | `ROL $nnnn,X` | 3E | 3 | 7 |

### ROR — Rotate right through carry (`C → bit7 … bit0 → C`) · flags N Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Accumulator | `ROR` | 6A | 1 | 2 |
| Zero page | `ROR $nn` | 66 | 2 | 5 |
| Zero page,X | `ROR $nn,X` | 76 | 2 | 6 |
| Absolute | `ROR $nnnn` | 6E | 3 | 6 |
| Absolute,X | `ROR $nnnn,X` | 7E | 3 | 7 |

---

## Compare

### CMP — Compare with accumulator (`A − M`) · flags N Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `CMP #$nn` | C9 | 2 | 2 |
| Zero page | `CMP $nn` | C5 | 2 | 3 |
| Zero page,X | `CMP $nn,X` | D5 | 2 | 4 |
| Absolute | `CMP $nnnn` | CD | 3 | 4 |
| Absolute,X | `CMP $nnnn,X` | DD | 3 | 4* |
| Absolute,Y | `CMP $nnnn,Y` | D9 | 3 | 4* |
| (Indirect,X) | `CMP ($nn,X)` | C1 | 2 | 6 |
| (Indirect),Y | `CMP ($nn),Y` | D1 | 2 | 5* |

### CPX — Compare with X (`X − M`) · flags N Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `CPX #$nn` | E0 | 2 | 2 |
| Zero page | `CPX $nn` | E4 | 2 | 3 |
| Absolute | `CPX $nnnn` | EC | 3 | 4 |

### CPY — Compare with Y (`Y − M`) · flags N Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Immediate | `CPY #$nn` | C0 | 2 | 2 |
| Zero page | `CPY $nn` | C4 | 2 | 3 |
| Absolute | `CPY $nnnn` | CC | 3 | 4 |

> Compare sets `C=1` when register ≥ operand, `Z=1` when equal, and `N` from bit 7 of the
> (register − operand) result. No registers are modified.

---

## Branches

All branches are `rel` (2 bytes); the operand is a signed −128…+127 offset from the address
of the **next** instruction. Cycles: `2**` (2 not taken, 3 taken, 4 if taken across a page).
None affect flags.

| Mnemonic | Description | Condition | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|---|---|
| BPL | Branch if plus | N = 0 | `BPL label` | 10 | 2 | 2** |
| BMI | Branch if minus | N = 1 | `BMI label` | 30 | 2 | 2** |
| BVC | Branch if overflow clear | V = 0 | `BVC label` | 50 | 2 | 2** |
| BVS | Branch if overflow set | V = 1 | `BVS label` | 70 | 2 | 2** |
| BCC | Branch if carry clear | C = 0 | `BCC label` | 90 | 2 | 2** |
| BCS | Branch if carry set | C = 1 | `BCS label` | B0 | 2 | 2** |
| BNE | Branch if not equal | Z = 0 | `BNE label` | D0 | 2 | 2** |
| BEQ | Branch if equal | Z = 1 | `BEQ label` | F0 | 2 | 2** |

---

## Jumps / Subroutines

### JMP — Jump · flags —
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Absolute | `JMP $nnnn` | 4C | 3 | 3 |
| Indirect | `JMP ($nnnn)` | 6C | 3 | 5*** |

### JSR — Jump to subroutine (pushes return address PC+2) · flags —
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Absolute | `JSR $nnnn` | 20 | 3 | 6 |

### RTS — Return from subroutine (pulls PC, +1) · flags —
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `RTS` | 60 | 1 | 6 |

### RTI — Return from interrupt (pulls status then PC) · flags N V D I Z C
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `RTI` | 40 | 1 | 6 |

> `RTI` pulls the full status register (B ignored) then the exact PC — unlike `RTS` it does
> not add 1. `JSR` pushes `PC+2` (the address of its last byte), so `RTS` adds 1 to resume.

---

## Status-Flag Instructions

| Mnemonic | Description | Effect | Assembler form | Opcode | Bytes | Cycles | Flags |
|---|---|---|---|---|---|---|---|
| CLC | Clear carry | 0 → C | `CLC` | 18 | 1 | 2 | C |
| SEC | Set carry | 1 → C | `SEC` | 38 | 1 | 2 | C |
| CLI | Clear interrupt disable | 0 → I | `CLI` | 58 | 1 | 2 | I |
| SEI | Set interrupt disable | 1 → I | `SEI` | 78 | 1 | 2 | I |
| CLV | Clear overflow | 0 → V | `CLV` | B8 | 1 | 2 | V |
| CLD | Clear decimal mode | 0 → D | `CLD` | D8 | 1 | 2 | D |
| SED | Set decimal mode | 1 → D | `SED` | F8 | 1 | 2 | D |

---

## NOP / BRK

### NOP — No operation · flags —
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `NOP` | EA | 1 | 2 |

### BRK — Force interrupt (software IRQ via vector `$FFFE/$FFFF`) · flags I (sets B in pushed status)
| Addressing mode | Assembler form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Implied | `BRK` | 00 | 1 | 7 |

> `BRK` is a 1-byte opcode but pushes `PC+2`, so it effectively skips the byte after it
> (treat the following byte as a signature/padding). The pushed status has B=1; a real IRQ
> pushes B=0, which is how a handler can distinguish them.

---

## Opcode Matrix (16×16)

Rows are the high nibble, columns the low nibble of the opcode byte. Entries marked `*` are
illegal/undocumented (detailed in the next section). `JAM` = halt (a.k.a. KIL). `NOP*`
entries are undocumented no-ops of varying length. Mode suffixes: `#`=imm, `z`=zp,
`zx`/`zy`=zp indexed, `a`=abs, `ax`/`ay`=abs indexed, `ix`=(ind,X), `iy`=(ind),Y,
`r`=rel, `A`=accumulator, `i`=implied, `(a)`=indirect.

|     | x0 | x1 | x2 | x3 | x4 | x5 | x6 | x7 | x8 | x9 | xA | xB | xC | xD | xE | xF |
|-----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| **0x** | BRK i | ORA ix | JAM* | SLO* ix | NOP* z | ORA z | ASL z | SLO* z | PHP i | ORA # | ASL A | ANC* # | NOP* a | ORA a | ASL a | SLO* a |
| **1x** | BPL r | ORA iy | JAM* | SLO* iy | NOP* zx | ORA zx | ASL zx | SLO* zx | CLC i | ORA ay | NOP* i | SLO* ay | NOP* ax | ORA ax | ASL ax | SLO* ax |
| **2x** | JSR a | AND ix | JAM* | RLA* ix | BIT z | AND z | ROL z | RLA* z | PLP i | AND # | ROL A | ANC* # | BIT a | AND a | ROL a | RLA* a |
| **3x** | BMI r | AND iy | JAM* | RLA* iy | NOP* zx | AND zx | ROL zx | RLA* zx | SEC i | AND ay | NOP* i | RLA* ay | NOP* ax | AND ax | ROL ax | RLA* ax |
| **4x** | RTI i | EOR ix | JAM* | SRE* ix | NOP* z | EOR z | LSR z | SRE* z | PHA i | EOR # | LSR A | ALR* # | JMP a | EOR a | LSR a | SRE* a |
| **5x** | BVC r | EOR iy | JAM* | SRE* iy | NOP* zx | EOR zx | LSR zx | SRE* zx | CLI i | EOR ay | NOP* i | SRE* ay | NOP* ax | EOR ax | LSR ax | SRE* ax |
| **6x** | RTS i | ADC ix | JAM* | RRA* ix | NOP* z | ADC z | ROR z | RRA* z | PLA i | ADC # | ROR A | ARR* # | JMP (a) | ADC a | ROR a | RRA* a |
| **7x** | BVS r | ADC iy | JAM* | RRA* iy | NOP* zx | ADC zx | ROR zx | RRA* zx | SEI i | ADC ay | NOP* i | RRA* ay | NOP* ax | ADC ax | ROR ax | RRA* ax |
| **8x** | NOP* # | STA ix | NOP* # | SAX* ix | STY z | STA z | STX z | SAX* z | DEY i | NOP* # | TXA i | ANE* # | STY a | STA a | STX a | SAX* a |
| **9x** | BCC r | STA iy | JAM* | SHA* iy | STY zx | STA zx | STX zy | SAX* zy | TYA i | STA ay | TXS i | TAS* ay | SHY* ax | STA ax | SHX* ay | SHA* ay |
| **Ax** | LDY # | LDA ix | LDX # | LAX* ix | LDY z | LDA z | LDX z | LAX* z | TAY i | LDA # | TAX i | LXA* # | LDY a | LDA a | LDX a | LAX* a |
| **Bx** | BCS r | LDA iy | JAM* | LAX* iy | LDY zx | LDA zx | LDX zy | LAX* zy | CLV i | LDA ay | TSX i | LAS* ay | LDY ax | LDA ax | LDX ay | LAX* ay |
| **Cx** | CPY # | CMP ix | NOP* # | DCP* ix | CPY z | CMP z | DEC z | DCP* z | INY i | CMP # | DEX i | SBX* # | CPY a | CMP a | DEC a | DCP* a |
| **Dx** | BNE r | CMP iy | JAM* | DCP* iy | NOP* zx | CMP zx | DEC zx | DCP* zx | CLD i | CMP ay | NOP* i | DCP* ay | NOP* ax | CMP ax | DEC ax | DCP* ax |
| **Ex** | CPX # | SBC ix | NOP* # | ISC* ix | CPX z | SBC z | INC z | ISC* z | INX i | SBC # | NOP i | SBC* # | CPX a | SBC a | INC a | ISC* a |
| **Fx** | BEQ r | SBC iy | JAM* | ISC* iy | NOP* zx | SBC zx | INC zx | ISC* zx | SED i | SBC ay | NOP* i | ISC* ay | NOP* ax | SBC ax | INC ax | ISC* ax |

---

## Illegal / Undocumented Opcodes

These opcodes are not part of the official MOS instruction set but are produced by the NMOS
decode logic. On a real 6510 (and accurate emulators like VICE) the **stable** ones below
behave deterministically and are widely used in C64 productions. The **unstable** ones
depend on analog effects and must be avoided unless you know the exact hardware behaviour.

### Stable illegal opcodes

These combine two operations in one instruction. Read-modify-write forms follow the same
cycle pattern as their documented `INC`/`DEC`/shift counterparts (no page-cross penalty;
`(ind),Y` is 8 cycles).

#### SLO (ASO) — `M = M<<1; A = A | M` · flags N Z C
| Mode | Form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `SLO $nn` | 07 | 2 | 5 |
| Zero page,X | `SLO $nn,X` | 17 | 2 | 6 |
| Absolute | `SLO $nnnn` | 0F | 3 | 6 |
| Absolute,X | `SLO $nnnn,X` | 1F | 3 | 7 |
| Absolute,Y | `SLO $nnnn,Y` | 1B | 3 | 7 |
| (Indirect,X) | `SLO ($nn,X)` | 03 | 2 | 8 |
| (Indirect),Y | `SLO ($nn),Y` | 13 | 2 | 8 |

#### RLA — `M = (M<<1)|C; A = A & M` (ROL then AND) · flags N Z C
| Mode | Form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `RLA $nn` | 27 | 2 | 5 |
| Zero page,X | `RLA $nn,X` | 37 | 2 | 6 |
| Absolute | `RLA $nnnn` | 2F | 3 | 6 |
| Absolute,X | `RLA $nnnn,X` | 3F | 3 | 7 |
| Absolute,Y | `RLA $nnnn,Y` | 3B | 3 | 7 |
| (Indirect,X) | `RLA ($nn,X)` | 23 | 2 | 8 |
| (Indirect),Y | `RLA ($nn),Y` | 33 | 2 | 8 |

#### SRE (LSE) — `M = M>>1; A = A ^ M` (LSR then EOR) · flags N Z C
| Mode | Form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `SRE $nn` | 47 | 2 | 5 |
| Zero page,X | `SRE $nn,X` | 57 | 2 | 6 |
| Absolute | `SRE $nnnn` | 4F | 3 | 6 |
| Absolute,X | `SRE $nnnn,X` | 5F | 3 | 7 |
| Absolute,Y | `SRE $nnnn,Y` | 5B | 3 | 7 |
| (Indirect,X) | `SRE ($nn,X)` | 43 | 2 | 8 |
| (Indirect),Y | `SRE ($nn),Y` | 53 | 2 | 8 |

#### RRA — `M = (M>>1)|(C<<7); A = A + M + C` (ROR then ADC) · flags N V Z C
| Mode | Form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `RRA $nn` | 67 | 2 | 5 |
| Zero page,X | `RRA $nn,X` | 77 | 2 | 6 |
| Absolute | `RRA $nnnn` | 6F | 3 | 6 |
| Absolute,X | `RRA $nnnn,X` | 7F | 3 | 7 |
| Absolute,Y | `RRA $nnnn,Y` | 7B | 3 | 7 |
| (Indirect,X) | `RRA ($nn,X)` | 63 | 2 | 8 |
| (Indirect),Y | `RRA ($nn),Y` | 73 | 2 | 8 |

#### SAX (AXS, AAX) — `M = A & X` (store A AND X; no flags) · flags —
| Mode | Form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `SAX $nn` | 87 | 2 | 3 |
| Zero page,Y | `SAX $nn,Y` | 97 | 2 | 4 |
| Absolute | `SAX $nnnn` | 8F | 3 | 4 |
| (Indirect,X) | `SAX ($nn,X)` | 83 | 2 | 6 |

#### LAX — `A = X = M` (load A and X together) · flags N Z
| Mode | Form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `LAX $nn` | A7 | 2 | 3 |
| Zero page,Y | `LAX $nn,Y` | B7 | 2 | 4 |
| Absolute | `LAX $nnnn` | AF | 3 | 4 |
| Absolute,Y | `LAX $nnnn,Y` | BF | 3 | 4* |
| (Indirect,X) | `LAX ($nn,X)` | A3 | 2 | 6 |
| (Indirect),Y | `LAX ($nn),Y` | B3 | 2 | 5* |

#### DCP (DCM) — `M = M−1; compare A,M` (DEC then CMP) · flags N Z C
| Mode | Form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `DCP $nn` | C7 | 2 | 5 |
| Zero page,X | `DCP $nn,X` | D7 | 2 | 6 |
| Absolute | `DCP $nnnn` | CF | 3 | 6 |
| Absolute,X | `DCP $nnnn,X` | DF | 3 | 7 |
| Absolute,Y | `DCP $nnnn,Y` | DB | 3 | 7 |
| (Indirect,X) | `DCP ($nn,X)` | C3 | 2 | 8 |
| (Indirect),Y | `DCP ($nn),Y` | D3 | 2 | 8 |

#### ISC (ISB, INS) — `M = M+1; A = A − M − (1−C)` (INC then SBC) · flags N V Z C
| Mode | Form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Zero page | `ISC $nn` | E7 | 2 | 5 |
| Zero page,X | `ISC $nn,X` | F7 | 2 | 6 |
| Absolute | `ISC $nnnn` | EF | 3 | 6 |
| Absolute,X | `ISC $nnnn,X` | FF | 3 | 7 |
| Absolute,Y | `ISC $nnnn,Y` | FB | 3 | 7 |
| (Indirect,X) | `ISC ($nn,X)` | E3 | 2 | 8 |
| (Indirect),Y | `ISC ($nn),Y` | F3 | 2 | 8 |

#### Immediate-only combined ALU ops
| Mnemonic | Operation | Form | Opcode | Bytes | Cycles | Flags |
|---|---|---|---|---|---|---|
| ANC | `A = A & #imm; C = bit7 of result (= N)` | `ANC #$nn` | 0B | 2 | 2 | N Z C |
| ANC | same as above (duplicate) | `ANC #$nn` | 2B | 2 | 2 | N Z C |
| ALR (ASR) | `A = (A & #imm) >> 1` (AND then LSR) | `ALR #$nn` | 4B | 2 | 2 | N Z C |
| ARR | `A = (A & #imm) ROR 1`; C = bit6, V = bit6 ^ bit5 of result | `ARR #$nn` | 6B | 2 | 2 | N V Z C |
| SBX (AXS) | `X = (A & X) − #imm` (no borrow; sets C like CMP) | `SBX #$nn` | CB | 2 | 2 | N Z C |
| SBC | duplicate of `SBC #` (`A = A − M − (1−C)`) | `SBC #$nn` | EB | 2 | 2 | N V Z C |

> `ARR` decimal-mode behaviour differs (BCD fix-up); the flags above are for binary mode.
> `SBX` performs the subtraction without using the carry as borrow and never affects A.

#### LAS (LAR, LAE) — `A = X = SP = M & SP` · flags N Z
| Mode | Form | Opcode | Bytes | Cycles |
|---|---|---|---|---|
| Absolute,Y | `LAS $nnnn,Y` | BB | 3 | 4* |

### Undocumented NOPs

These do nothing useful but consume bytes/cycles; handy for code alignment or timing.

| Opcodes | Mode | Bytes | Cycles |
|---|---|---|---|
| `1A 3A 5A 7A DA FA` | implied | 1 | 2 |
| `80 82 89 C2 E2` | immediate | 2 | 2 |
| `04 44 64` | zero page | 2 | 3 |
| `14 34 54 74 D4 F4` | zero page,X | 2 | 4 |
| `0C` | absolute | 3 | 4 |
| `1C 3C 5C 7C DC FC` | absolute,X | 3 | 4* |

### Unstable / hardware-dependent opcodes — WARNING

The following opcodes do **not** behave deterministically. Their results depend on analog
factors (an internal "magic constant" set by chip revision, temperature and supply voltage),
on whether the indexed address crosses a page boundary, and on the bus state during the
cycle. **Do not use them in portable code.** Behaviour can differ between two C64s, between
NTSC/PAL, and between a real machine and an emulator.

| Mnemonic | Opcode | Mode | Bytes | Cycles | Intended operation | Why unstable |
|---|---|---|---|---|---|---|
| SHA (AHX) | 9F | abs,Y | 3 | 5 | `M = A & X & (H+1)` where H = high byte of addr | The `(H+1)` term is dropped/corrupted on page crossing; bus-dependent |
| SHA (AHX) | 93 | (ind),Y | 2 | 6 | `M = A & X & (H+1)` | Same as above |
| SHX (SXA, XAS) | 9E | abs,Y | 3 | 5 | `M = X & (H+1)` | `(H+1)` term unstable; corrupted when page boundary crossed |
| SHY (SYA, SAY) | 9C | abs,X | 3 | 5 | `M = Y & (H+1)` | `(H+1)` term unstable; corrupted when page boundary crossed |
| TAS (SHS, XAS) | 9B | abs,Y | 3 | 5 | `SP = A & X; M = A & X & (H+1)` | Stores to SP reliably, but the memory store has the unstable `(H+1)` term |
| ANE (XAA) | 8B | imm | 2 | 2 | `A = (A | magic) & X & #imm` | "magic" constant varies by chip/temperature; only safe if A or magic known |
| LXA (LAX #imm, ATX) | AB | imm | 2 | 2 | `A = X = (A | magic) & #imm` | Same magic-constant dependence as ANE |

> Note on SHA/SHX/SHY/TAS: H is the high byte of the (un-indexed) target address; the value
> ANDed in is conventionally written `(H+1)`. When the indexed address would cross into a new
> page, on real hardware the high byte of the store address is also corrupted to the ANDed
> value. Treat these strictly as curiosities.

### JAM / KIL opcodes

The bytes **`02 12 22 32 42 52 62 72 92 B2 D2 F2`** are `JAM` (also called `KIL`, `HLT`,
`CRSH`). Executing any of them traps the CPU in an internal state with `$FF` on the data
bus; the processor stops fetching and only a hardware RESET (or, on the C64, a hard reset)
recovers it. They take no defined number of cycles and are never useful in running code —
they are listed only so you can recognise a crashed program.

---

## Sources

- masswerk — 6502 Instruction Set: https://www.masswerk.at/6502/6502_instruction_set.html
- masswerk — "6502 / NMOS 6510 Unintended Opcodes" (illegal opcodes): https://www.masswerk.at/nowgobang/2021/6502-illegal-opcodes
- oxyron — 6510 opcode matrix incl. illegals & cycles: http://www.oxyron.de/html/opcodes02.html
- Codebase64 — 6502/6510 coding & illegal opcodes index: https://codebase64.c64.org/doku.php?id=base:6502_6510_coding
