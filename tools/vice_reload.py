#!/usr/bin/env python3
"""Drive a running VICE emulator over its binary monitor (the closest thing the
C64 has to hot-reload).

Launch VICE with the binary monitor enabled, e.g.:
    x64sc -binarymonitor -binarymonitoraddress ip4://127.0.0.1:6502 -autostart prog.prg

Then, while it keeps running:
    vice_reload.py reload prog.prg        # load + RUN a new build (resets the machine)
    vice_reload.py poke 0x3000 font.bin   # write bytes into the RUNNING program's memory
    vice_reload.py poke '$d020' --data 02 # quick poke (hex byte string)
    vice_reload.py reset [soft|hard]
    vice_reload.py ping

`poke` is the state-preserving, HMR-like move: drop a new charset / sprite / level
into memory and the running program shows it on the next frame — no reset.

Protocol: VICE Binary Monitor (see the VICE manual). Pure stdlib; no deps.
"""
import argparse
import socket
import struct
import sys

# command types
CMD_MEMORY_GET = 0x01
CMD_MEMORY_SET = 0x02
CMD_RESET      = 0xcc
CMD_AUTOSTART  = 0xdd
CMD_EXIT       = 0xaa
CMD_QUIT       = 0xbb
CMD_PING       = 0x81

API = 0x02
STX = 0x02
ASYNC_ID = 0xffffffff


def encode(cmd_type, body=b"", req_id=1):
    return (bytes([STX, API]) + struct.pack("<I", len(body))
            + struct.pack("<I", req_id) + bytes([cmd_type]) + body)


def parse_addr(s):
    s = s.strip().lower().replace("$", "0x")
    return int(s, 0)


def parse_hexdata(s):
    s = s.replace(" ", "").replace(",", "")
    return bytes.fromhex(s)


class Mon:
    def __init__(self, host, port, timeout=5.0, dry_run=False):
        self.host, self.port, self.timeout = host, port, timeout
        self.dry_run = dry_run
        self._id = 0
        self.sock = None

    def connect(self):
        if self.dry_run:
            return
        self.sock = socket.create_connection((self.host, self.port), self.timeout)
        self.sock.settimeout(self.timeout)

    def _recvall(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("monitor closed the connection")
            buf += chunk
        return buf

    def command(self, cmd_type, body=b""):
        self._id += 1
        frame = encode(cmd_type, body, self._id)
        if self.dry_run:
            print(f"  [dry-run] cmd 0x{cmd_type:02x} id {self._id}: {frame.hex()}")
            return (0, b"")
        self.sock.sendall(frame)
        # read responses until ours (skip async events: stop/resume, id 0xffffffff)
        while True:
            stx, api = self._recvall(2)
            if stx != STX:
                raise ConnectionError(f"bad STX 0x{stx:02x}")
            (length,) = struct.unpack("<I", self._recvall(4))
            resp_type = self._recvall(1)[0]
            err = self._recvall(1)[0]
            (rid,) = struct.unpack("<I", self._recvall(4))
            body = self._recvall(length) if length else b""
            if rid == self._id:
                return (err, body)
            # else: async event for a different/sentinel id -> ignore

    # --- high level ops ---
    def ping(self):
        return self.command(CMD_PING)

    def reset(self, hard=False):
        return self.command(CMD_RESET, bytes([1 if hard else 0]))

    def autostart(self, path, run=True):
        fn = path.encode()
        if len(fn) > 255:
            raise ValueError("filename too long")
        body = struct.pack("<BHB", 1 if run else 0, 0, len(fn)) + fn
        return self.command(CMD_AUTOSTART, body)

    def memory_get(self, start, end, memspace=0, bank=0, side_effects=0):
        """Read [start, end] inclusive from the running machine. Returns bytes."""
        body = struct.pack("<BHHBH", side_effects, start, end, memspace, bank)
        err, resp = self.command(CMD_MEMORY_GET, body)
        if err:
            raise ConnectionError(f"memory_get error 0x{err:02x}")
        if self.dry_run:
            return b""
        (n,) = struct.unpack("<H", resp[:2])
        return resp[2:2 + n]

    def quit(self):
        """Tell VICE to quit the emulator."""
        return self.command(CMD_QUIT)

    def memory_set(self, start, data, memspace=0, bank=0, side_effects=0):
        end = start + len(data) - 1
        if end > 0xffff:
            raise ValueError("write runs past $FFFF")
        header = struct.pack("<BHHBH", side_effects, start, end, memspace, bank)
        return self.command(CMD_MEMORY_SET, header + data)

    def exit_monitor(self):
        return self.command(CMD_EXIT)

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass


def main(argv=None):
    p = argparse.ArgumentParser(description="Drive a running VICE via its binary monitor.")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=6502)
    p.add_argument("--dry-run", action="store_true", help="print frames instead of connecting")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ping")
    pr = sub.add_parser("reset"); pr.add_argument("mode", nargs="?", default="soft", choices=["soft", "hard"])
    pl = sub.add_parser("reload"); pl.add_argument("prg"); pl.add_argument("--no-run", action="store_true")
    pk = sub.add_parser("poke")
    pk.add_argument("addr")
    pk.add_argument("file", nargs="?", help="binary file to write")
    pk.add_argument("--data", help="hex bytes instead of a file, e.g. 'a9 00 8d 20 d0'")
    pk.add_argument("--skip", type=int, default=0, help="skip N leading bytes of the file (e.g. 2 to drop a .prg load address)")

    a = p.parse_args(argv)
    mon = Mon(a.host, a.port, dry_run=a.dry_run)
    try:
        mon.connect()
    except OSError as e:
        sys.stderr.write(
            f"error: can't reach VICE binary monitor at {a.host}:{a.port} ({e}).\n"
            f"Launch the emulator with:  x64sc -binarymonitor "
            f"-binarymonitoraddress ip4://{a.host}:{a.port} -autostart <prg>\n")
        return 2

    try:
        if a.cmd == "ping":
            err, _ = mon.ping()
        elif a.cmd == "reset":
            err, _ = mon.reset(hard=(a.mode == "hard"))
        elif a.cmd == "reload":
            import os
            err, _ = mon.autostart(os.path.abspath(a.prg), run=not a.no_run)
        elif a.cmd == "poke":
            start = parse_addr(a.addr)
            if a.data:
                data = parse_hexdata(a.data)
            elif a.file:
                with open(a.file, "rb") as f:
                    data = f.read()[a.skip:]
            else:
                p.error("poke needs a FILE or --data")
            err, _ = mon.memory_set(start, data)
            if not a.dry_run:
                print(f"wrote {len(data)} byte(s) to ${start:04x}-${start+len(data)-1:04x}")
        else:
            p.error("unknown command")
        if err:
            sys.stderr.write(f"VICE returned error code 0x{err:02x}\n")
            return 1
        return 0
    except (OSError, ConnectionError, ValueError) as e:
        sys.stderr.write(f"error: {e}\n")
        return 1
    finally:
        mon.close()


if __name__ == "__main__":
    raise SystemExit(main())
