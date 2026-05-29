# ---------------------------------------------------------------------------
# C64 BASIC V2 build/run loop — uses VICE's petcat (tokenizer) + x64sc (emulator)
#
#   make run            tokenize hello.bas and autostart it in x64sc
#   make run SRC=foo.bas same, for a different source file
#   make warp           run with warp (fast) mode on
#   make mon            run with the remote monitor enabled (telnet localhost 6510)
#   make list           detokenize the .prg back to text (sanity check)
#   make watch          live-reload loop: re-tokenize + reload on every save
#   make reload         reload the current build into a running VICE (binary monitor)
#   make clean          remove generated .prg files
# ---------------------------------------------------------------------------

SRC    ?= hello.bas
PRG     = $(SRC:.bas=.prg)
EMU     = x64sc
PETCAT  = petcat

RELOAD = python3 ../tools/vice_reload.py

.PHONY: all build run warp mon list watch reload clean

all: build

build: $(PRG)

# Tokenize BASIC V2 text -> .prg (load address $0801). -w2 = write BASIC v2.0.
%.prg: %.bas
	$(PETCAT) -w2 -o $@ -- $<

# Load and RUN in the accurate emulator.
run: build
	$(EMU) -autostart $(PRG)

# Same, but warp speed (handy for long loops / no waiting).
warp: build
	$(EMU) -warp -autostart $(PRG)

# Launch with the text monitor exposed on TCP — connect with: telnet localhost 6510
# (peek/poke memory, registers, breakpoints; quit the monitor with 'x', exit with 'quit').
mon: build
	$(EMU) -remotemonitor -autostart $(PRG)

# Round-trip a .prg back to readable BASIC (verifies tokenization / inspects others' code).
list: $(PRG)
	$(PETCAT) $(PRG)

# Live-reload loop (re-tokenize + reload into the running emulator on save).
watch:
	./watch.sh $(SRC)

# Reload the current build into an already-running VICE (launched with -binarymonitor).
reload: build
	$(RELOAD) reload "$(abspath $(PRG))"

clean:
	rm -f *.prg
