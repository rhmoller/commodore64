#!/usr/bin/env bash
# Live-reload loop for KickAssembler 6502 source: on every save, re-assemble and
# reload the fresh .prg into the already-open VICE window via the binary monitor
# (no window flicker, no manual RUN). If the emulator isn't running, it's launched.
#
#   tools/watch_asm.sh [SRC.asm]        (default: useit/hello.asm)
#
# The source is reloaded with autostart+RUN, so it must be autostartable — i.e.
# built with a BASIC stub (KickAss `:BasicUpstart2(addr)`), as hello.asm is. For
# code with no BASIC entry, set RUN=0 to load without running (see below).
#
# Requires: java + KickAss.jar (via tools/kickass) + x64sc (VICE),
#           inotifywait (inotify-tools), python3.
#
# Env knobs:
#   VICE_BINMON_PORT   binary monitor port (default 6502)
#   RUN=0              load the build but don't RUN it (passes --no-run)
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${1:-$HERE/../useit/hello.asm}"
SRC="$(realpath "$SRC")"
PRG="${SRC%.asm}.prg"
WATCHDIR="$(dirname "$SRC")"
PORT="${VICE_BINMON_PORT:-6502}"
RELOAD="$HERE/vice_reload.py"
KICKASS="$HERE/kickass"
ADDR="ip4://127.0.0.1:${PORT}"
RELOAD_FLAGS=()
[ "${RUN:-1}" = "0" ] && RELOAD_FLAGS+=(--no-run)

build() { "$KICKASS" "$SRC" -o "$PRG"; }
emu_up() { python3 "$RELOAD" --port "$PORT" ping >/dev/null 2>&1; }
launch() {
  echo "launching x64sc (binary monitor on $PORT)…"
  x64sc -binarymonitor -binarymonitoraddress "$ADDR" -autostart "$PRG" >/dev/null 2>&1 &
  disown
}

if ! command -v inotifywait >/dev/null; then
  echo "need inotifywait (pacman -S inotify-tools)"; exit 1
fi

if ! build; then echo "initial build failed — fix $SRC and rerun"; exit 1; fi
emu_up || { launch; sleep 2; }

echo "watching $WATCHDIR/*.asm — edit & save to reload ($(basename "$SRC")). Ctrl-C to stop."
while true; do
  ev=$(inotifywait -q -e close_write,moved_to --format '%f' "$WATCHDIR")
  case "$ev" in
    *.asm)
      if build; then
        if emu_up; then
          python3 "$RELOAD" --port "$PORT" reload "${RELOAD_FLAGS[@]}" "$PRG" \
            && echo "↻ reloaded $(date +%T)" \
            || { echo "reload failed — relaunching"; launch; }
        else
          launch
        fi
      else
        echo "✗ build failed $(date +%T)"
      fi
      ;;
  esac
done
