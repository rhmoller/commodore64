import { StreamLanguage, type StringStream } from "@codemirror/language";

/**
 * A CodeMirror 6 stream language for KickAssembler 6502 source.
 *
 * Token names returned here are the classic CM5 style strings; StreamLanguage
 * maps them onto highlight tags, so `syntaxHighlighting(defaultHighlightStyle)`
 * colours them without extra wiring.
 */

// All documented 6502/6510 mnemonics, including the common "illegal" opcodes
// KickAss understands (slo, rla, lax, sax, dcp, isc, anc, alr, arr, sbx, …).
const MNEMONICS = new Set(
  (
    "adc and asl bcc bcs beq bit bmi bne bpl brk bvc bvs clc cld cli clv cmp " +
    "cpx cpy dec dex dey eor inc inx iny jmp jsr lda ldx ldy lsr nop ora pha " +
    "php pla plp rol ror rti rts sbc sec sed sei sta stx sty tax tay tsx txa " +
    "txs tya " +
    "slo rla sre rra sax lax dcp isc anc alr arr sbx las tas shy shx ahx xaa nop"
  ).split(/\s+/),
);

// KickAss directives (written with a leading dot) and the handful of common
// pseudo-ops. Stored without the dot; matched case-insensitively.
const DIRECTIVES = new Set(
  (
    "byte by word wo dword text encoding fill fillword align pc pseudopc const " +
    "var eval enum struct define label namespace segment segmentdef segmentout " +
    "macro pseudocommand function return if else for while assert print printnow " +
    "error import importonce importif filemodify file disk break watch zp memblock " +
    "cpu plugin lohifill modify"
  ).split(/\s+/),
);

interface KickState {
  block: boolean; // inside a /* … */ comment
}

function token(stream: StringStream, state: KickState): string | null {
  if (state.block) {
    if (stream.match(/^.*?\*\//)) state.block = false;
    else stream.skipToEnd();
    return "comment";
  }
  if (stream.eatSpace()) return null;

  // comments
  if (stream.match("//")) {
    stream.skipToEnd();
    return "comment";
  }
  if (stream.match("/*")) {
    state.block = true;
    return "comment";
  }

  // strings and char literals
  if (stream.match(/^"([^"\\]|\\.)*"?/)) return "string";
  if (stream.match(/^'([^'\\]|\\.)'?/)) return "string";

  // numbers: $hex, %bin, decimal
  if (stream.match(/^\$[0-9a-fA-F]+/)) return "number";
  if (stream.match(/^%[01]+/)) return "number";
  if (stream.match(/^\d+(\.\d+)?/)) return "number";

  // directives: .byte, .macro, .pc …
  if (stream.match(/^\.[A-Za-z_]\w*/)) {
    const word = stream.current().slice(1).toLowerCase();
    return DIRECTIVES.has(word) ? "meta" : "meta";
  }

  // preprocessor: #import, #define, #if …
  if (stream.match(/^#[A-Za-z]\w*/)) return "meta";

  // macro / pseudocommand call: :BasicUpstart2(...)
  if (stream.match(/^:[A-Za-z_]\w*/)) return "variable-2";

  // identifiers — mnemonic, label (name:), or symbol reference
  if (stream.match(/^[A-Za-z_]\w*/)) {
    const word = stream.current().toLowerCase();
    if (MNEMONICS.has(word)) return "keyword";
    if (stream.peek() === ":") return "def"; // label definition
    return "variable";
  }

  // '*' as the program-counter symbol (e.g. * = $0810)
  if (stream.match("*")) return "atom";

  // operators / punctuation
  if (stream.match(/^[-+/=<>!&|^~%(),.{}[\]@]/)) return "operator";

  stream.next();
  return null;
}

export const kickassLanguage = StreamLanguage.define<KickState>({
  name: "kickass",
  startState: () => ({ block: false }),
  token,
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
});
