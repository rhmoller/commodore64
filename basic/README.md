# Writing & running C64 BASIC V2 on Linux

You already have the whole toolchain: **VICE** (the emulator) ships with
**`petcat`** (a BASIC tokenizer/detokenizer). So the loop is:

```
edit  hello.bas   →   petcat tokenizes → hello.prg   →   x64sc autostarts & RUNs it
 (any editor)            (make build)                        (make run)
```

No IDE or extra install required. `make` wraps it:

```sh
make run               # tokenize hello.bas + launch x64sc, auto-RUN
make run SRC=game.bas  # build & run a different file
make warp              # run at warp (fast) speed
make list              # detokenize the .prg back to text (sanity check)
make mon               # run with the remote monitor (telnet localhost 6510)
make clean
```

## Writing the `.bas` file

It's plain text, lowercase, with numbered lines — exactly what you'd type on a
real C64, but in your editor:

```basic
10 print "{clr}hello"
20 poke 53280,0 : rem border black
```

Two things to know:

- **Stay ASCII.** `petcat` maps every byte to PETSCII, so a "smart quote" or an
  em-dash (`—`) becomes a stray token. Use straight quotes and `-`.
- **Control codes use `{...}` escapes** instead of inverse-video glyphs:
  `{clr}` (clear), `{home}`, `{down}`/`{up}`/`{left}`/`{rght}`, `{rvon}`/`{rvof}`
  (reverse), colors `{wht}`,`{red}`,`{cyn}`,`{blu}`…, function keys `{f1}`… See
  `petcat -h` for the full list. `make list` round-trips so you can see how your
  text tokenizes.

`petcat -w2` writes **BASIC V2.0** with the standard `$0801` load address, so the
`.prg` autostarts like any C64 program.

## How `make run` launches it

`x64sc -autostart hello.prg` loads the program and issues `RUN` automatically —
the tightest edit→run loop. (`x64sc` is VICE's *cycle-accurate* C64 build; plain
`x64` is faster but less precise.) Useful extra flags you can add to the EMU line:

- `-warp` — run flat-out (great for long `FOR` loops; toggle with the menu too).
- `-pal` / `-ntsc` — pick the video standard.
- `-moncommands FILE` — run monitor commands at startup (e.g. preset breakpoints).

## Live reload (the closest thing to HMR)

`make watch` gives you a save-triggered loop: edit `.bas`, save, and the program
re-tokenizes and **reloads into the already-open emulator window** — no manual
RUN, no window flicker.

```sh
make watch              # watches *.bas, reloads hello.bas on save
make watch SRC=foo.bas  # watch a different program
```

How it works: `watch.sh` launches `x64sc -binarymonitor` once, then on each save
re-runs `petcat` and tells the running emulator to autostart the new build via
[`../tools/vice_reload.py`](../tools/vice_reload.py) (VICE's binary-monitor
protocol). If you close the emulator, the next save relaunches it.

**Honest limits — this is live *reload*, not true HMR.** A C64 program is one blob
with no module system, so reloading code **resets the machine and re-runs from the
top** (state is lost). That's usually fine for the fast edit loop, but it isn't
"swap a function while the program keeps running."

**The exception — live *asset* injection, which *is* state-preserving.** You can
write new data straight into the running program's memory and see it on the next
frame, without resetting:

```sh
# change the border colour live ($D020 = 53280)
python3 ../tools/vice_reload.py poke '$d020' --data 05      # green

# drop a freshly-built charset into RAM the running program reads from $3000
python3 ../tools/vice_reload.py poke 0x3000 charset.bin

# load a .prg's payload at its intended address, skipping the 2-byte load header
python3 ../tools/vice_reload.py poke 0x2000 sprites.prg --skip 2
```

For graphics/demo work this is genuinely HMR-like: keep the program running and
hot-swap the charset/sprites/bitmap/level data it points at. (Requires the
emulator to be running with `-binarymonitor`, which `make watch` does for you.)

## Debugging

BASIC debugging on the C64 is mostly **interactive + machine-level** — there's no
source-line debugger, so combine these:

**In BASIC itself**
- `STOP` halts into READY; type `PRINT I,X$` to inspect variables, then `CONT`.
- Sprinkle `PRINT` traces; `?FRE(0)` shows free BASIC RAM (watch for leaks/strings).
- `RUN/STOP` breaks a running program; the line it stopped on is reported.

**In VICE's monitor** (machine level — for when BASIC isn't enough)
- Open it from the emulator menu (**Debug ▸ Monitor**), or run `make mon` and
  `telnet localhost 6510` for a scriptable session.
- Handy commands: `m c000 c0ff` (dump memory), `> 0400 01` (poke), `r` (registers),
  `break e5cd` (breakpoint), `x` (exit back to the emulator), `quit`.
- BASIC program text lives from **`$0801`**; BASIC variables from the top of the
  program. Zero page holds BASIC's state (e.g. current line `$39/$3A`).

**Inspecting/borrowing other programs**
- `petcat other.prg` (or `make list`) detokenizes any BASIC `.prg` to readable text.

## Want a nicer authoring experience?

Plain BASIC V2 has no labels, long names, or structure. Optional upgrades:

- **BASIC Dignified** (a preprocessor): write structured BASIC with labels and
  long variable names, then crunch it down to valid line-numbered V2. Has a
  VS Code extension. Good when programs get big.
- **CBM prg Studio** (Windows, runs under Wine): a full C64 IDE with a BASIC
  editor + integrated VICE launching, if you prefer a GUI over `make`.
- **Editor syntax highlighting**: CBM-BASIC syntax files exist for Vim/Neovim and
  VS Code; nice-to-have, not required.

## Files here

| File | What |
|------|------|
| `hello.bas` | sample program (colors, a `FOR/NEXT` loop, `GET` key wait) |
| `Makefile`  | the build/run/list/mon/clean targets above |
| `*.prg`     | generated tokenized programs (git-ignorable; `make clean` removes them) |
