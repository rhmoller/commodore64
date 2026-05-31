/* VICE web debugger — front end. Talks JSON over WebSocket to server.py. */
(function () {
  "use strict";
  var hex = D6502.hex;
  var $ = function (id) { return document.getElementById(id); };

  // pepto-ish C64 palette
  var PAL = [[0,0,0],[255,255,255],[104,55,43],[112,164,178],[111,61,134],
    [88,141,67],[53,40,121],[184,199,111],[111,79,37],[67,57,0],[154,103,89],
    [68,68,68],[108,108,108],[154,210,132],[108,94,181],[149,149,149]];

  // ---- WebSocket RPC ----
  var ws, nextId = 1, pending = {}, running = false, sampling = false;
  var lastRegs = {}, memAddr = 0x0400, disAddr = null, bps = [];
  var curTab = "sprites";

  function connect() {
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
    ws.onmessage = onMsg;
    ws.onopen = function () { setConn(true); };
    ws.onclose = function () { setConn(false); setState("—"); setTimeout(connect, 1500); };
    ws.onerror = function () {};
  }
  function rpc(cmd, args) {
    return new Promise(function (res, rej) {
      if (!ws || ws.readyState !== 1) { rej(new Error("no ws")); return; }
      var id = nextId++;
      pending[id] = { res: res, rej: rej };
      ws.send(JSON.stringify(Object.assign({ id: id, cmd: cmd }, args || {})));
      setTimeout(function () { if (pending[id]) { pending[id].rej(new Error("timeout")); delete pending[id]; } }, 8000);
    });
  }
  function onMsg(e) {
    var m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.id && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.ok === false) p.rej(new Error(m.error || "error")); else p.res(m);
      return;
    }
    if (m.event) onEvent(m);
  }
  function onEvent(m) {
    if (m.event === "hello") {
      setConn(m.connected); $("viceaddr").textContent = m.vice || "";
      if (m.connected) { running = false; setState("stopped"); refreshAll(); }
    } else if (m.event === "stopped") {
      if (sampling) return;
      running = false; setState("stopped"); log("stopped", "@ $" + hex(m.pc || 0, 4)); refreshAll();
    } else if (m.event === "resumed") {
      if (sampling) return;
      running = true; setState("running"); log("resumed", "@ $" + hex(m.pc || 0, 4));
    } else if (m.event === "checkpoint") {
      var c = m.cp || {}; log("checkpoint", "#" + c.number + " hit @ $" + hex(c.start || 0, 4));
      markBpHit(c.number);
    } else if (m.event === "jam") {
      running = false; setState("jam"); log("jam", "CPU JAM @ $" + hex(m.pc || 0, 4)); refreshAll();
    } else if (m.event === "disconnected") {
      setConn(false); setState("—");
    }
  }

  function setConn(on) {
    var c = $("conn"); c.className = "conn " + (on ? "on" : "off");
    c.title = on ? "connected to VICE" : "VICE not connected";
  }
  function setState(s) {
    var el = $("state"); el.textContent = s;
    el.className = "state " + (s === "running" || s === "stopped" || s === "jam" ? s : "");
  }
  function log(kind, text) {
    var l = $("log"); var row = document.createElement("div");
    row.className = "logrow ev-" + kind;
    var t = new Date().toLocaleTimeString();
    row.innerHTML = '<span class="t">' + t + '</span>  ' + kind + " " + (text || "");
    l.insertBefore(row, l.firstChild);
    while (l.childNodes.length > 200) l.removeChild(l.lastChild);
  }

  // ---- memory helper ----
  function memread(start, len) {
    return rpc("mem", { start: start, end: (start + len - 1) & 0xffff }).then(function (m) {
      return Uint8Array.from(m.data);
    });
  }

  // ---- refresh everything (call when stopped) ----
  function refreshAll() {
    return rpc("regs").then(function (m) {
      lastRegs = m.regs; renderRegs(m.regs); renderFlags(m.regs); renderToolbar(m.regs);
      var pc = m.regs.PC || 0;
      return renderDisasm(disAddr == null ? pc : disAddr, pc);
    }).then(function () { return renderMemory(memAddr); })
      .then(function () { return renderVisual(); })
      .then(function () { renderBps(); })
      .catch(function (e) { log("err", String(e.message || e)); });
  }

  function renderToolbar(r) {
    $("pcreg").textContent = "PC " + hex(r.PC || 0, 4) +
      "  A " + hex(r.A || 0, 2) + " X " + hex(r.X || 0, 2) + " Y " + hex(r.Y || 0, 2) +
      (r.LIN != null ? "  raster " + r.LIN : "") + (r.CYC != null ? "  cyc " + r.CYC : "");
  }

  // ---- registers ----
  function renderRegs(r) {
    var order = [["PC", 4], ["A", 2], ["X", 2], ["Y", 2], ["SP", 2], ["00", 2], ["01", 2]];
    var html = "";
    order.forEach(function (o) {
      if (r[o[0]] == null) return;
      html += '<span class="regrow"><b>' + o[0] + '</b> <span class="regval" data-r="' + o[0] +
        '" data-w="' + o[1] + '">' + hex(r[o[0]], o[1]) + "</span></span>";
    });
    var el = $("regs"); el.innerHTML = html;
    el.querySelectorAll(".regval").forEach(function (s) {
      s.onclick = function () {
        var name = s.getAttribute("data-r");
        var v = prompt("Set " + name + " = $", hex(lastRegs[name] || 0, +s.getAttribute("data-w")));
        if (v == null) return;
        rpc("setreg", { name: name, value: parseInt(v.replace("$", ""), 16) })
          .then(refreshAll).catch(function (e) { log("err", e.message); });
      };
    });
  }
  function renderFlags(r) {
    var fl = r.FL || 0, names = ["N", "V", "-", "B", "D", "I", "Z", "C"], html = "";
    for (var i = 0; i < 8; i++) {
      var bit = (fl >> (7 - i)) & 1;
      html += '<span class="flag ' + (bit ? "set" : "clr") + '">' + names[i] + "</span>";
    }
    $("flags").innerHTML = html + '  <span class="dim">($' + hex(fl, 2) + ")</span>";
  }

  // ---- disassembly ----
  function renderDisasm(base, pc) {
    return memread(base, 64).then(function (mem) {
      var lines = D6502.disassemble(mem, base, base, 22);
      var html = "";
      lines.forEach(function (d) {
        var isbp = bps.some(function (b) { return b.op === "exec" && d.addr >= b.start && d.addr <= b.end; });
        var by = d.bytes.map(function (x) { return hex(x, 2); }).join(" ");
        html += '<div class="disline' + (d.addr === pc ? " pc" : "") + (isbp ? " bp" : "") +
          (d.illegal ? " illegal" : "") + '" data-a="' + d.addr + '">' +
          '<span class="da">' + hex(d.addr, 4) + "</span>" +
          '<span class="dbytes">' + by + "</span>" +
          '<span class="dtext">' + d.text + "</span></div>";
      });
      var el = $("disasm"); el.innerHTML = html;
      el.querySelectorAll(".disline").forEach(function (row) {
        row.onclick = function () { toggleExecBp(parseInt(row.getAttribute("data-a"))); };
      });
    });
  }

  // ---- memory hex ----
  function renderMemory(addr) {
    addr &= 0xfff0;
    return memread(addr, 128).then(function (mem) {
      var html = "";
      for (var row = 0; row < 8; row++) {
        var a = (addr + row * 16) & 0xffff;
        var bytes = "", ascii = "";
        for (var i = 0; i < 16; i++) {
          var v = mem[row * 16 + i];
          bytes += '<span class="memcell mb" data-a="' + ((a + i) & 0xffff) + '">' + hex(v, 2) + "</span> ";
          ascii += (v >= 32 && v < 127) ? String.fromCharCode(v) : ".";
        }
        html += '<div class="memrow"><span class="ma">' + hex(a, 4) + "</span>  " + bytes +
          ' <span class="mascii">' + escapeHtml(ascii) + "</span></div>";
      }
      var el = $("mem"); el.innerHTML = html;
      el.querySelectorAll(".memcell").forEach(function (c) {
        c.onclick = function () {
          var a = parseInt(c.getAttribute("data-a"));
          var v = prompt("poke $" + hex(a, 4) + " = $", c.textContent);
          if (v == null) return;
          rpc("poke", { addr: a, data: [parseInt(v.replace("$", ""), 16) & 0xff] })
            .then(function () { renderMemory(memAddr); }).catch(function (e) { log("err", e.message); });
        };
      });
    });
  }
  function escapeHtml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // ---- breakpoints ----
  function renderBps() {
    var html = "";
    bps.forEach(function (b) {
      html += '<div class="bprow' + (b.hit ? " hit" : "") + '" data-n="' + b.number + '">' +
        '<input type="checkbox" ' + (b.enabled ? "checked" : "") + ' data-n="' + b.number + '">' +
        '<span class="bpop">' + b.op + "</span>" +
        '<span class="bpa">$' + hex(b.start, 4) + (b.end !== b.start ? "-$" + hex(b.end, 4) : "") + "</span>" +
        '<span class="dim">hits ' + (b.hits || 0) + "</span>" +
        '<span class="x" data-n="' + b.number + '">✕</span></div>';
    });
    var el = $("bplist"); el.innerHTML = html || '<span class="dim">no breakpoints</span>';
    el.querySelectorAll(".x").forEach(function (x) {
      x.onclick = function () { delBp(parseInt(x.getAttribute("data-n"))); };
    });
    el.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      cb.onchange = function () {
        rpc("bptoggle", { number: parseInt(cb.getAttribute("data-n")), enabled: cb.checked });
        var b = bps.find(function (x) { return x.number == cb.getAttribute("data-n"); });
        if (b) b.enabled = cb.checked;
      };
    });
  }
  function addBp(start, op) {
    return rpc("bpset", { start: start, op: op }).then(function (m) {
      bps.push({ number: m.cp.number, start: m.cp.start, end: m.cp.end, op: op,
                 enabled: true, hits: 0, hit: false });
      renderBps(); renderDisasm(disAddr == null ? (lastRegs.PC || 0) : disAddr, lastRegs.PC);
    });
  }
  function delBp(number) {
    return rpc("bpdel", { number: number }).then(function () {
      bps = bps.filter(function (b) { return b.number !== number; });
      renderBps(); renderDisasm(disAddr == null ? (lastRegs.PC || 0) : disAddr, lastRegs.PC);
    });
  }
  function toggleExecBp(addr) {
    var ex = bps.find(function (b) { return b.op === "exec" && addr >= b.start && addr <= b.end; });
    if (ex) delBp(ex.number); else addBp(addr, "exec");
  }
  function markBpHit(number) {
    var b = bps.find(function (x) { return x.number === number; });
    if (b) { b.hit = true; b.hits = (b.hits || 0) + 1; renderBps(); }
  }

  // ---- visual panels ----
  function setpx(img, x, y, ci) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    var o = (y * img.width + x) * 4, c = PAL[ci & 15];
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  function vicState() {
    return Promise.all([memread(0xD000, 0x2f), memread(0xDD00, 1)]).then(function (a) {
      var v = a[0], dd00 = a[1][0];
      var bank = (~dd00 & 3) * 0x4000;
      var d018 = v[0x18];
      return {
        v: v, bank: bank,
        screen: bank + ((d018 >> 4) & 0xf) * 0x400,
        chars: bank + ((d018 >> 1) & 7) * 0x800,
        bitmap: bank + ((d018 >> 3) & 1) * 0x2000,
        d011: v[0x11], d016: v[0x16], d015: v[0x15], d017: v[0x17], d01c: v[0x1c], d01d: v[0x1d],
        bg: v[0x21] & 15, border: v[0x20] & 15,
        bg1: v[0x22] & 15, bg2: v[0x23] & 15, bg3: v[0x24] & 15,
        mm0: v[0x25] & 15, mm1: v[0x26] & 15,
        sprcol: [v[0x27]&15, v[0x28]&15, v[0x29]&15, v[0x2a]&15, v[0x2b]&15, v[0x2c]&15, v[0x2d]&15, v[0x2e]&15]
      };
    });
  }

  function renderVisual() {
    if (!ws || ws.readyState !== 1) return Promise.resolve();
    if (curTab === "sprites") return renderSprites();
    if (curTab === "charset") return renderCharset();
    if (curTab === "screen") return renderScreen();
    return Promise.resolve();
  }

  function renderSprites() {
    return vicState().then(function (s) {
      return memread(s.screen + 0x3f8, 8).then(function (ptrs) {
        var reads = [];
        for (var i = 0; i < 8; i++) reads.push(memread(s.bank + ptrs[i] * 64, 63));
        return Promise.all(reads).then(function (datas) {
          var cv = $("vcanvas"), ctx = cv.getContext("2d");
          var cellW = 56, cellH = 64, cols = 4, rows = 2;
          cv.width = cols * cellW; cv.height = rows * cellH;
          ctx.fillStyle = "#0c0e14"; ctx.fillRect(0, 0, cv.width, cv.height);
          var img = ctx.createImageData(24, 21);
          for (var i = 0; i < 8; i++) {
            var data = datas[i], on = (s.d015 >> i) & 1, mc = (s.d01c >> i) & 1, col = s.sprcol[i];
            for (var p = 0; p < img.data.length; p++) img.data[p] = 0;
            for (var y = 0; y < 21; y++) for (var b = 0; b < 3; b++) {
              var byte = data[y * 3 + b];
              if (mc) {
                for (var bp = 0; bp < 4; bp++) {
                  var pair = (byte >> (6 - bp * 2)) & 3, ci = -1;
                  if (pair === 1) ci = s.mm0; else if (pair === 2) ci = col; else if (pair === 3) ci = s.mm1;
                  if (ci >= 0) { var x = b * 8 + bp * 2; setpx(img, x, y, ci); setpx(img, x + 1, y, ci); }
                }
              } else {
                for (var bit = 0; bit < 8; bit++)
                  if (byte & (0x80 >> bit)) setpx(img, b * 8 + bit, y, col);
              }
            }
            // blit scaled 2x into the cell
            var cx = (i % cols) * cellW + 4, cy = ((i / cols) | 0) * cellH + 14;
            var tmp = document.createElement("canvas"); tmp.width = 24; tmp.height = 21;
            tmp.getContext("2d").putImageData(img, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tmp, cx, cy, 48, 42);
            ctx.fillStyle = on ? "#98c379" : "#7d8597"; ctx.font = "9px monospace";
            ctx.fillText("S" + i + (on ? "" : " off") + (mc ? " mc" : ""), cx, cy - 4);
          }
          $("visinfo").textContent = "VIC bank $" + hex(s.bank, 4) + "  sprite ptrs @ $" +
            hex(s.screen + 0x3f8, 4) + "  enabled $" + hex(s.d015, 2);
        });
      });
    });
  }

  // Character generator data for the current char base. The VIC fetches the
  // chargen ROM (not RAM) when the char base lands in a ROM image window
  // ($1000/$1800 in banks $0000/$8000); the monitor's RAM view can't see it,
  // so substitute the embedded ROM there. Returns {data, rom:bool}.
  function charGen(s) {
    var off = (s.chars - s.bank) & 0x3fff;
    var rom = window.CHARROM;
    if (rom && (s.bank === 0x0000 || s.bank === 0x8000) && (off === 0x1000 || off === 0x1800)) {
      var base = off === 0x1000 ? 0 : 2048;
      return Promise.resolve({ data: rom.subarray(base, base + 2048), rom: true });
    }
    return memread(s.chars, 2048).then(function (d) { return { data: d, rom: false }; });
  }

  function renderCharset() {
    return vicState().then(function (s) {
      return charGen(s).then(function (cg) {
        var cs = cg.data;
        var cv = $("vcanvas"), ctx = cv.getContext("2d");
        cv.width = 16 * 9; cv.height = 16 * 9;
        var img = ctx.createImageData(128, 128);
        for (var ch = 0; ch < 256; ch++) {
          var gx = (ch % 16) * 8, gy = ((ch / 16) | 0) * 8;
          for (var y = 0; y < 8; y++) {
            var byte = cs[ch * 8 + y];
            for (var x = 0; x < 8; x++)
              setpx(img, gx + x, gy + y, (byte & (0x80 >> x)) ? 1 : 0);
          }
        }
        var tmp = document.createElement("canvas"); tmp.width = 128; tmp.height = 128;
        tmp.getContext("2d").putImageData(img, 0, 0);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp, 0, 0, 128 * 1.125, 128 * 1.125);
        $("visinfo").textContent = "charset @ $" + hex(s.chars, 4) + " (256 glyphs, " +
          (cg.rom ? "chargen ROM" : "RAM") + " view)";
      });
    });
  }

  function renderScreen() {
    return vicState().then(function (s) {
      var bmm = (s.d011 & 0x20) !== 0, mcm = (s.d016 & 0x10) !== 0, ecm = (s.d011 & 0x40) !== 0;
      var reads = [memread(s.screen, 1000), memread(0xD800, 1000)];
      reads.push(bmm ? memread(s.bitmap, 8000)
                     : charGen(s).then(function (cg) { return cg.data; }));
      return Promise.all(reads).then(function (a) {
        var scr = a[0], colram = a[1], gfx = a[2];
        var cv = $("vcanvas"), ctx = cv.getContext("2d");
        cv.width = 320; cv.height = 200;
        var img = ctx.createImageData(320, 200);
        for (var cell = 0; cell < 1000; cell++) {
          var cxp = (cell % 40) * 8, cyp = ((cell / 40) | 0) * 8;
          var col = colram[cell] & 15;
          if (!bmm) {
            var ch = scr[cell], base = ch * 8;
            if (ecm) base = (ch & 0x3f) * 8;
            for (var y = 0; y < 8; y++) {
              var byte = gfx[base + y];
              if (mcm && (col & 8)) {
                for (var bp = 0; bp < 4; bp++) {
                  var pair = (byte >> (6 - bp * 2)) & 3, ci = s.bg;
                  if (pair === 1) ci = s.bg1; else if (pair === 2) ci = s.bg2; else if (pair === 3) ci = col & 7;
                  setpx(img, cxp + bp * 2, cyp + y, ci); setpx(img, cxp + bp * 2 + 1, cyp + y, ci);
                }
              } else {
                var bgc = s.bg;
                if (ecm) bgc = [s.bg, s.bg1, s.bg2, s.bg3][(ch >> 6) & 3];
                for (var x = 0; x < 8; x++) setpx(img, cxp + x, cyp + y, (byte & (0x80 >> x)) ? col : bgc);
              }
            }
          } else {
            var sc = scr[cell];
            for (var y2 = 0; y2 < 8; y2++) {
              var byte2 = gfx[cell * 8 + y2];
              if (mcm) {
                for (var bp2 = 0; bp2 < 4; bp2++) {
                  var pr = (byte2 >> (6 - bp2 * 2)) & 3, ci2;
                  if (pr === 0) ci2 = s.bg; else if (pr === 1) ci2 = (sc >> 4) & 15;
                  else if (pr === 2) ci2 = sc & 15; else ci2 = col;
                  setpx(img, cxp + bp2 * 2, cyp + y2, ci2); setpx(img, cxp + bp2 * 2 + 1, cyp + y2, ci2);
                }
              } else {
                for (var x2 = 0; x2 < 8; x2++)
                  setpx(img, cxp + x2, cyp + y2, (byte2 & (0x80 >> x2)) ? (sc >> 4) & 15 : sc & 15);
              }
            }
          }
        }
        ctx.putImageData(img, 0, 0);
        $("visinfo").textContent = "mode: " + (bmm ? (mcm ? "MC bitmap" : "hires bitmap")
          : (ecm ? "ECM text" : mcm ? "MC text" : "std text")) + "  screen $" + hex(s.screen, 4) +
          "  " + (bmm ? "bitmap $" + hex(s.bitmap, 4) : "chars $" + hex(s.chars, 4));
      });
    });
  }

  // ---- live sampler (poll while running) ----
  setInterval(function () {
    if (!(running && $("liveChk").checked) || sampling || !ws || ws.readyState !== 1) return;
    sampling = true;
    rpc("regs").then(function (m) {
      renderRegs(m.regs); renderFlags(m.regs); renderToolbar(m.regs);
      return renderVisual();
    }).catch(function () {}).then(function () {
      return rpc("cont").catch(function () {});
    }).then(function () { sampling = false; });
  }, 350);

  // ---- controls ----
  function wire(id, fn) { $(id).onclick = fn; }
  wire("btnStop", function () { rpc("stop").catch(function (e) { log("err", e.message); }); });
  wire("btnCont", function () { running = true; setState("running"); rpc("cont").catch(function (e) { log("err", e.message); }); });
  wire("btnStep", function () { rpc("step", { n: 1 }).then(refreshAll).catch(function (e) { log("err", e.message); }); });
  wire("btnOver", function () { rpc("stepover").then(refreshAll).catch(function (e) { log("err", e.message); }); });
  wire("btnOut",  function () { rpc("stepout").then(refreshAll).catch(function (e) { log("err", e.message); }); });
  wire("btnFrame", function () { rpc("stepframe").then(refreshAll).catch(function (e) { log("err", e.message); }); });
  wire("btnReset", function () { rpc("reset").then(function () { setTimeout(refreshAll, 300); }).catch(function (e) { log("err", e.message); }); });

  $("memRefresh").onclick = function () { renderMemory(memAddr); };
  $("memGoto").onchange = function () { memAddr = parseInt($("memGoto").value.replace("$", ""), 16) || 0; renderMemory(memAddr); };
  $("disGoto").onchange = function () {
    var v = $("disGoto").value.trim();
    disAddr = v ? (parseInt(v.replace("$", ""), 16) & 0xffff) : null;
    renderDisasm(disAddr == null ? (lastRegs.PC || 0) : disAddr, lastRegs.PC);
  };
  $("bpAdd").onclick = function () {
    var a = parseInt($("bpAddr").value.replace("$", ""), 16);
    if (!isNaN(a)) addBp(a, $("bpOp").value).catch(function (e) { log("err", e.message); });
  };
  $("visRefresh").onclick = function () { renderVisual().catch(function (e) { log("err", e.message); }); };
  $("logClear").onclick = function () { $("log").innerHTML = ""; };
  document.querySelectorAll(".tab").forEach(function (t) {
    t.onclick = function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active"); curTab = t.getAttribute("data-tab"); renderVisual();
    };
  });

  connect();
})();
