#!/usr/bin/env python3
"""Web debugger relay for VICE.

Bridges a browser (WebSocket, JSON) to VICE's binary monitor (TCP, binary) and
serves the debugger web app. Pure stdlib — no dependencies.

Run VICE first with the binary monitor enabled, e.g.:
    x64sc -binarymonitor -binarymonitoraddress ip4://127.0.0.1:6502 <prog.prg>

Then:
    python3 tools/debugger/server.py            # http://localhost:8080
    python3 tools/debugger/server.py 8080 6502  # http port, vice binmon port

Architecture:
    browser ⇄ WebSocket(/ws, JSON) ⇄ this server ⇄ TCP(binary) ⇄ VICE binmon
A reader thread parses VICE frames: command responses route to the waiting
request (by request id); async events (stopped/resumed/jam/checkpoint) are
broadcast to all connected browsers.
"""
import base64
import hashlib
import json
import os
import socket
import struct
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
WEBROOT = os.path.join(HERE, "web")

# ---- binary monitor protocol ------------------------------------------------
STX, API = 0x02, 0x02
ASYNC_ID = 0xffffffff
C = dict(MEM_GET=0x01, MEM_SET=0x02, CP_GET=0x11, CP_SET=0x12, CP_DELETE=0x13,
         CP_LIST=0x14, CP_TOGGLE=0x15, CONDITION_SET=0x22, REG_GET=0x31,
         REG_SET=0x32, DUMP=0x41, RESOURCE_GET=0x51, RESOURCE_SET=0x52,
         ADVANCE=0x71, KEYBOARD_FEED=0x72, EXEC_RETURN=0x73, PING=0x81,
         BANKS=0x82, REG_AVAIL=0x83, DISPLAY_GET=0x84, INFO=0x85,
         EXIT=0xaa, QUIT=0xbb, RESET=0xcc, AUTOSTART=0xdd)
R_JAM, R_STOPPED, R_RESUMED, R_CP_INFO = 0x61, 0x62, 0x63, 0x11


def enc(cmd, body=b"", rid=1):
    return (bytes([STX, API]) + struct.pack("<I", len(body))
            + struct.pack("<I", rid) + bytes([cmd]) + body)


class ViceBridge:
    """Owns the TCP link to VICE; thread-safe request/response + event fan-out."""

    def __init__(self):
        self.sock = None
        self.host = self.port = None
        self._rid = 1000
        self._lock = threading.Lock()
        self._pending = {}            # rid -> (event, [result])
        self._subs = []               # list of callables(event_dict)
        self._subs_lock = threading.Lock()
        self._stopped = threading.Event()   # set on STOPPED, cleared on RESUMED
        self.reg_ids = {}             # name -> id
        self.reg_names = {}           # id -> name
        self.connected = False

    # -- connection --
    def connect(self, host, port, timeout=20):
        self.host, self.port = host, port
        end = time.time() + timeout
        while True:
            try:
                s = socket.create_connection((host, port), 3.0)
                break
            except OSError:
                if time.time() > end:
                    raise
                time.sleep(0.3)
        s.settimeout(None)            # connect timeout was 3s; reader must block forever
        self.sock = s
        self.connected = True
        threading.Thread(target=self._reader, daemon=True).start()
        try:
            self._load_reg_map()
        except Exception:
            pass
        return True

    def close(self):
        self.connected = False
        if self.sock:
            try: self.sock.close()
            except OSError: pass

    # -- low level --
    def _recvn(self, n):
        buf = b""
        while len(buf) < n:
            c = self.sock.recv(n - len(buf))
            if not c:
                raise ConnectionError("vice closed")
            buf += c
        return buf

    def _reader(self):
        try:
            while self.connected:
                hdr = self._recvn(2)
                if hdr[0] != STX:
                    continue
                ln = struct.unpack("<I", self._recvn(4))[0]
                rtype = self._recvn(1)[0]
                err = self._recvn(1)[0]
                rid = struct.unpack("<I", self._recvn(4))[0]
                body = self._recvn(ln) if ln else b""
                if rid in self._pending:
                    ev, slot = self._pending[rid]
                    slot.append((err, rtype, body))
                    ev.set()
                self._dispatch_async(rtype, body)
        except Exception as e:
            print("vice link lost:", repr(e))
            self.connected = False
            self._broadcast({"event": "disconnected"})

    def _dispatch_async(self, rtype, body):
        if rtype == R_STOPPED and len(body) >= 2:
            self._stopped.set()
            self._broadcast({"event": "stopped", "pc": struct.unpack("<H", body[:2])[0]})
        elif rtype == R_RESUMED and len(body) >= 2:
            self._stopped.clear()
            self._broadcast({"event": "resumed", "pc": struct.unpack("<H", body[:2])[0]})
        elif rtype == R_JAM and len(body) >= 2:
            self._broadcast({"event": "jam", "pc": struct.unpack("<H", body[:2])[0]})
        elif rtype == R_CP_INFO:
            cp = self._parse_cp(body)
            if cp and cp.get("hit"):
                self._broadcast({"event": "checkpoint", "cp": cp})

    def command(self, cmd, body=b"", timeout=4.0):
        with self._lock:
            self._rid = (self._rid + 1) & 0x7fffffff
            rid = self._rid
            ev = threading.Event()
            slot = []
            self._pending[rid] = (ev, slot)
            self.sock.sendall(enc(cmd, body, rid))
        ok = ev.wait(timeout)
        self._pending.pop(rid, None)
        if not ok:
            raise TimeoutError(f"cmd 0x{cmd:02x} timed out")
        return slot[0]   # (err, rtype, body)

    # -- subscriptions --
    def subscribe(self, cb):
        with self._subs_lock:
            self._subs.append(cb)
    def unsubscribe(self, cb):
        with self._subs_lock:
            if cb in self._subs: self._subs.remove(cb)
    def _broadcast(self, ev):
        with self._subs_lock:
            subs = list(self._subs)
        for cb in subs:
            try: cb(ev)
            except Exception: pass

    # -- registers --
    def _load_reg_map(self):
        err, _, body = self.command(C["REG_AVAIL"], bytes([0]))
        i = 0
        n = struct.unpack("<H", body[0:2])[0]; i = 2
        for _ in range(n):
            isz = body[i]; rid = body[i+1]; nbits = body[i+2]; nlen = body[i+3]
            name = body[i+4:i+4+nlen].decode("ascii", "replace")
            self.reg_ids[name] = rid; self.reg_names[rid] = name
            i += 1 + isz
    def regs_get(self):
        err, _, body = self.command(C["REG_GET"], bytes([0]))
        out = {}; n = struct.unpack("<H", body[0:2])[0]; i = 2
        for _ in range(n):
            isz = body[i]; rid = body[i+1]; val = struct.unpack("<H", body[i+2:i+4])[0]
            out[self.reg_names.get(rid, str(rid))] = val
            i += 1 + isz
        return out
    def reg_set(self, name, value):
        rid = self.reg_ids.get(name)
        if rid is None: raise ValueError("unknown register " + name)
        # body: u8 memspace, u16 count=1, then item: u8 size(3), u8 id, u16 value
        body = bytes([0]) + struct.pack("<H", 1) + bytes([3, rid]) + struct.pack("<H", value & 0xffff)
        err, _, _ = self.command(C["REG_SET"], body)
        if err:
            raise ConnectionError(f"reg_set err {err:#x}")

    # -- memory --
    def mem_get(self, start, end, bank=0, side=0):
        body = struct.pack("<BHHBH", side, start, end, 0, bank)
        err, _, b = self.command(C["MEM_GET"], body)
        if err: raise ConnectionError(f"mem_get err {err:#x}")
        n = struct.unpack("<H", b[0:2])[0]
        return b[2:2+n]
    def mem_set(self, start, data, bank=0, side=0):
        end = start + len(data) - 1
        body = struct.pack("<BHHBH", side, start, end, 0, bank) + bytes(data)
        return self.command(C["MEM_SET"], body)

    # -- checkpoints --
    OP = {"exec": 4, "load": 1, "store": 2}
    def _parse_cp(self, b):
        if len(b) < 22: return None
        (num,) = struct.unpack("<I", b[0:4]); hit = b[4]
        start, end = struct.unpack("<HH", b[5:9])
        stop, enabled, op, temp = b[9], b[10], b[11], b[12]
        (hits,) = struct.unpack("<I", b[13:17])
        return {"number": num, "hit": bool(hit), "start": start, "end": end,
                "stop": bool(stop), "enabled": bool(enabled), "op": op,
                "temporary": bool(temp), "hits": hits}
    def cp_set(self, start, end=None, op="exec", stop=True, enabled=True, temporary=False):
        if end is None: end = start
        body = struct.pack("<HHBBBB", start, end, 1 if stop else 0,
                           1 if enabled else 0, self.OP[op], 1 if temporary else 0)
        err, _, b = self.command(C["CP_SET"], body)
        return self._parse_cp(b)
    def cp_delete(self, number):
        return self.command(C["CP_DELETE"], struct.pack("<I", number))
    def cp_toggle(self, number, enabled):
        return self.command(C["CP_TOGGLE"], struct.pack("<IB", number, 1 if enabled else 0))

    # -- execution control --
    def cont(self):       return self.command(C["EXIT"])
    def step(self, n=1, over=False):
        return self.command(C["ADVANCE"], struct.pack("<BH", 1 if over else 0, n))
    def step_return(self): return self.command(C["EXEC_RETURN"])
    def reset(self, hard=False): return self.command(C["RESET"], bytes([1 if hard else 0]))
    def ping(self):       return self.command(C["PING"])

    def run_until_stop(self, timeout=4.0):
        """Resume and block until the emulator stops (checkpoint hit / jam)."""
        self._stopped.clear()
        self.cont()
        return self._stopped.wait(timeout)

    def stop(self):
        """Break into the monitor now. Any command pauses a running emulator, so
        a ping is enough; VICE emits a STOPPED event which we relay to the UI."""
        self.ping()
        return True


BR = ViceBridge()


# ---- request dispatch (browser JSON -> bridge) ------------------------------
def handle_request(msg):
    cmd = msg.get("cmd")
    if cmd == "ping":
        BR.ping(); return {"ok": True}
    if cmd == "regs":
        return {"ok": True, "regs": BR.regs_get()}
    if cmd == "setreg":
        BR.reg_set(msg["name"], int(msg["value"])); return {"ok": True}
    if cmd == "mem":
        data = BR.mem_get(int(msg["start"]), int(msg["end"]), int(msg.get("bank", 0)))
        return {"ok": True, "start": int(msg["start"]), "data": list(data)}
    if cmd == "poke":
        BR.mem_set(int(msg["addr"]), bytes(msg["data"])); return {"ok": True}
    if cmd == "step":
        BR.step(int(msg.get("n", 1)), over=bool(msg.get("over"))); return {"ok": True}
    if cmd == "stepover":
        BR.step(1, over=True); return {"ok": True}
    if cmd == "stepout":
        BR.step_return(); return {"ok": True}
    if cmd == "stepframe":
        return {"ok": True, "result": step_frame()}
    if cmd == "cont":
        BR.cont(); return {"ok": True}
    if cmd == "stop":
        return {"ok": True, "cp": BR.stop()}
    if cmd == "reset":
        BR.reset(bool(msg.get("hard"))); return {"ok": True}
    if cmd == "bpset":
        cp = BR.cp_set(int(msg["start"]), int(msg.get("end", msg["start"])),
                       op=msg.get("op", "exec"), stop=bool(msg.get("stop", True)),
                       temporary=bool(msg.get("temporary", False)))
        return {"ok": True, "cp": cp}
    if cmd == "bpdel":
        BR.cp_delete(int(msg["number"])); return {"ok": True}
    if cmd == "bptoggle":
        BR.cp_toggle(int(msg["number"]), bool(msg["enabled"])); return {"ok": True}
    raise ValueError("unknown cmd: " + str(cmd))


def step_frame():
    """Advance roughly one video frame: break on the active IRQ handler.
    Reads the IRQ vector ($0314/$0315 if KERNAL is in, else $FFFE/$FFFF), sets a
    temporary exec checkpoint there, and continues until it fires."""
    v = BR.mem_get(0x0314, 0x0315)
    handler = v[0] | (v[1] << 8)
    if handler < 0x0200 or handler == 0:           # implausible -> use hardware vector
        hv = BR.mem_get(0xfffe, 0xffff); handler = hv[0] | (hv[1] << 8)
    cp = BR.cp_set(handler, handler, op="exec", stop=True)   # non-temporary stops cleanly
    BR.run_until_stop(timeout=4.0)
    BR.cp_delete(cp["number"])
    return {"handler": handler}


# ---- WebSocket (minimal, RFC6455 text frames) --------------------------------
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

def ws_accept(key):
    return base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()

def ws_send(sock, lock, text):
    data = text.encode("utf-8")
    n = len(data)
    if n < 126:
        hdr = bytes([0x81, n])
    elif n < 65536:
        hdr = bytes([0x81, 126]) + struct.pack(">H", n)
    else:
        hdr = bytes([0x81, 127]) + struct.pack(">Q", n)
    with lock:
        sock.sendall(hdr + data)

def ws_read(sock):
    """Read one client text frame -> str, or None on close."""
    def rd(n):
        b = b""
        while len(b) < n:
            c = sock.recv(n - len(b))
            if not c: return None
            b += c
        return b
    h = rd(2)
    if not h: return None
    op = h[0] & 0x0f
    ln = h[1] & 0x7f
    masked = h[1] & 0x80
    if ln == 126: ln = struct.unpack(">H", rd(2))[0]
    elif ln == 127: ln = struct.unpack(">Q", rd(8))[0]
    mask = rd(4) if masked else b"\0\0\0\0"
    payload = rd(ln) if ln else b""
    if payload is None: return None
    if op == 0x8: return None          # close
    if op == 0x9: return ""            # ping -> ignore (treat as empty)
    data = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return data.decode("utf-8", "replace")


# ---- HTTP + WS handler ------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a): pass

    def do_GET(self):
        if self.path.split("?")[0] == "/ws" and \
           self.headers.get("Upgrade", "").lower() == "websocket":
            return self._serve_ws()
        return self._serve_static()

    def _serve_static(self):
        path = self.path.split("?")[0]
        if path == "/": path = "/index.html"
        full = os.path.normpath(os.path.join(WEBROOT, path.lstrip("/")))
        if not full.startswith(WEBROOT) or not os.path.isfile(full):
            self.send_error(404); return
        ctype = {".html": "text/html", ".js": "application/javascript",
                 ".css": "text/css", ".svg": "image/svg+xml"}.get(
                 os.path.splitext(full)[1], "application/octet-stream")
        body = open(full, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _serve_ws(self):
        key = self.headers.get("Sec-WebSocket-Key")
        if not key:
            self.send_error(400); return
        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", ws_accept(key))
        self.end_headers()
        self.wfile.flush()          # push the 101 out before any WS frames hit the raw socket
        sock = self.connection
        lock = threading.Lock()
        # push VICE async events to this client
        def on_event(ev):
            try: ws_send(sock, lock, json.dumps(ev))
            except Exception: pass
        BR.subscribe(on_event)
        # tell the client current connection state
        ws_send(sock, lock, json.dumps({"event": "hello",
                "connected": BR.connected, "vice": f"{BR.host}:{BR.port}"}))
        try:
            while True:
                txt = ws_read(sock)
                if txt is None: break
                if not txt: continue
                try:
                    msg = json.loads(txt)
                    res = handle_request(msg)
                    res["id"] = msg.get("id")
                    ws_send(sock, lock, json.dumps(res))
                except Exception as e:
                    ws_send(sock, lock, json.dumps(
                        {"id": (json.loads(txt).get("id") if txt.startswith("{") else None),
                         "ok": False, "error": str(e)}))
        finally:
            BR.unsubscribe(on_event)


def main():
    http_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    vice_host = sys.argv[3] if len(sys.argv) > 3 else "127.0.0.1"
    vice_port = int(sys.argv[2]) if len(sys.argv) > 2 else 6502
    print(f"connecting to VICE binary monitor at {vice_host}:{vice_port} ...")
    try:
        BR.connect(vice_host, vice_port, timeout=8)
        print("  connected; registers:", ", ".join(sorted(BR.reg_ids)) or "(none)")
    except OSError:
        print("  WARNING: could not connect to VICE (start it with -binarymonitor). "
              "The UI will load; reconnect by restarting once VICE is up.")
    srv = ThreadingHTTPServer(("", http_port), Handler)
    print(f"debugger UI:  http://localhost:{http_port}/")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping"); BR.close()


if __name__ == "__main__":
    main()
