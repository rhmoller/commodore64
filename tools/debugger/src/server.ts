/**
 * Web debugger relay for VICE (Node.js + TypeScript).
 *
 * Bridges a browser (WebSocket, JSON) to VICE's binary monitor (TCP, binary)
 * and serves the debugger web app. Zero runtime dependencies — Node built-ins
 * only. Runs directly under Node >= 22.6 via TypeScript type-stripping:
 *
 *     node tools/debugger/src/server.ts             # http://localhost:8080
 *     node tools/debugger/src/server.ts 8080 6502   # http port, vice binmon port
 *
 * Start VICE first with the binary monitor enabled, e.g.:
 *     x64sc -binarymonitor -binarymonitoraddress ip4://127.0.0.1:6502 <prog.prg>
 *
 * Architecture:
 *     browser ⇄ WebSocket(/ws, JSON) ⇄ this server ⇄ TCP(binary) ⇄ VICE binmon
 * Incoming VICE frames are parsed off the socket: command responses route to the
 * waiting request (by request id); async events (stopped/resumed/jam/checkpoint)
 * are broadcast to all connected browsers.
 */
import net from "node:net";
import http from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const WEBROOT = path.resolve(import.meta.dirname, "..", "web");

// ---- binary monitor protocol ------------------------------------------------
const STX = 0x02;
const API = 0x02;

const C = {
  MEM_GET: 0x01, MEM_SET: 0x02, CP_GET: 0x11, CP_SET: 0x12, CP_DELETE: 0x13,
  CP_LIST: 0x14, CP_TOGGLE: 0x15, CONDITION_SET: 0x22, REG_GET: 0x31,
  REG_SET: 0x32, DUMP: 0x41, RESOURCE_GET: 0x51, RESOURCE_SET: 0x52,
  ADVANCE: 0x71, KEYBOARD_FEED: 0x72, EXEC_RETURN: 0x73, PING: 0x81,
  BANKS: 0x82, REG_AVAIL: 0x83, DISPLAY_GET: 0x84, INFO: 0x85,
  EXIT: 0xaa, QUIT: 0xbb, RESET: 0xcc, AUTOSTART: 0xdd,
} as const;

const R_JAM = 0x61, R_STOPPED = 0x62, R_RESUMED = 0x63, R_CP_INFO = 0x11;
const OP: Record<string, number> = { exec: 4, load: 1, store: 2 };

/** Encode a request frame: [STX,API] len(u32le) rid(u32le) cmd(u8) body */
function enc(cmd: number, body: Buffer = Buffer.alloc(0), rid = 1): Buffer {
  const head = Buffer.alloc(11);
  head[0] = STX; head[1] = API;
  head.writeUInt32LE(body.length, 2);
  head.writeUInt32LE(rid >>> 0, 6);
  head[10] = cmd;
  return Buffer.concat([head, body]);
}

interface CmdResult { err: number; rtype: number; body: Buffer; }
interface Checkpoint {
  number: number; hit: boolean; start: number; end: number;
  stop: boolean; enabled: boolean; op: number; temporary: boolean; hits: number;
}
type EventMsg = Record<string, unknown>;
type EventCb = (ev: EventMsg) => void;

class ViceBridge {
  sock: net.Socket | null = null;
  host = "";
  port = 0;
  connected = false;
  regIds = new Map<string, number>();
  regNames = new Map<number, string>();

  private rid = 1000;
  private pending = new Map<number, { resolve: (r: CmdResult) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; }>();
  private subs = new Set<EventCb>();
  private stoppedWaiters: Array<() => void> = [];
  private buf: Buffer = Buffer.alloc(0);

  // -- connection --
  connect(host: string, port: number, timeoutMs = 20000): Promise<void> {
    this.host = host; this.port = port;
    const deadline = Date.now() + timeoutMs;
    return new Promise<void>((resolve, reject) => {
      const attempt = () => {
        const s = net.connect({ host, port });
        const onErr = (e: Error) => {
          s.removeListener("connect", onConn);
          s.destroy();
          if (Date.now() > deadline) reject(e);
          else setTimeout(attempt, 300);
        };
        const onConn = () => {
          s.removeListener("error", onErr);
          s.setNoDelay(true);
          this.sock = s;
          this.connected = true;
          s.on("data", (d) => this.onData(d));
          s.on("error", (e) => this.onClose(e));
          s.on("close", () => this.onClose());
          this.loadRegMap().catch(() => {}).then(() => resolve());
        };
        s.once("error", onErr);
        s.once("connect", onConn);
      };
      attempt();
    });
  }

  close(): void {
    this.connected = false;
    if (this.sock) { try { this.sock.destroy(); } catch { /* ignore */ } }
  }

  private onClose(err?: Error): void {
    if (!this.connected) return;
    this.connected = false;
    console.log("vice link lost:", err ? err.message : "closed");
    this.broadcast({ event: "disconnected" });
  }

  // -- incoming frame parser --
  // Response frame: [STX,API] len(u32le) rtype(u8) err(u8) rid(u32le) body[len]
  private onData(d: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      if (this.buf.length < 12) break;
      if (this.buf[0] !== STX) { this.buf = this.buf.subarray(1); continue; } // resync
      const len = this.buf.readUInt32LE(2);
      if (this.buf.length < 12 + len) break;
      const rtype = this.buf[6];
      const err = this.buf[7];
      const rid = this.buf.readUInt32LE(8);
      const body = Buffer.from(this.buf.subarray(12, 12 + len));
      this.buf = this.buf.subarray(12 + len);
      const p = this.pending.get(rid);
      if (p) { clearTimeout(p.timer); this.pending.delete(rid); p.resolve({ err, rtype, body }); }
      this.dispatchAsync(rtype, body);
    }
  }

  private dispatchAsync(rtype: number, body: Buffer): void {
    if (rtype === R_STOPPED && body.length >= 2) {
      this.resolveStopped();
      this.broadcast({ event: "stopped", pc: body.readUInt16LE(0) });
    } else if (rtype === R_RESUMED && body.length >= 2) {
      this.broadcast({ event: "resumed", pc: body.readUInt16LE(0) });
    } else if (rtype === R_JAM && body.length >= 2) {
      this.broadcast({ event: "jam", pc: body.readUInt16LE(0) });
    } else if (rtype === R_CP_INFO) {
      const cp = this.parseCp(body);
      if (cp && cp.hit) this.broadcast({ event: "checkpoint", cp });
    }
  }

  command(cmd: number, body: Buffer = Buffer.alloc(0), timeoutMs = 4000): Promise<CmdResult> {
    if (!this.sock) return Promise.reject(new Error("not connected"));
    this.rid = (this.rid + 1) & 0x7fffffff;
    const rid = this.rid;
    return new Promise<CmdResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        reject(new Error(`cmd 0x${cmd.toString(16)} timed out`));
      }, timeoutMs);
      this.pending.set(rid, { resolve, reject, timer });
      this.sock!.write(enc(cmd, body, rid));
    });
  }

  // -- subscriptions --
  subscribe(cb: EventCb): void { this.subs.add(cb); }
  unsubscribe(cb: EventCb): void { this.subs.delete(cb); }
  private broadcast(ev: EventMsg): void {
    for (const cb of [...this.subs]) { try { cb(ev); } catch { /* ignore */ } }
  }

  // -- registers --
  private async loadRegMap(): Promise<void> {
    const { body } = await this.command(C.REG_AVAIL, Buffer.from([0]));
    const n = body.readUInt16LE(0);
    let i = 2;
    for (let k = 0; k < n; k++) {
      const isz = body[i];
      const rid = body[i + 1];
      const nlen = body[i + 3];
      const name = body.subarray(i + 4, i + 4 + nlen).toString("ascii");
      this.regIds.set(name, rid);
      this.regNames.set(rid, name);
      i += 1 + isz;
    }
  }

  async regsGet(): Promise<Record<string, number>> {
    const { body } = await this.command(C.REG_GET, Buffer.from([0]));
    const out: Record<string, number> = {};
    const n = body.readUInt16LE(0);
    let i = 2;
    for (let k = 0; k < n; k++) {
      const isz = body[i];
      const rid = body[i + 1];
      out[this.regNames.get(rid) ?? String(rid)] = body.readUInt16LE(i + 2);
      i += 1 + isz;
    }
    return out;
  }

  async regSet(name: string, value: number): Promise<void> {
    const rid = this.regIds.get(name);
    if (rid === undefined) throw new Error("unknown register " + name);
    // body: u8 memspace, u16 count=1, item{ u8 size=3, u8 id, u16 value }
    const body = Buffer.alloc(7);
    body[0] = 0;
    body.writeUInt16LE(1, 1);
    body[3] = 3;
    body[4] = rid;
    body.writeUInt16LE(value & 0xffff, 5);
    const { err } = await this.command(C.REG_SET, body);
    if (err) throw new Error(`reg_set err 0x${err.toString(16)}`);
  }

  // -- memory --
  async memGet(start: number, end: number, bank = 0, side = 0): Promise<Buffer> {
    const body = Buffer.alloc(8);
    body[0] = side;
    body.writeUInt16LE(start, 1);
    body.writeUInt16LE(end, 3);
    body[5] = 0;
    body.writeUInt16LE(bank, 6);
    const { err, body: b } = await this.command(C.MEM_GET, body);
    if (err) throw new Error(`mem_get err 0x${err.toString(16)}`);
    const n = b.readUInt16LE(0);
    return b.subarray(2, 2 + n);
  }

  async memSet(start: number, data: number[] | Buffer, bank = 0, side = 0): Promise<CmdResult> {
    const d = Buffer.from(data);
    const end = start + d.length - 1;
    const head = Buffer.alloc(8);
    head[0] = side;
    head.writeUInt16LE(start, 1);
    head.writeUInt16LE(end, 3);
    head[5] = 0;
    head.writeUInt16LE(bank, 6);
    return this.command(C.MEM_SET, Buffer.concat([head, d]));
  }

  // -- checkpoints --
  private parseCp(b: Buffer): Checkpoint | null {
    if (b.length < 22) return null;
    return {
      number: b.readUInt32LE(0),
      hit: !!b[4],
      start: b.readUInt16LE(5),
      end: b.readUInt16LE(7),
      stop: !!b[9],
      enabled: !!b[10],
      op: b[11],
      temporary: !!b[12],
      hits: b.readUInt32LE(13),
    };
  }

  async cpSet(start: number, end = start, op = "exec", stop = true, enabled = true, temporary = false): Promise<Checkpoint | null> {
    const body = Buffer.alloc(8);
    body.writeUInt16LE(start, 0);
    body.writeUInt16LE(end, 2);
    body[4] = stop ? 1 : 0;
    body[5] = enabled ? 1 : 0;
    body[6] = OP[op];
    body[7] = temporary ? 1 : 0;
    const { body: b } = await this.command(C.CP_SET, body);
    return this.parseCp(b);
  }

  cpDelete(num: number): Promise<CmdResult> {
    const b = Buffer.alloc(4); b.writeUInt32LE(num, 0);
    return this.command(C.CP_DELETE, b);
  }

  cpToggle(num: number, enabled: boolean): Promise<CmdResult> {
    const b = Buffer.alloc(5); b.writeUInt32LE(num, 0); b[4] = enabled ? 1 : 0;
    return this.command(C.CP_TOGGLE, b);
  }

  // -- execution control --
  cont(): Promise<CmdResult> { return this.command(C.EXIT); }
  step(n = 1, over = false): Promise<CmdResult> {
    const b = Buffer.alloc(3); b[0] = over ? 1 : 0; b.writeUInt16LE(n, 1);
    return this.command(C.ADVANCE, b);
  }
  stepReturn(): Promise<CmdResult> { return this.command(C.EXEC_RETURN); }
  reset(hard = false): Promise<CmdResult> { return this.command(C.RESET, Buffer.from([hard ? 1 : 0])); }
  ping(): Promise<CmdResult> { return this.command(C.PING); }

  /** Resume and resolve once the emulator next stops (checkpoint hit / jam). */
  runUntilStop(timeoutMs = 4000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let done = false;
      const waiter = () => { if (done) return; done = true; clearTimeout(t); resolve(true); };
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        const i = this.stoppedWaiters.indexOf(waiter);
        if (i >= 0) this.stoppedWaiters.splice(i, 1);
        resolve(false);
      }, timeoutMs);
      this.stoppedWaiters.push(waiter);
      this.cont().catch(() => {});
    });
  }
  private resolveStopped(): void {
    const ws = this.stoppedWaiters;
    this.stoppedWaiters = [];
    for (const w of ws) w();
  }

  /** Break into the monitor now. Any command pauses a running emulator, so a
   *  ping is enough; VICE emits a STOPPED event which we relay to the UI. */
  async stop(): Promise<boolean> { await this.ping(); return true; }
}

const BR = new ViceBridge();

// ---- request dispatch (browser JSON -> bridge) ------------------------------
async function handleRequest(msg: Record<string, any>): Promise<Record<string, unknown>> {
  switch (msg.cmd) {
    case "ping": await BR.ping(); return { ok: true };
    case "regs": return { ok: true, regs: await BR.regsGet() };
    case "setreg": await BR.regSet(msg.name, Number(msg.value)); return { ok: true };
    case "mem": {
      const data = await BR.memGet(Number(msg.start), Number(msg.end), Number(msg.bank ?? 0));
      return { ok: true, start: Number(msg.start), data: [...data] };
    }
    case "poke": await BR.memSet(Number(msg.addr), msg.data); return { ok: true };
    case "step": await BR.step(Number(msg.n ?? 1), !!msg.over); return { ok: true };
    case "stepover": await BR.step(1, true); return { ok: true };
    case "stepout": await BR.stepReturn(); return { ok: true };
    case "stepframe": return { ok: true, result: await stepFrame() };
    case "cont": await BR.cont(); return { ok: true };
    case "stop": return { ok: true, cp: await BR.stop() };
    case "reset": await BR.reset(!!msg.hard); return { ok: true };
    case "bpset": {
      const cp = await BR.cpSet(Number(msg.start), Number(msg.end ?? msg.start),
        msg.op ?? "exec", msg.stop ?? true, true, !!msg.temporary);
      return { ok: true, cp };
    }
    case "bpdel": await BR.cpDelete(Number(msg.number)); return { ok: true };
    case "bptoggle": await BR.cpToggle(Number(msg.number), !!msg.enabled); return { ok: true };
    default: throw new Error("unknown cmd: " + String(msg.cmd));
  }
}

/** Advance roughly one video frame: break on the active IRQ handler.
 *  Reads the IRQ vector ($0314/$0315 if KERNAL is in, else $FFFE/$FFFF), sets a
 *  (non-temporary, so it stops cleanly) exec checkpoint there, runs until it
 *  fires, then removes it. */
async function stepFrame(): Promise<{ handler: number }> {
  const v = await BR.memGet(0x0314, 0x0315);
  let handler = v[0] | (v[1] << 8);
  if (handler < 0x0200 || handler === 0) {
    const hv = await BR.memGet(0xfffe, 0xffff);
    handler = hv[0] | (hv[1] << 8);
  }
  const cp = await BR.cpSet(handler, handler, "exec", true);
  await BR.runUntilStop(4000);
  if (cp) await BR.cpDelete(cp.number);
  return { handler };
}

// ---- WebSocket (minimal, RFC6455 text frames) -------------------------------
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function wsAccept(key: string): string {
  return createHash("sha1").update(key + WS_GUID).digest("base64");
}

function wsEncode(text: string): Buffer {
  const data = Buffer.from(text, "utf8");
  const n = data.length;
  let head: Buffer;
  if (n < 126) {
    head = Buffer.from([0x81, n]);
  } else if (n < 65536) {
    head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, data]);
}

/** Drive one upgraded socket as a WebSocket endpoint. */
function handleWs(socket: net.Socket, head: Buffer): void {
  let open = true;
  const send = (obj: unknown) => {
    if (!open) return;
    try { socket.write(wsEncode(JSON.stringify(obj))); } catch { /* ignore */ }
  };
  const onEvent: EventCb = (ev) => send(ev);
  BR.subscribe(onEvent);
  const cleanup = () => {
    if (!open) return;
    open = false;
    BR.unsubscribe(onEvent);
    try { socket.destroy(); } catch { /* ignore */ }
  };

  // tell the client the current connection state
  send({ event: "hello", connected: BR.connected, vice: `${BR.host}:${BR.port}` });

  let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  const onMessage = async (text: string) => {
    let msg: Record<string, any>;
    try { msg = JSON.parse(text); } catch { return; }
    try {
      const res = await handleRequest(msg);
      res.id = msg.id;
      send(res);
    } catch (e) {
      send({ id: msg.id ?? null, ok: false, error: (e as Error).message });
    }
  };

  socket.on("data", (d) => {
    buf = buf.length ? Buffer.concat([buf, d]) : d;
    for (;;) {
      if (buf.length < 2) break;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) break;
      let mask = Buffer.alloc(4);
      if (masked) { mask = buf.subarray(off, off + 4); off += 4; }
      const payload = Buffer.from(buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(need);
      if (opcode === 0x8) { cleanup(); return; }              // close
      else if (opcode === 0x1 || opcode === 0x0) onMessage(payload.toString("utf8")); // text/continuation
      // 0x9 ping / 0xA pong -> ignored
    }
  });
  socket.on("close", cleanup);
  socket.on("error", cleanup);
}

// ---- HTTP (static web app) + WS upgrade -------------------------------------
const CTYPE: Record<string, string> = {
  ".html": "text/html", ".js": "application/javascript",
  ".css": "text/css", ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  let p = (req.url ?? "/").split("?")[0];
  if (p === "/") p = "/index.html";
  const full = path.normalize(path.join(WEBROOT, p));
  if (!full.startsWith(WEBROOT)) { res.writeHead(404); res.end(); return; }
  try {
    const data = await readFile(full);
    const ctype = CTYPE[path.extname(full)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": ctype + "; charset=utf-8", "Cache-Control": "no-store" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
});

server.on("upgrade", (req, socket, head) => {
  const p = (req.url ?? "").split("?")[0];
  const key = req.headers["sec-websocket-key"];
  const sock = socket as net.Socket;
  if (p !== "/ws" || typeof key !== "string") { sock.destroy(); return; }
  sock.setNoDelay(true);
  sock.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`
  );
  handleWs(sock, head);
});

// ---- main -------------------------------------------------------------------
async function main(): Promise<void> {
  const httpPort = Number(process.argv[2] ?? 8080);
  const vicePort = Number(process.argv[3] ?? 6502);
  const viceHost = process.argv[4] ?? "127.0.0.1";
  console.log(`connecting to VICE binary monitor at ${viceHost}:${vicePort} ...`);
  try {
    await BR.connect(viceHost, vicePort, 8000);
    console.log("  connected; registers:", [...BR.regIds.keys()].sort().join(", ") || "(none)");
  } catch {
    console.log("  WARNING: could not connect to VICE (start it with -binarymonitor). " +
      "The UI will load; restart this server once VICE is up to reconnect.");
  }
  server.listen(httpPort, () => console.log(`debugger UI:  http://localhost:${httpPort}/`));
}

process.on("SIGINT", () => { console.log("\nstopping"); BR.close(); process.exit(0); });

main();
