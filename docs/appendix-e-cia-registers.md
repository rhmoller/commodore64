# Appendix E — CIA Register Reference ($DC00 / $DD00)

The Commodore 64 contains two MOS 6526 Complex Interface Adapter (CIA) chips. Each
exposes 16 registers. CIA #1 is mapped at **$DC00–$DC0F (56320–56335)** and drives
its IRQ line to the 6510 `IRQ` input. CIA #2 is mapped at **$DD00–$DD0F (56576–56591)**
and drives its IRQ line to the 6510 `NMI` input.

- **CIA #1** — keyboard scan, joystick ports, paddle/lightpen select, system IRQ
  (timer/raster handshakes), cassette.
- **CIA #2** — serial (IEC) bus, RS-232 over the user port, NMI source (RESTORE key /
  RS-232 / user FLAG), and the VIC-II 16K bank select via `$DD00` bits 0–1.

Each register's address mirrors throughout `$DC10–$DCFF` and `$DD10–$DDFF` (every 16
bytes), but only the base 16 addresses should be used.

---

## CIA #1 — $DC00–$DC0F (56320–56335)

| Off | Hex   | Dec   | Name      | Function |
|-----|-------|-------|-----------|----------|
| +0  | $DC00 | 56320 | PRA       | Port A data: keyboard **column** drive (write), joystick **port 2** (read), paddle fire/select on bits 6–7 |
| +1  | $DC01 | 56321 | PRB       | Port B data: keyboard **row** read, joystick **port 1** (read); can output Timer A/B underflow on bits 6/7 |
| +2  | $DC02 | 56322 | DDRA      | Data direction Port A (0=input, 1=output). Keyboard scan uses $FF (all outputs) |
| +3  | $DC03 | 56323 | DDRB      | Data direction Port B (0=input, 1=output). Keyboard scan uses $00 (all inputs) |
| +4  | $DC04 | 56324 | TA LO     | Timer A counter low byte (read = current count; write = latch low) |
| +5  | $DC05 | 56325 | TA HI     | Timer A counter high byte (read = current count; write = latch high) |
| +6  | $DC06 | 56326 | TB LO     | Timer B counter low byte |
| +7  | $DC07 | 56327 | TB HI     | Timer B counter high byte |
| +8  | $DC08 | 56328 | TOD 10THS | Time-of-Day: tenths of a second, BCD (bits 0–3); reading latches TOD until HR read |
| +9  | $DC09 | 56329 | TOD SEC   | Time-of-Day: seconds, BCD (units 0–3, tens 4–6) |
| +A  | $DC0A | 56330 | TOD MIN   | Time-of-Day: minutes, BCD (units 0–3, tens 4–6) |
| +B  | $DC0B | 56331 | TOD HR    | Time-of-Day: hours, BCD (units 0–3, tens 4); bit 7 = AM(0)/PM(1); reading unlatches TOD |
| +C  | $DC0C | 56332 | SDR       | Serial Data Register (synchronous shift register, SP/CNT pins) |
| +D  | $DC0D | 56333 | ICR       | Interrupt Control/Status — wired to 6510 **IRQ** |
| +E  | $DC0E | 56334 | CRA       | Control Register A (Timer A, serial direction, TOD freq) |
| +F  | $DC0F | 56335 | CRB       | Control Register B (Timer B, TOD alarm select) |

---

## CIA #2 — $DD00–$DD0F (56576–56591)

| Off | Hex   | Dec   | Name      | Function |
|-----|-------|-------|-----------|----------|
| +0  | $DD00 | 56576 | PRA       | Port A data: **VIC bank select** (bits 0–1), serial (IEC) bus lines, RS-232 TXD |
| +1  | $DD01 | 56577 | PRB       | Port B data: user port / RS-232 control + data lines |
| +2  | $DD02 | 56578 | DDRA      | Data direction Port A. KERNAL sets $3F so bits 0–5 are outputs |
| +3  | $DD03 | 56579 | DDRB      | Data direction Port B (user port direction) |
| +4  | $DD04 | 56580 | TA LO     | Timer A counter low byte |
| +5  | $DD05 | 56581 | TA HI     | Timer A counter high byte |
| +6  | $DD06 | 56582 | TB LO     | Timer B counter low byte |
| +7  | $DD07 | 56583 | TB HI     | Timer B counter high byte |
| +8  | $DD08 | 56584 | TOD 10THS | Time-of-Day: tenths of a second, BCD |
| +9  | $DD09 | 56585 | TOD SEC   | Time-of-Day: seconds, BCD |
| +A  | $DD0A | 56586 | TOD MIN   | Time-of-Day: minutes, BCD |
| +B  | $DD0B | 56587 | TOD HR    | Time-of-Day: hours, BCD + AM/PM (bit 7) |
| +C  | $DD0C | 56588 | SDR       | Serial Data Register |
| +D  | $DD0D | 56589 | ICR       | Interrupt Control/Status — wired to 6510 **NMI** |
| +E  | $DD0E | 56590 | CRA       | Control Register A (same layout as CIA #1) |
| +F  | $DD0F | 56591 | CRB       | Control Register B (same layout as CIA #1) |

---

## Control Register A — CRA ($DC0E / $DD0E)

| Bit | Mask | Name   | Meaning |
|-----|------|--------|---------|
| 0   | $01  | START  | Timer A start (1) / stop (0) |
| 1   | $02  | PBON   | 1 = Timer A underflow appears on PB6 (overrides keyboard/joystick bit 6) |
| 2   | $04  | OUTMODE| PB6 output: 0 = pulse one cycle on underflow, 1 = toggle on underflow |
| 3   | $08  | RUNMODE| 0 = continuous (reload from latch), 1 = one-shot (stop after underflow) |
| 4   | $10  | LOAD   | Force-load latch into Timer A (strobe, write 1; always reads 0) |
| 5   | $20  | INMODE | Timer A clock source: 0 = system Ø2 cycles, 1 = positive edges on CNT pin |
| 6   | $40  | SPMODE | Serial port direction: 0 = input, 1 = output |
| 7   | $80  | TODIN  | TOD clock source: 0 = 60 Hz on TOD pin, 1 = 50 Hz |

## Control Register B — CRB ($DC0F / $DD0F)

| Bit | Mask | Name    | Meaning |
|-----|------|---------|---------|
| 0   | $01  | START   | Timer B start (1) / stop (0) |
| 1   | $02  | PBON    | 1 = Timer B underflow appears on PB7 |
| 2   | $04  | OUTMODE | PB7 output: 0 = pulse one cycle on underflow, 1 = toggle |
| 3   | $08  | RUNMODE | 0 = continuous, 1 = one-shot |
| 4   | $10  | LOAD    | Force-load latch into Timer B (strobe) |
| 5–6 | $60  | INMODE  | Timer B clock source (2 bits, see below) |
| 7   | $80  | ALARM   | TOD write target: 0 = set clock, 1 = set alarm |

**CRB INMODE (bits 6–5):**

| %65 | Timer B counts |
|-----|----------------|
| %00 | System Ø2 cycles |
| %01 | Positive edges on CNT pin |
| %10 | Timer A underflow pulses |
| %11 | Timer A underflow pulses while CNT is high |

---

## Interrupt Control Register — ICR ($DC0D / $DD0D)

The ICR behaves differently on read vs. write.

**Read (data register / status) — reading clears all latched flags:**

| Bit | Mask | Source |
|-----|------|--------|
| 0   | $01  | Timer A underflow |
| 1   | $02  | Timer B underflow |
| 2   | $04  | TOD = Alarm |
| 3   | $08  | Serial shift register full/empty (8 bits transferred) |
| 4   | $10  | FLAG pin negative edge (CIA1: cassette read; CIA2: user port / RS-232 RXD / SRQ) |
| 5–6 | —    | Unused (read 0) |
| 7   | $80  | IRQ occurred — set if any enabled source above is active (CIA1 → IRQ, CIA2 → NMI) |

**Write (mask register) — set/clear interrupt enables:**

| Bit | Mask | Effect |
|-----|------|--------|
| 0–4 | —    | Select sources (same bit positions as read) |
| 7   | $80  | Fill bit: 1 = **set** (enable) every source whose bit is 1; 0 = **clear** (disable) every source whose bit is 1. Bits written as 0 are left unchanged. |

Examples: write `$7F` to disable all CIA interrupts; write `$81` to enable only Timer A.

---

## $DD00 — VIC-II Bank Select (CIA #2 Port A, bits 0–1)

The two low bits of `$DD00` select which 16K of the 64K address space the VIC-II
sees. **The bits are inverted** (the value is the complement of the bank number).
DDRA bits 0–1 must be outputs (KERNAL default `$DD02 = $3F`).

| $DD00 bits 1–0 | VIC bank | VIC sees |
|----------------|----------|----------|
| %11            | Bank 0   | $0000–$3FFF (default) |
| %10            | Bank 1   | $4000–$7FFF |
| %01            | Bank 2   | $8000–$BFFF |
| %00            | Bank 3   | $C000–$FFFF |

```asm
// Select VIC bank 1 ($4000-$7FFF), preserving the other PRA bits
lda $dd00
and #%11111100
ora #%00000010   // %10 = bank 1
sta $dd00
```

### $DD00 full bit layout (CIA #2 Port A)

| Bit | Function (output unless noted) |
|-----|--------------------------------|
| 0   | VIC bank select bit 0 |
| 1   | VIC bank select bit 1 |
| 2   | RS-232 TXD output (user port) |
| 3   | Serial (IEC) bus ATN OUT |
| 4   | Serial bus CLOCK OUT |
| 5   | Serial bus DATA OUT |
| 6   | Serial bus CLOCK IN (input) |
| 7   | Serial bus DATA IN (input) |

### $DD01 — User Port / RS-232 (CIA #2 Port B)

| Bit | RS-232 / user port line |
|-----|-------------------------|
| 0   | RXD — received data (in) |
| 1   | RTS — request to send |
| 2   | DTR — data terminal ready |
| 3   | RI — ring indicator |
| 4   | DCD — carrier detect |
| 5   | User-defined (PB5) |
| 6   | CTS — clear to send |
| 7   | DSR — data set ready |

---

## Keyboard Matrix (8×8)

CIA #1 scans an 8×8 switch matrix. **`$DC00` (PRA) drives the columns** (set as
outputs, DDRA=$FF) and **`$DC01` (PRB) reads the rows** (set as inputs, DDRB=$00).
To scan a column, drive its PA bit **low** (0) and leave the rest high; any pressed
key in that column pulls its PB row bit **low** (0). A key is therefore detected as a
**0** in both the selected column and the read row.

Table: rows are the driven column line (PA0–PA7), columns are the read line (PB0–PB7).

| Drive ↓ \ Read → | PB0      | PB1     | PB2     | PB3 | PB4   | PB5 | PB6     | PB7    |
|------------------|----------|---------|---------|-----|-------|-----|---------|--------|
| **PA0**          | INST/DEL | RETURN  | CRSR ⇆  | F7  | F1    | F3  | F5      | CRSR ⇅ |
| **PA1**          | 3        | W       | A       | 4   | Z     | S   | E       | LSHIFT |
| **PA2**          | 5        | R       | D       | 6   | C     | F   | T       | X      |
| **PA3**          | 7        | Y       | G       | 8   | B     | H   | U       | V      |
| **PA4**          | 9        | I       | J       | 0   | M     | K   | O       | N      |
| **PA5**          | +        | P       | L       | −   | .     | :   | @       | ,      |
| **PA6**          | £        | *       | ;       | HOME| RSHIFT| =   | ↑       | /      |
| **PA7**          | 1        | ←       | CTRL    | 2   | SPACE | C=  | Q       | RUN/STOP |

Notes:
- **RESTORE** is *not* in the matrix — it is wired directly to CIA #2 / the 6510 **NMI**
  line (RESTORE alone triggers an NMI; RUN/STOP + RESTORE invokes the warm-start).
- **SHIFT LOCK** is a mechanical latch wired in parallel with LSHIFT (PA1/PB7).
- Bit value: drive a single column low with `lda #%column_pattern : sta $dc00`, then
  `lda $dc01`; a cleared bit = pressed.

```asm
// Read which keys are down in the column driven by PA2 (drive PA2 low)
lda #%11111011   // all columns high except PA2
sta $dc00
lda $dc01        // 0-bits = pressed keys on that column (PB0..PB7)
```

---

## Joystick Bit Layout

Both joysticks share the keyboard ports. **All signals are active-low** (0 = engaged).
Reading is reliable only with the matching DDR set appropriately; reading joysticks
disturbs keyboard scan and vice-versa.

- **Joystick port 2** → CIA #1 **PRA `$DC00`** (56320)
- **Joystick port 1** → CIA #1 **PRB `$DC01`** (56321)

| Bit | Mask | Direction / Button (0 = active) |
|-----|------|---------------------------------|
| 0   | $01  | UP    |
| 1   | $02  | DOWN  |
| 2   | $04  | LEFT  |
| 3   | $08  | RIGHT |
| 4   | $10  | FIRE  |

```asm
// Read joystick port 2 ($DC00). A cleared bit means that direction/fire is active.
lda $dc00
lsr            // carry = UP    (clear = pressed)
lsr            // carry = DOWN
lsr            // carry = LEFT
lsr            // carry = RIGHT
lsr            // carry = FIRE
```

Caveat: because port 1 is on PRB (the keyboard row inputs) and port 2 is on PRA (the
column drives, normally outputs during keyboard scan), robust code temporarily sets
`$DC02`/`$DC03` and restores the keyboard scan state, or reads joystick 2 by setting
`$DC02 = $00` (inputs) before reading and `$FF` afterward.

---

## Sources

- https://www.c64-wiki.com/wiki/CIA
- https://www.c64-wiki.com/wiki/Keyboard
- https://www.zimmers.net/anonftp/pub/cbm/maps/C64.MemoryMap.txt
