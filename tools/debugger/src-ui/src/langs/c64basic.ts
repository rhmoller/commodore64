import { StreamLanguage, type StringStream } from "@codemirror/language";

/**
 * A CodeMirror 6 stream language for Commodore BASIC V2 (petcat source form).
 * Keywords are matched case-insensitively though canonical source is uppercase.
 */

// Full BASIC V2 keyword/function set (with the $ / # suffixed forms).
const KEYWORDS = new Set(
  (
    "ABS AND ASC ATN CHR$ CLOSE CLR CMD CONT COS DATA DEF DIM END EXP FN FOR " +
    "FRE GET GOSUB GOTO IF INPUT INPUT# INT LEFT$ LEN LET LIST LOAD LOG MID$ " +
    "NEW NEXT NOT ON OPEN OR PEEK POKE POS PRINT PRINT# READ REM RESTORE RETURN " +
    "RIGHT$ RND RUN SAVE SGN SIN SPC SQR STATUS STEP STOP STR$ SYS TAB TAN THEN " +
    "TI TI$ TO USR VAL VERIFY WAIT GET# ST"
  ).split(/\s+/),
);

interface BasicState {
  start: boolean; // at the logical start of a line (after optional spaces)
}

function token(stream: StringStream, state: BasicState): string | null {
  if (stream.sol()) state.start = true;
  if (stream.eatSpace()) return null;

  // line number at the head of a line
  if (state.start && stream.match(/^\d+/)) {
    state.start = false;
    return "def";
  }
  state.start = false;

  // strings (BASIC has no escape characters)
  if (stream.match(/^"[^"]*"?/)) return "string";

  // numbers (incl. $hex used by some cross-assemblers, and scientific)
  if (stream.match(/^\$[0-9a-fA-F]+/)) return "number";
  if (stream.match(/^\d*\.?\d+(e[-+]?\d+)?/i)) return "number";

  // keywords / functions — longest case-insensitive match
  if (stream.match(/^[A-Za-z]+[$#]?/)) {
    const word = stream.current().toUpperCase();
    if (word === "REM") {
      stream.skipToEnd();
      return "comment";
    }
    if (KEYWORDS.has(word)) return "keyword";
    return "variable";
  }

  // operators / punctuation
  if (stream.match(/^[-+*/^=<>(),:;&]/)) return "operator";

  stream.next();
  return null;
}

export const c64basicLanguage = StreamLanguage.define<BasicState>({
  name: "c64basic",
  startState: () => ({ start: true }),
  token,
  languageData: {
    commentTokens: { line: "REM" },
  },
});
