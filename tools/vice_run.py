#!/usr/bin/env python3
"""Headless VICE verification for C64 programs.

Runs a .prg (or assembles a .asm first) in x64sc under Xvfb (no display needed),
so example/lesson code can be verified beyond "it assembles":

  run    — boot it under warp, capture an exit screenshot, detect a CPU JAM/crash
             vice_run.py run game.prg --screenshot out.png
  check  — boot it, let it settle, then assert memory/register values via the
           binary monitor (and optionally screenshot too)
             vice_run.py check game.prg --assert d020=00 --assert d021=06 --screenshot out.png

Accepts a .asm input directly (assembled with tools/kickass).
Prints a human summary and a final JSON line (for tools to parse). Exit code 0
means all checks passed and no JAM; nonzero otherwise.

Requires: xvfb-run + x64sc (VICE), and tools/kickass for .asm input.
"""
import argparse
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from vice_reload import Mon  # noqa: E402

KICKASS = os.path.join(HERE, "kickass")


def parse_num(s):
    """$xx / 0xxx -> hex; bare digits -> decimal; bare hex (has a-f) -> hex."""
    s = s.strip().lower()
    if s.startswith("$"):
        return int(s[1:], 16)
    if s.startswith("0x"):
        return int(s, 16)
    if re.fullmatch(r"[0-9]+", s):
        return int(s, 10)
    if re.fullmatch(r"[0-9a-f]+", s):
        return int(s, 16)
    raise ValueError(f"bad number: {s!r}")


def assemble(asm_path):
    prg = tempfile.NamedTemporaryFile(suffix=".prg", delete=False).name
    r = subprocess.run([KICKASS, asm_path, "-o", prg],
                       capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(prg):
        sys.stderr.write(r.stdout + r.stderr)
        raise SystemExit(f"assembly failed: {asm_path}")
    return prg


def prg_path(inp):
    if inp.endswith(".asm"):
        return assemble(inp), True
    return inp, False


def base_args(extra):
    # -default: ignore the user's vicerc; +sound: no audio device needed headless.
    return (["xvfb-run", "-a", "x64sc", "-default", "+sound",
             "-warp", "-autostart-warp", "-jamaction", "1"] + extra)


def log_has_jam(text):
    return bool(re.search(r"\bjam\b", text, re.I))


def do_run(args):
    prg, tmp = prg_path(args.input)
    extra = ["-limitcycles", str(args.cycles)]
    if args.screenshot:
        extra += ["-exitscreenshot", os.path.abspath(args.screenshot)]
    extra += ["-autostart", os.path.abspath(prg)]
    log = tempfile.NamedTemporaryFile(suffix=".log", delete=False).name
    with open(log, "w") as lf:
        try:
            subprocess.run(base_args(extra), stdout=lf, stderr=lf,
                           timeout=args.timeout)
        except subprocess.TimeoutExpired:
            pass  # -limitcycles should end it; timeout is just a safety net
    text = open(log, errors="replace").read()
    jam = log_has_jam(text)
    shot_ok = bool(args.screenshot) and os.path.exists(args.screenshot) \
        and os.path.getsize(args.screenshot) > 0
    if tmp:
        os.unlink(prg)
    out = {"mode": "run", "jam": jam,
           "screenshot": (args.screenshot if shot_ok else None)}
    print(f"jam: {jam}" + (f"   screenshot: {args.screenshot}" if shot_ok else ""))
    print("JSON " + json.dumps(out))
    return 1 if jam else 0


def do_check(args):
    prg, tmp = prg_path(args.input)
    checks = []
    for a in (args.assert_ or []):
        if "=" not in a:
            raise SystemExit(f"--assert must be ADDR=VALUE[:MASK], got {a!r}")
        addr, val = a.split("=", 1)
        mask = 0xff
        if ":" in val:                       # ADDR=VAL:MASK (e.g. d020=0:0f for the low nibble)
            val, mraw = val.split(":", 1)
            mask = parse_num(mraw)
        checks.append((a, parse_num(addr), parse_num(val), mask))

    extra = ["-binarymonitor",
             "-binarymonitoraddress", f"ip4://127.0.0.1:{args.port}"]
    if args.screenshot:
        extra += ["-exitscreenshot", os.path.abspath(args.screenshot)]
    extra += ["-autostart", os.path.abspath(prg)]
    log = tempfile.NamedTemporaryFile(suffix=".log", delete=False).name
    lf = open(log, "w")
    proc = subprocess.Popen(base_args(extra), stdout=lf, stderr=lf)

    results, jam = [], False
    mon = Mon("127.0.0.1", args.port, timeout=4.0)
    try:
        # wait for the binary monitor to come up
        deadline = time.time() + args.connect_timeout
        while True:
            try:
                mon.connect()
                break
            except OSError:
                if time.time() > deadline:
                    raise SystemExit("could not connect to VICE binary monitor")
                time.sleep(0.3)
        time.sleep(args.settle)  # let boot+autostart+program run (warp = fast)
        for raw, addr, expected, mask in checks:
            got = mon.memory_get(addr, addr)[0]
            ok = ((got & mask) == (expected & mask))
            results.append({"check": raw, "addr": addr, "mask": mask,
                            "expected": expected & 0xff, "got": got, "ok": ok})
        try:
            mon.quit()           # triggers exit screenshot
        except Exception:
            pass
    finally:
        mon.close()
        try:
            proc.wait(timeout=args.timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
        lf.close()

    jam = log_has_jam(open(log, errors="replace").read())
    shot_ok = bool(args.screenshot) and os.path.exists(args.screenshot) \
        and os.path.getsize(args.screenshot) > 0
    if tmp:
        os.unlink(prg)

    all_ok = all(r["ok"] for r in results) and not jam
    for r in results:
        mark = "ok " if r["ok"] else "FAIL"
        print(f"  [{mark}] ${r['addr']:04x} expected ${r['expected']:02x} "
              f"got ${r['got']:02x}  ({r['check']})")
    if jam:
        print("  [JAM] CPU jammed during run")
    out = {"mode": "check", "jam": jam, "all_ok": all_ok, "checks": results,
           "screenshot": (args.screenshot if shot_ok else None)}
    print("JSON " + json.dumps(out))
    return 0 if all_ok else 1


def main(argv=None):
    p = argparse.ArgumentParser(description="Headless VICE verification for C64 programs.")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="boot under warp, screenshot on exit, detect JAM")
    r.add_argument("input", help="a .prg or .asm")
    r.add_argument("--screenshot", help="PNG to save on exit")
    r.add_argument("--cycles", type=int, default=20_000_000,
                   help="run this many CPU cycles then quit (default 20M; must exceed autostart load time)")
    r.add_argument("--timeout", type=float, default=60.0)

    c = sub.add_parser("check", help="assert memory/register values via the binary monitor")
    c.add_argument("input", help="a .prg or .asm")
    c.add_argument("--assert", dest="assert_", action="append", metavar="ADDR=VAL",
                   help="e.g. d020=00 or '$d021=$06' or 53280=0 (repeatable)")
    c.add_argument("--screenshot", help="PNG to save on exit")
    c.add_argument("--settle", type=float, default=1.5,
                   help="seconds of (warp) run time before reading memory")
    c.add_argument("--port", type=int, default=6502)
    c.add_argument("--connect-timeout", type=float, default=20.0)
    c.add_argument("--timeout", type=float, default=30.0)

    a = p.parse_args(argv)
    if a.cmd == "run":
        return do_run(a)
    if a.cmd == "check":
        return do_check(a)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
