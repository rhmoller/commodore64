# Appendix J — File & Storage Formats

Three formats cover almost everything you load and ship: `.prg` (a single
program), `.d64` (a disk image), and `.tap` (a tape image). They sit at very
different levels — `.prg` is a memory image, `.d64` models a floppy down to its
sectors, and `.tap` models the analog pulses on a cassette. This appendix
dissects all three.

A `.prg` ("program") is the standard Commodore executable/data file: a raw memory
image with a **two-byte load address** glued to the front. Every assembler in
[Toolchain](toolchain.md) emits one, VICE runs one directly (`x64sc game.prg`),
and `LOAD`/`SAVE` on a real machine read and write one. There is no magic number,
no length field, and no checksum — the format is deliberately trivial.

## J.1 Layout

```
byte 0      byte 1            byte 2 .. end
┌─────────┬─────────┐  ┌───────────────────────────────┐
│ addr lo │ addr hi │  │ data, copied verbatim to RAM   │
└─────────┴─────────┘  └───────────────────────────────┘
 little-endian load        first data byte lands at the
 address (e.g. $0801)       load address; the rest follow
                            it one byte at a time, ascending
```

| Field | Size | Meaning |
|---|---|---|
| Load address | 2 bytes | Little-endian (low byte first). Where byte 2 onward is placed in RAM. |
| Payload | N bytes | The memory image. Byte *k* (k ≥ 2) is written to `load_address + (k − 2)`. |

That's the entire specification. A 100-byte program on disk occupies 98 bytes in
C64 RAM (100 minus the 2 header bytes). The file says *where* to put the bytes but
not *how many* — the loader simply copies until end-of-file.

## J.2 Worked example — the "hello" stub

The minimal BASIC-launcher PRG from [Getting Started §2](00-getting-started.md)
(`BasicUpstart2` generates exactly this) is the canonical `10 SYS 2061`:

```
offset  bytes              meaning
------  -----------------  ------------------------------------------
0000    01 08              load address  = $0801  (start of BASIC)
0002    0b 08              link: next BASIC line is at $080B
0004    0a 00              line number   = 10
0006    9e                 token         = SYS
0007    32 30 36 31        PETSCII       = "2061"
000b    00                 end of line
000c    00 00              link = $0000  -> end of program
000e    ...                your machine code begins at $080D (2061)
```

So the program counter reached by `SYS 2061` is `$080D`, the first byte right
after the stub. `$080D` = 2061 — which is why the classic stub SYSes there. (See
[Appendix F](appendix-f-kernal-basic.md) for the BASIC tokenization and
[Appendix G](appendix-g-petscii.md) for the digit codes.)

## J.3 Loading semantics — the secondary address

How a PRG's header is used depends on the `LOAD` **secondary address** (the number
after the device number):

| Command | Secondary addr | Where it loads |
|---|---|---|
| `LOAD "name",8` | 0 (default) | **Relocates** to the start of BASIC (`$0801`), *ignoring* the file's load address. The header is read but only to know it can skip it. This is how you `LOAD` and `RUN` a BASIC program regardless of where it was saved. |
| `LOAD "name",8,1` | 1 | **Absolute** — loads to the address in the file's 2-byte header. Required for machine-code data (sprites, charsets, ML routines) that must land at a fixed address. |

> The single most common beginner bug: loading a machine-code blob with `,8`
> instead of `,8,1`, so it lands at `$0801` instead of its intended address and
> nothing works. Always use `,8,1` for non-BASIC data.

`SAVE` does the inverse: it writes the start address of the saved memory range as
the 2-byte header automatically, so a `SAVE`d range round-trips through
`LOAD ...,1`. From a host, the KERNAL `LOAD`/`SAVE` vectors (`$FFD5`/`$FFD8`)
and the lower-level routines honor the same convention.

## J.4 Autostart

A `.prg` is just bytes — nothing in the format marks an entry point. Two
conventions cover launching:

- **BASIC programs** load at `$0801` and run via `RUN` (or autostart on some
  loaders). A pure-ML program borrows this by prepending the `SYS` stub from J.2
  so `RUN` immediately jumps into machine code. This is the universal pattern —
  see [Part II](part-2-interrupts.md) and Getting Started.
- **Emulators/fast loaders** add their own autostart on top: `x64sc foo.prg`
  injects the file and issues `RUN` for you; `.prg` dropped on the C64 Ultimate's
  REST API (`c64-ultimate.md`) load-and-runs the same way.

There is no "autostart bit" in a `.prg` itself — that lives in cartridge
(`.crt`) images, not here.

## J.5 Multiple segments and gaps

The format describes **one contiguous block** from a single start address. When an
assembler has several non-adjacent segments (e.g. KickAssembler with `*=$0801`
for the stub and `*=$1000` for data), it writes a single PRG spanning the lowest
to the highest address and **zero-fills the gap** between them. A 20-byte program
at `$0801` plus 8 bytes at `$1000` therefore produces a file of roughly
`$1000 − $0801 + 8 ≈ 2055` bytes, most of it padding.

To avoid bloating one file with padding, split genuinely separate blocks into
**separate PRGs** (KickAssembler's `.file`/segment directives, or one assemble
per blob) and `LOAD ...,1` each to its own address. Tools that need true
multi-block output use other containers (below), not multi-segment PRGs.

## J.6 The D64 disk image

A `.d64` is a byte-for-byte image of a **1541 floppy**: a flat dump of every
256-byte sector in track/sector order, no extra header. The standard 35-track
image is **174,848 bytes = 683 sectors × 256**. (A variant with one error byte
appended per sector is 175,531 bytes; 40-track is 196,608 and 42-track is 205,312.)

The 1541 uses **zoned recording** — outer tracks are longer, so they hold more
sectors:

| Tracks | Sectors/track | Subtotal |
|---|---:|---:|
| 1–17 | 21 | 357 |
| 18–24 | 19 | 133 |
| 25–30 | 18 | 108 |
| 31–35 | 17 | 85 |
| | | **683** |

**Track 18 is the directory track.** Sector `18/0` holds the **BAM** (Block
Availability Map — which sectors are free) plus the disk name and ID; sectors
`18/1` onward hold the directory entries, 8 per sector. Each entry is **32 bytes**:

| Offset | Size | Field |
|---|---|---|
| `$00–$01` | 2 | Track/sector of the *next* directory sector (only meaningful in entry 0 of each sector) |
| `$02` | 1 | File type: low nibble `0=DEL 1=SEQ 2=PRG 3=USR 4=REL`; bit 7 set = properly closed (e.g. `$82` = closed PRG) |
| `$03–$04` | 2 | Track/sector of the file's first data block |
| `$05–$14` | 16 | Filename, PETSCII, padded with `$A0` |
| `$1E–$1F` | 2 | File size in **sectors**, low/high |

**Files are linked-sector chains.** The first 2 bytes of every data sector point
to the next track/sector; the final sector stores **track = `$00`** and, in the
second byte, **how many bytes of that last sector are used**. So you follow the
chain from the directory's start track/sector until you hit a `$00` track byte.
A PRG stored on a disk is exactly the PRG file — its 2-byte load address is simply
the first two payload bytes of the chain. (The 1541 lays files down with a sector
**interleave of 10**, directories with interleave 3, to suit the drive's rotation.)

Build and inspect D64s with VICE's `c1541` tool:

```sh
c1541 -format "mydisk,01" d64 game.d64       # create a blank formatted disk
c1541 -attach game.d64 -write hello.prg      # add a PRG
c1541 -attach game.d64 -list                 # show the directory
x64sc game.d64                               # boot it (LOAD "*",8,1 / RUN)
```

## J.7 The TAP tape image

A `.tap` is the lowest-level format here: it does **not** store files or bytes —
it stores the **timing of the pulses** a Datassette would read off cassette tape.
That fidelity is why `.tap` preserves copy-protected/turbo-loader tapes that a
file-level format can't.

It opens with a **20-byte header**:

| Offset | Size | Field |
|---|---|---|
| `$00–$0B` | 12 | Signature: `C64-TAPE-RAW` (or `C16-TAPE-RAW`) |
| `$0C` | 1 | TAP version (`$00` or `$01`) |
| `$0D` | 1 | Platform: `0`=C64, `1`=VIC-20, `2`=C16/Plus4 |
| `$0E` | 1 | Video: `0`=PAL, `1`=NTSC, `2`=old NTSC, `3`=PAL-N |
| `$0F` | 1 | Reserved |
| `$10–$13` | 4 | Length of the pulse data that follows, low/high |
| `$14…` | — | Pulse data stream |

Each pulse-data byte encodes the time until the next signal edge:

```
pulse length (seconds) = (8 × data_byte) / clock_Hz
```

i.e. one data byte = **`data_byte × 8` CPU cycles** (clock_Hz ≈ 985,248 PAL /
1,022,730 NTSC). The `×8` scaling is also why a single byte caps at `255 × 8`
cycles — and that's what `$00` is for:

- **Version `$00`:** a `$00` byte just means "overflow" — a pulse longer than
  `255 × 8` cycles, with no exact value recorded.
- **Version `$01`:** `$00` is followed by **three bytes, low/high**, giving the
  exact pulse length **in cycles** (the `×8` formula does *not* apply). This lets
  v1 represent long pulses precisely.

Because `.tap` is pure signal, you don't assemble to it directly — you record/play
it through the emulated Datassette (VICE: *Attach tape image*, then the tape
controls), or convert a `.prg` to `.tap` with a tape-mastering tool when targeting
real cassette hardware.

## J.8 Other containers

Beyond the three above, you'll occasionally meet:

| Format | What it is |
|---|---|
| `.t64` | A tape-*archive* container (despite the name, **not** a pulse-level tape image like `.tap`). A header plus a table of PRG entries with their load/end addresses — convenient, lossy of real tape timing. |
| `.crt` | Cartridge ROM image — a real header, chip packets, and a hardware/autostart cartridge type. Fundamentally different from a PRG. |
| `.p00` (`.pNN`) | A single PRG wrapped with a 26-byte PC64 header that preserves the original 16-char filename. Strip the header to recover the PRG. |

For the development loop in this guide, `.prg` is what your assembler outputs and
what you run; `.d64` is what you build when you need a multi-file disk; `.tap` you
reach for only when targeting real tape or preserving a protected one.

## Sources

- https://vice-emu.sourceforge.io/vice_17.html (VICE file-format reference — D64, TAP, T64, etc.)
- https://www.c64-wiki.com/wiki/PRG
- https://www.c64-wiki.com/wiki/LOAD
- https://www.c64-wiki.com/wiki/D64
- https://en.wikipedia.org/wiki/PRG_(file_format)
- https://theweb.dk/KickAssembler/webhelp/content/cpt_TheBasicToolchain.html
