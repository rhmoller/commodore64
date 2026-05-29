// 6502/6510 disassembler (incl. illegal opcodes). Pure data + a linear decoder.
(function (global) {
  // Each opcode -> "MNEMONIC mode". Modes: imp acc imm zp zpx zpy izx izy abs abx aby ind rel
  var T = (
    "BRK imp|ORA izx|KIL imp|SLO izx|NOP zp|ORA zp|ASL zp|SLO zp|PHP imp|ORA imm|ASL acc|ANC imm|NOP abs|ORA abs|ASL abs|SLO abs|" +
    "BPL rel|ORA izy|KIL imp|SLO izy|NOP zpx|ORA zpx|ASL zpx|SLO zpx|CLC imp|ORA aby|NOP imp|SLO aby|NOP abx|ORA abx|ASL abx|SLO abx|" +
    "JSR abs|AND izx|KIL imp|RLA izx|BIT zp|AND zp|ROL zp|RLA zp|PLP imp|AND imm|ROL acc|ANC imm|BIT abs|AND abs|ROL abs|RLA abs|" +
    "BMI rel|AND izy|KIL imp|RLA izy|NOP zpx|AND zpx|ROL zpx|RLA zpx|SEC imp|AND aby|NOP imp|RLA aby|NOP abx|AND abx|ROL abx|RLA abx|" +
    "RTI imp|EOR izx|KIL imp|SRE izx|NOP zp|EOR zp|LSR zp|SRE zp|PHA imp|EOR imm|LSR acc|ALR imm|JMP abs|EOR abs|LSR abs|SRE abs|" +
    "BVC rel|EOR izy|KIL imp|SRE izy|NOP zpx|EOR zpx|LSR zpx|SRE zpx|CLI imp|EOR aby|NOP imp|SRE aby|NOP abx|EOR abx|LSR abx|SRE abx|" +
    "RTS imp|ADC izx|KIL imp|RRA izx|NOP zp|ADC zp|ROR zp|RRA zp|PLA imp|ADC imm|ROR acc|ARR imm|JMP ind|ADC abs|ROR abs|RRA abs|" +
    "BVS rel|ADC izy|KIL imp|RRA izy|NOP zpx|ADC zpx|ROR zpx|RRA zpx|SEI imp|ADC aby|NOP imp|RRA aby|NOP abx|ADC abx|ROR abx|RRA abx|" +
    "NOP imm|STA izx|NOP imm|SAX izx|STY zp|STA zp|STX zp|SAX zp|DEY imp|NOP imm|TXA imp|XAA imm|STY abs|STA abs|STX abs|SAX abs|" +
    "BCC rel|STA izy|KIL imp|AHX izy|STY zpx|STA zpx|STX zpy|SAX zpy|TYA imp|STA aby|TXS imp|TAS aby|SHY abx|STA abx|SHX aby|AHX aby|" +
    "LDY imm|LDA izx|LDX imm|LAX izx|LDY zp|LDA zp|LDX zp|LAX zp|TAY imp|LDA imm|TAX imp|LAX imm|LDY abs|LDA abs|LDX abs|LAX abs|" +
    "BCS rel|LDA izy|KIL imp|LAX izy|LDY zpx|LDA zpx|LDX zpy|LAX zpy|CLV imp|LDA aby|TSX imp|LAS aby|LDY abx|LDA abx|LDX aby|LAX aby|" +
    "CPY imm|CMP izx|NOP imm|DCP izx|CPY zp|CMP zp|DEC zp|DCP zp|INY imp|CMP imm|DEX imp|AXS imm|CPY abs|CMP abs|DEC abs|DCP abs|" +
    "BNE rel|CMP izy|KIL imp|DCP izy|NOP zpx|CMP zpx|DEC zpx|DCP zpx|CLD imp|CMP aby|NOP imp|DCP aby|NOP abx|CMP abx|DEC abx|DCP abx|" +
    "CPX imm|SBC izx|NOP imm|ISC izx|CPX zp|SBC zp|INC zp|ISC zp|INX imp|SBC imm|NOP imp|SBC imm|CPX abs|SBC abs|INC abs|ISC abs|" +
    "BNE_ rel|SBC izy|KIL imp|ISC izy|NOP zpx|SBC zpx|INC zpx|ISC zpx|SED imp|SBC aby|NOP imp|ISC aby|NOP abx|SBC abx|INC abx|ISC abx"
  ).split("|");
  // fix the last row's first entry (BEQ, not BNE_)
  T[0xF0] = "BEQ rel";

  var LEN = { imp: 1, acc: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, izx: 2, izy: 2,
              abs: 3, abx: 3, aby: 3, ind: 3, rel: 2 };
  var LEGAL = {};
  "BRK ORA ASL PHP ANC BPL CLC JSR AND BIT ROL PLP BMI SEC RTI EOR LSR PHA ALR JMP BVC CLI RTS ADC ROR PLA ARR BVS SEI NOP STA STY STX DEY TXA TYA TXS BCC LDY LDA LDX TAY TAX CLV TSX BCS CPY CMP DEC INY DEX BNE CLD CPX SBC INC INX SED BEQ"
    .split(" ").forEach(function (m) { LEGAL[m] = true; });

  function hex(n, w) { var s = n.toString(16).toUpperCase(); while (s.length < w) s = "0" + s; return s; }

  // operand text for a given mode, reading operand bytes from arr at i (after opcode)
  function operand(mode, lo, hi, addr) {
    switch (mode) {
      case "imp": return "";
      case "acc": return "A";
      case "imm": return "#$" + hex(lo, 2);
      case "zp":  return "$" + hex(lo, 2);
      case "zpx": return "$" + hex(lo, 2) + ",X";
      case "zpy": return "$" + hex(lo, 2) + ",Y";
      case "izx": return "($" + hex(lo, 2) + ",X)";
      case "izy": return "($" + hex(lo, 2) + "),Y";
      case "abs": return "$" + hex(lo | (hi << 8), 4);
      case "abx": return "$" + hex(lo | (hi << 8), 4) + ",X";
      case "aby": return "$" + hex(lo | (hi << 8), 4) + ",Y";
      case "ind": return "($" + hex(lo | (hi << 8), 4) + ")";
      case "rel": var t = (addr + 2 + ((lo ^ 0x80) - 0x80)) & 0xffff; return "$" + hex(t, 4);
    }
    return "";
  }

  // Decode one instruction. arr: Uint8Array/array; off: index; addr: that byte's address.
  function decodeOne(arr, off, addr) {
    var op = arr[off] & 0xff;
    var parts = T[op].split(" ");
    var mne = parts[0], mode = parts[1];
    var len = LEN[mode] || 1;
    var lo = arr[off + 1] & 0xff, hi = arr[off + 2] & 0xff;
    var text = mne + (operand(mode, lo, hi, addr) ? " " + operand(mode, lo, hi, addr) : "");
    var raw = [];
    for (var k = 0; k < len; k++) raw.push(arr[off + k] & 0xff);
    return { addr: addr & 0xffff, len: len, text: text, mnemonic: mne, mode: mode,
             illegal: !LEGAL[mne], bytes: raw,
             target: targetAddr(mne, mode, lo, hi, addr) };
  }

  // branch/jump target (for following control flow), or null
  function targetAddr(mne, mode, lo, hi, addr) {
    if (mode === "rel") return (addr + 2 + ((lo ^ 0x80) - 0x80)) & 0xffff;
    if (mode === "abs" && (mne === "JMP" || mne === "JSR")) return (lo | (hi << 8)) & 0xffff;
    return null;
  }

  // Disassemble `count` instructions starting at memory offset for base address.
  // mem: Uint8Array covering [base, base+mem.length). start: absolute address.
  function disassemble(mem, base, start, count) {
    var out = [], addr = start;
    for (var n = 0; n < count; n++) {
      var off = addr - base;
      if (off < 0 || off >= mem.length) break;
      var d = decodeOne(mem, off, addr);
      out.push(d);
      addr = (addr + d.len) & 0xffff;
      if (addr - base >= mem.length) break;
    }
    return out;
  }

  global.D6502 = { decodeOne: decodeOne, disassemble: disassemble, hex: hex,
                   length: function (op) { return LEN[T[op & 0xff].split(" ")[1]] || 1; } };
})(window);
