#!/usr/bin/env bash
# Live-reload loop for C64 BASIC: on every save, re-tokenize and reload into the
# already-open VICE window via the binary monitor (no window flicker, no manual
# RUN). If the emulator isn't running, it's launched.
#
#   ./watch.sh [SRC.bas]        (default: hello.bas)
#
# Requires: petcat + x64sc (VICE), inotifywait (inotify-tools), python3.
set -uo pipefail

SRC="${1:-hello.bas}"
PRG="${SRC%.bas}.prg"
PORT="${VICE_BINMON_PORT:-6502}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RELOAD="$HERE/../tools/vice_reload.py"
ADDR="ip4://127.0.0.1:${PORT}"

build() { petcat -w2 -o "$PRG" -- "$SRC"; }
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

echo "watching $(dirname "$SRC")/*.bas — edit & save to reload ($SRC). Ctrl-C to stop."
while true; do
  ev=$(inotifywait -q -e close_write,moved_to --format '%f' "$HERE")
  case "$ev" in
    *.bas)
      if build; then
        if emu_up; then
          python3 "$RELOAD" --port "$PORT" reload "$(realpath "$PRG")" \
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
