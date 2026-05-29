# Appendix F — KERNAL & BASIC ROM Jump Tables

The C64 KERNAL exposes a stable jump table at the top of the ROM ($FF81–$FFF3). Each
entry is a 3-byte `JMP` to the real (and version-dependent) routine, so **always call
these fixed addresses** — never the internal targets. Registers `.A`, `.X`, `.Y` are the
6502 accumulator and index registers. "Comm." = communication registers (the registers
used to pass data in/out). "Affected" = registers clobbered by the call.

## KERNAL Jump Table ($FF81–$FFF3)

| Address | Dec | Name | Function | Comm. | Affected | Prep. routines |
|---|---|---|---|---|---|---|
| $FF81 | 65409 | CINT | Initialize screen editor & VIC-II | none | A,X,Y | none |
| $FF84 | 65412 | IOINIT | Initialize CIA I/O devices & timers | none | A,X,Y | none |
| $FF87 | 65415 | RAMTAS | RAM test; set top/bottom of memory, clear $0000–$0101/$0200–$03FF | A,X,Y | A,X,Y | none |
| $FF8A | 65418 | RESTOR | Restore default I/O (KERNAL RAM) vectors at $0314–$0333 | — | A,X,Y | none |
| $FF8D | 65421 | VECTOR | Read (`C=1`) or set (`C=0`) RAM I/O vectors; X/Y = ptr to list | X,Y | A,X,Y | none |
| $FF90 | 65424 | SETMSG | Control KERNAL messages; A bit7=error msgs, bit6=control msgs | A | A | none |
| $FF93 | 65427 | SECOND | Send secondary address after LISTEN; A = sec. addr | A | A | LISTEN |
| $FF96 | 65430 | TKSA | Send secondary address after TALK; A = sec. addr | A | A | TALK |
| $FF99 | 65433 | MEMTOP | Read (`C=1`)/set (`C=0`) top of RAM; X=lo, Y=hi | X,Y | X,Y | none |
| $FF9C | 65436 | MEMBOT | Read (`C=1`)/set (`C=0`) bottom of RAM; X=lo, Y=hi | X,Y | X,Y | none |
| $FF9F | 65439 | SCNKEY | Scan keyboard; place key in buffer (normally called by IRQ) | none | A,X,Y | none |
| $FFA2 | 65442 | SETTMO | Set IEEE/serial bus timeout flag; A bit7=enable | A | none | none |
| $FFA5 | 65445 | ACPTR | Input byte from serial bus → A | A | A,X | TALK, TKSA |
| $FFA8 | 65448 | CIOUT | Output byte in A to serial bus | A | none | LISTEN, SECOND |
| $FFAB | 65451 | UNTLK | Send UNTALK to all serial-bus devices | none | A | none |
| $FFAE | 65454 | UNLSN | Send UNLISTEN to all serial-bus devices | none | A | none |
| $FFB1 | 65457 | LISTEN | Command serial-bus device to LISTEN; A = device # | A | A | none |
| $FFB4 | 65460 | TALK | Command serial-bus device to TALK; A = device # | A | A | none |
| $FFB7 | 65463 | READST | Read I/O status word → A (serial/tape error bits) | A | A | none |
| $FFBA | 65466 | SETLFS | Set logical file: A=logical#, X=device#, Y=secondary (255=none) | A,X,Y | none | none |
| $FFBD | 65469 | SETNAM | Set file name: A=length, X=lo addr, Y=hi addr of name | A,X,Y | none | none |
| $FFC0 | 65472 | OPEN | Open logical file (uses SETLFS/SETNAM params) | none | A,X,Y | SETLFS, SETNAM |
| $FFC3 | 65475 | CLOSE | Close logical file; A = logical file # | A | A,X,Y | none |
| $FFC6 | 65478 | CHKIN | Open channel for input; X = logical file # | X | A,X | OPEN |
| $FFC9 | 65481 | CHKOUT | Open channel for output; X = logical file # | X | A,X | OPEN |
| $FFCC | 65484 | CLRCHN | Restore default I/O channels (input=kbd, output=screen) | none | A,X | none |
| $FFCF | 65487 | CHRIN | Input character from current input channel → A | A | A,X | OPEN, CHKIN (non-default) |
| $FFD2 | 65490 | CHROUT | Output character in A to current output channel | A | A | none |
| $FFD5 | 65493 | LOAD | Load/verify: A=0 load / A=1 verify, X/Y=load addr (sec=0) | A,X,Y | A,X,Y | SETLFS, SETNAM |
| $FFD8 | 65496 | SAVE | Save: A=ptr (zp) to start addr, X=lo, Y=hi of end addr+1 | A,X,Y | A,X,Y | SETLFS, SETNAM |
| $FFDB | 65499 | SETTIM | Set jiffy clock (1/60 s): A=MSB, X=mid, Y=LSB | A,X,Y | none | none |
| $FFDE | 65502 | RDTIM | Read jiffy clock: A=MSB, X=mid, Y=LSB | A,X,Y | A,X,Y | none |
| $FFE1 | 65505 | STOP | Test STOP key; `Z=1` if pressed (A=key row from $91) | A | A,X | none |
| $FFE4 | 65508 | GETIN | Get char from keyboard queue → A (A=0 if empty) | A | A (X,Y) | none |
| $FFE7 | 65511 | CLALL | Close all files & restore default channels | none | A,X | none |
| $FFEA | 65514 | UDTIM | Increment jiffy clock; also scan STOP key (IRQ-called) | none | A,X | none |
| $FFED | 65517 | SCREEN | Return screen size: X=columns (40), Y=rows (25) | X,Y | X,Y | none |
| $FFF0 | 65520 | PLOT | Read (`C=1`)/set (`C=0`) cursor: X=row, Y=column | A,X,Y | A,X,Y | none |
| $FFF3 | 65523 | IOBASE | Return CIA1 base address: X=lo ($00), Y=hi ($DC) | X,Y | X,Y | none |

Notes:
- **Carry on entry** selects read vs. set for VECTOR, MEMTOP, MEMBOT, PLOT (and LOAD's A selects load/verify). Set the carry/clear it before the call.
- **SETLFS device numbers:** 0 keyboard, 1 Datassette, 2 RS-232, 3 screen, 4–5 serial printers, 8+ serial disk drives.
- **READST status bits** (also at $90): bit6 = EOI/EOF, bit7 = device-not-present; tape adds read-error/checksum bits.
- `CHROUT` to the screen interprets PETSCII control codes (e.g. $0D = carriage return, $93 = clear screen, $05 = white).

## CPU Hardware Vectors ($FFFA–$FFFF)

These are read directly by the 6510 CPU (not the jump table). In the unmodified KERNAL
they point into ROM, which then re-vectors most interrupts through **RAM vectors** so user
code can hook them.

| Vector | Addr | Default ROM target | Purpose |
|---|---|---|---|
| NMI | $FFFA/$FFFB | $FE43 (65091) | Non-maskable interrupt (RESTORE key, RS-232) |
| RESET | $FFFC/$FFFD | $FCE2 (64738) | Power-on / reset entry (cartridge check → init) |
| IRQ/BRK | $FFFE/$FFFF | $FF48 (65352) | Maskable IRQ and BRK software interrupt |

### KERNAL RAM (re-vectored) interrupt vectors

The ROM handlers `JMP ($....)` through these RAM pointers, which are the ones you normally
patch in demos/games. Defaults are restored by RESTOR ($FF8A).

| RAM vector | Addr | Default target | Purpose |
|---|---|---|---|
| CINV | $0314/$0315 | $EA31 (59953) | IRQ handler (keyboard scan, jiffy clock, cursor) |
| CBINV | $0316/$0317 | $FE66 (65126) | BRK instruction handler |
| NMINV | $0318/$0319 | $FE47 (65095) | NMI handler |

The CPU IRQ vector ($FFFE→$FF48) saves registers, distinguishes IRQ vs. BRK by the pushed
B flag, then jumps through CINV ($0314) for IRQ or CBINV ($0316) for BRK. The CPU NMI
vector ($FFFA→$FE43) jumps through NMINV ($0318).

## BASIC ROM Entry Points (version-specific)

The C64 BASIC ROM occupies $A000–$BFFF (40960–49151); some interpreter code lives in the
KERNAL space $E000–$E4D2. **These are internal addresses, valid for the standard 1982/1983
C64 BASIC v2 ROM only** — unlike the $FFxx jump table they are not contractually stable, so
treat them as version-specific.

| Address | Dec | Routine | Purpose |
|---|---|---|---|
| $A000 | 40960 | BASIC cold-start vector | Word at $A000 = BASIC cold-start ($E394) |
| $A002 | 40962 | BASIC warm-start vector | Word at $A002 = BASIC warm-start ($E37B) |
| $E394 | 58260 | BASIC cold start | Full BASIC init (called on reset) |
| $E37B | 58235 | BASIC warm start | Re-enter BASIC after RUN/STOP-RESTORE |
| $A7AE | 42926 | Interpreter inner loop | Main statement-execution loop |
| $A483 | 42115 | BASIC main input loop | READY prompt / direct-mode line entry |
| $AB1E | 43806 | Print null-/quote-terminated string | A=lo, Y=hi addr of PETSCII string |
| $BDDD | 48605 | FAC1 → ASCII | Convert float in FAC1 to ASCII string at ($0100) |
| $BDCD | 48589 | Print unsigned integer | Print 16-bit value: A=hi, X=lo |
| $AABC | 43708 | Print "string" via CHROUT | Output BASIC string token |
| $B391 | 45969 | Integer → float | Signed 16-bit (A=hi, Y=lo) into FAC1 |
| $B1AA | 45482 | Float → integer | FAC1 → signed integer |
| $FF48 | 65352 | KERNAL IRQ/BRK dispatch | (ROM target of $FFFE; listed for reference) |

Reset routine: $FCE2 checks for a cartridge autostart signature ("CBM80" at $8004); if none,
it calls RAMTAS, RESTOR, IOINIT, CINT, then jumps to BASIC cold start.

## KickAssembler Usage Snippets

KERNAL labels for clarity:

```asm
.label CHROUT = $ffd2   // output A as PETSCII
.label GETIN  = $ffe4   // get queued keypress into A
.label CHRIN  = $ffcf   // input char from current channel
.label SETLFS = $ffba
.label SETNAM = $ffbd
.label OPEN   = $ffc0
```

### Print a null-terminated string via CHROUT ($FFD2)

```asm
*=$0801 "BASIC"
:BasicUpstart2(start)          // SYS 2061 stub

*=$080d
start:
        ldx #0
loop:   lda message,x
        beq done               // 0 terminates the string
        jsr $ffd2              // CHROUT: print char in A
        inx
        bne loop
done:   rts

message:
        .text "HELLO, COMMODORE 64!"
        .byte $0d, 0           // CR then null terminator
```

### Read a key via GETIN ($FFE4) and echo it

```asm
*=$0801 "BASIC"
:BasicUpstart2(start)

*=$080d
start:
wait:   jsr $ffe4             // GETIN: A = key (0 if buffer empty)
        beq wait               // loop until a key is pressed
        cmp #$03               // RUN/STOP (PETSCII $03)?
        beq exit
        jsr $ffd2             // CHROUT: echo the key
        jmp wait
exit:   rts
```

### Set cursor position with PLOT ($FFF0)

```asm
        clc                    // C=0 => set cursor position
        ldx #10                // row (0..24)
        ldy #5                 // column (0..39)
        jsr $fff0             // PLOT
        // subsequent CHROUT output appears at row 10, col 5
```

## Sources

- C64 Programmer's Reference Guide, "BASIC to Machine Language" (Appendix B, KERNAL function descriptions B-1..B-39): /home/rhm/code/c64-tools/docs/reference/c64-programmers-reference-guide.txt
- c64-wiki, KERNAL: https://www.c64-wiki.com/wiki/KERNAL
- c64-wiki, Kernal functions: https://www.c64-wiki.com/wiki/Kernal_functions
- c64-wiki, Reset (Process): https://www.c64-wiki.com/wiki/Reset_(Process)
- c64-wiki, Interrupt: https://www.c64-wiki.com/wiki/Interrupt
- c64-wiki, BASIC-ROM: https://www.c64-wiki.com/wiki/BASIC-ROM
- Skoolkid C64 ROM disassembly, routines map: https://skoolkid.github.io/sk6502/c64rom/maps/routines.html
- Mapping the Commodore 64 (memory map / ROM routines): https://www.zimmers.net/anonftp/pub/cbm/c64/manuals/mapping-c64.txt
