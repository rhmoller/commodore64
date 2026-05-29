# Resources & Further Reading

The authoritative external references behind this library — datasheets, the
community wikis, tool homepages, and the best tutorials — grouped by topic. The
teaching content lives in the [curriculum](CURRICULUM.md) Parts and the
[appendices](appendix-a-opcodes.md); this page is the annotated link directory.

## The five to bookmark first

- **[Codebase64](https://codebase64.c64.org/)** — the community wiki: routines, effects, illegal opcodes. First stop for "how do I do X".
- **[C64 Programmer's Reference Guide](https://archive.org/details/c64-programmer-ref)** — the official 1982/83 manual (local copy in [`reference/`](reference/c64-programmers-reference-guide.pdf)).
- **[Mapping the Commodore 64](https://www.zimmers.net/anonftp/pub/cbm/c64/manuals/mapping-c64.txt)** — annotated `$0000–$FFFF` memory map.
- **[C64-Wiki](https://www.c64-wiki.com/)** — fast lookups for any register, command, or chip.
- **[Christian Bauer's VIC-II article](https://www.cebix.net/VIC-Article.txt)** — the canonical VIC-II timing reverse-engineering; the demoscene bible.


## CPU & 6502/6510 assembly

### Primary references

- **[C64 Programmer's Reference Guide](https://archive.org/details/c64-programmer-ref)**
  *(primary — official)*. The 1982/83 Commodore manual. Authoritative on the
  memory map, KERNAL routines, and BASIC. PDF/EPUB/searchable text on archive.org.
  **Local copy:** [`reference/c64-programmers-reference-guide.pdf`](reference/c64-programmers-reference-guide.pdf)
  (518 pp, searchable) + [`.txt`](reference/c64-programmers-reference-guide.txt) for grepping.
- **[Mapping the Commodore 64 (Sheldon Leemon)](https://www.zimmers.net/anonftp/pub/cbm/c64/manuals/mapping-c64.txt)**
  *(primary)*. The definitive annotated memory map — every important location
  `$0000–$FFFF` with what it does and how to use it. Zero page is split into
  BASIC working storage (`$0–$8F`) and KERNAL work area (`$90–$FF`).
- **[zimmers.net C64 memory map (C64.MemoryMap.txt)](https://www.zimmers.net/anonftp/pub/cbm/maps/C64.MemoryMap.txt)**
  *(primary)*. Compact canonical I/O register listing — VIC `$D000–$D02E`,
  SID `$D400–$D41C`, CIA1 `$DC00`, CIA2 `$DD00`.

### Instruction set & 6502 core

- **[masswerk 6502 instruction set](https://www.masswerk.at/6502/6502_instruction_set.html)**
  *(secondary, excellent)*. Searchable opcode table with cycle counts, flags,
  and addressing modes. The reference to keep open while coding.
- **[6502.org](http://6502.org/)** *(primary hub)*. Tutorials, the famous
  "Programming the 65816 / 6502" texts, source archive, and forums. The
  datasheet archive at `archive.6502.org/datasheets/` hosts the chip PDFs.
- **[Codebase64 — 6502/6510 coding index](https://codebase64.c64.org/doku.php?id=base:6502_6510_coding)**
  *(primary community hub)*. Tutorials, addressing-mode references, **illegal
  opcode** articles (ANC, ALR, SHX/SHY), optimization (speedcode, unrolled
  loops), and reusable routines.
- **[NMOS 6510 Unintended Opcodes (groepaz / hitmen)](http://www.oxyron.de/html/opcodes02.html)**
  *(reference)*. The oxyron opcode matrix plus links to *No More Secrets* — the
  exhaustive illegal-opcode + cycle-timing reference demo coders rely on.

### Quick lookups

- **[C64-Wiki](https://www.c64-wiki.com/)** — fast pages for any register,
  KERNAL routine, or concept (e.g. search "raster interrupt", "KERNAL").


## VIC-II graphics

### Primary / canonical

- **[Christian Bauer — "The MOS 6567/6569 Video Controller (VIC-II)"](https://www.cebix.net/VIC-Article.txt)**
  *(primary, THE reference)*. The complete reverse-engineering: cycle-by-cycle
  bus behavior, bad lines, sprite DMA, register effects per cycle. Dense but
  authoritative; every serious VIC effect traces back to this. Mirror:
  [zimmers.net](https://www.zimmers.net/cbmpics/cbm/c64/vic-ii.txt).
- **[MOS 6567 VIC-II preliminary datasheet (PDF)](http://archive.6502.org/datasheets/mos_6567_vic_ii_preliminary.pdf)**
  *(primary)*. The manufacturer datasheet: 47 registers, MOB/sprite specs, the
  video-matrix/character-base addressing, bitmap & multicolor mode definitions.

### Tutorials & approachable explanations

- **[Dustlayer — "VIC-II for Beginners"](https://dustlayer.com/vic-ii)** *(tutorial)*.
  The friendliest on-ramp: banks, `$D018`, screen/char/color memory, how the VIC
  sees memory. Read this before the Bauer article.
- **[Codebase64 — VIC / graphics articles](https://codebase64.c64.org/doku.php?id=base:vicii)**
  *(community)*. Per-effect write-ups: bad-line timing, border opening, FLD/FLI,
  sprite stretching, stable rasters.
- **[Bumbershoot Software — bad lines](https://www.bumbershootsoft.net/)** and
  **[c64os.com FLI timing series](https://c64os.com/post/flitiming1)** *(blogs)*.
  Modern, careful walk-throughs of bad-line cycle budgets and FLI timing.
- **[C64-Wiki: Raster interrupt](https://www.c64-wiki.com/wiki/Raster_interrupt)**,
  **[VIC bank](https://www.c64-wiki.com/wiki/VIC_bank)** *(quick lookup)*.


## SID sound

### Primary

- **[MOS 6581 SID datasheet (PDF)](http://archive.6502.org/datasheets/mos_6581_sid.pdf)**
  *(primary)*. The chip manual: 3 voices, 4 waveforms, the `Fout` formula, ADSR
  rate tables, filter spec. Start here for register-level truth.
- **[C64-Wiki: SID](https://www.c64-wiki.com/wiki/SID)** and
  **[register map](https://www.c64-wiki.com/wiki/SID-register)** *(quick lookup)*.
- **[Wikipedia: MOS Technology 6581](https://en.wikipedia.org/wiki/MOS_Technology_6581)**
  *(secondary overview)*. Good on 6581/8580 history and differences.

### Programming & drivers

- **[Codebase64 — sound / SID section](https://codebase64.c64.org/doku.php?id=base:sound)**
  *(community)*. Playroutines, the ADSR hard-restart, digi techniques, SFX
  routines for games.
- **[reSID (Wikipedia)](https://en.wikipedia.org/wiki/ReSID)** *(reference)*. The
  emulation library inside VICE/GoatTracker; explains why emulated SID can match
  6581/8580 so closely.

### Trackers & tools

- **[GoatTracker 2](https://sourceforge.net/projects/goattracker2/)** *(cross-platform tracker)*.
  The most popular modern SID tracker (Win/Mac/Linux). Emulates 6581 **and** 8580
  via reSID; exports `.SID` and **assembly source** to drop into your game/demo.
  By Lasse "Cadaver" Oorni.
- **[SID-Wizard](https://csdb.dk/release/?id=125146)** *(native C64 tracker)*.
  Runs on the real machine; configurable engine footprint; exports `.SID`. Great
  if you want to compose on hardware.
- **[SID Factory II](https://blog.chordian.net/sf2/)** *(modern cross-platform)*.
  A newer editor (Win/Mac) with a driver-based workflow; increasingly popular.
- **[Comparison of C64 music editors (Chordian)](https://blog.chordian.net/2018/02/24/comparison-of-c64-music-editors/)**
  *(overview)*. Helps you pick between GoatTracker / SID-Wizard / SID Factory /
  CheeseCutter etc.
- **[High Voltage SID Collection (HVSC)](https://www.hvsc.c64.org/)** *(archive)*.
  ~50,000 SID tunes — the reference corpus for studying drivers and styles, and
  for testing your player.


## BASIC V2

- **[C64 Programmer's Reference Guide](https://archive.org/details/c64-programmer-ref)**
  *(primary)*. The official BASIC V2 language reference (every command,
  abbreviations, error messages) plus the hardware chapters BASIC pokes into.
- **[C64-Wiki: POKE](https://www.c64-wiki.com/wiki/POKE)** /
  **[SYS](https://www.c64-wiki.com/wiki/SYS)** /
  **[BASIC](https://www.c64-wiki.com/wiki/BASIC)** *(quick lookup)*. Precise
  semantics, including the `$030C–$030F` register passing for `SYS`.
- **[Commodore BASIC V2 command list (C64 Playground)](https://www.c64playground.com/cms/page/basic-v2-commands/)**
  and **[C64 BASIC V2 cheat sheet](https://cheatsheets.one/tech/c64-basic-v2)**
  *(handy references)*. One-page command/syntax summaries.
- **[Retro Game Coders — "The Magic of POKE"](https://retrogamecoders.com/c64-poke-peek/)**
  *(tutorial)*. Approachable walk-through of PEEK/POKE for graphics and sound.
- **["Peeks & Pokes for the Commodore 64" (archive.org)](https://archive.org/stream/peeks-and-pokes-for-the-commodore-64/PeeksAndPokesForTheCommodore64_djvu.txt)**
  *(reference book)*. A catalog of useful memory locations and what poking them
  does — the BASIC programmer's companion to *Mapping the C64*.
- **[Calling machine code from BASIC (Medium walkthrough)](https://medium.com/@alexey.medvecky/embarking-on-an-80s-time-travel-adventure-commodore-64-machine-code-programming-with-basic-6493caad13b4)**
  *(tutorial)*. End-to-end example of POKEing ML and `SYS`-ing it.


## Demoscene effects

### Tutorials (read these)

- **[Linus Åkesson — "An Introduction to Programming C-64 Demos"](https://www.antimon.org/code/Linus/)**
  *(tutorial, excellent)*. Concise, conceptual intro to raster effects, borders,
  scrollers, FLD/FLI from a top scener. Best single overview of *demo* coding.
- **[Codebase64 — demo programming index](https://codebase64.c64.org/doku.php?id=base:demo_programming)**
  *(community hub)*. Per-effect articles: stable rasters, FLD/FLI, border opening,
  sprite stretching, scroll routines. Cross-linked code you can lift.
- **[Codebase64 — tech-tech / FLI write-up](https://codebase64.c64.org/doku.php?id=base:techtech_fli)**
  *(reference)*. Worked example of the double-IRQ stabilizer used for FLI.
- **[Dustlayer "First Intro" tutorial](https://dustlayer.com/intro-to-coding)**
  *(beginner tutorial)*. Builds a complete classic intro (logo + scroller +
  music) step by step — the friendliest entry into demo coding.

### Effect-specific & advanced

- **[Linus Åkesson — Massively Interleaved Sprite Crunch](https://www.linusakesson.net/scene/lunatico/misc.php)**
  *(advanced)*. The sprite-crunch bug explained by the person who pushed it furthest.
- **[The Raistlin Papers (c64demo.com)](https://c64demo.com/)** *(blog series)*.
  A modern demo coder narrating real productions — all-border DYPPs, stable
  rasters, effect design decisions. Great for seeing how effects combine.
- **[Plasma effect (Rosetta Code)](https://rosettacode.org/wiki/Plasma_effect)**
  *(reference)*. The math behind plasma (portable, but the sine-table approach
  maps directly to C64).
- **[CSDb (Commodore Scene Database)](https://csdb.dk/)** *(archive)*. Every
  release, group, and coder; download demos and study their effects (many ship
  with notes/sources). The scene's collective memory.


## Game development

- **[Lasse "Cadaver" Oorni — game-loop / interpolation rants](https://cadaver.github.io/rants/interp.html)**
  *(primary, practitioner)*. Frameskip vs interpolation from a shipping-game
  author. Also see his other rants on game structure and his
  **[c64gameframework](https://github.com/cadaver/c64gameframework)** *(working
  reference codebase)* — a real, reusable game engine in assembly.
- **[Codebase64 — game programming](https://codebase64.c64.org/doku.php?id=base:game_programming)**
  *(community)*. Sprite multiplexers, collision, scrollers, input, map handling.
- **[nurpax — BINTRIS on the C64 (series)](https://nurpax.github.io/posts/2018-05-19-bintris-on-c64-part-1.html)**
  *(tutorial)*. A modern, well-written walk-through of building a real game in
  assembly with a cross-toolchain (KickAssembler), including charset/sprite
  pipeline and music integration.
- **[Dustlayer](https://dustlayer.com/)** *(tutorial)*. Foundational beginner
  series — sprites, interrupts, screen setup — that the patterns here build on.
- **[Making Games for the C64 / various Lemon64 & forum threads](https://www.lemon64.com/forum/)**
  *(community Q&A)*. Searchable archive of practical "how did they do X" answers.
