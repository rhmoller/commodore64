# Appendix G — PETSCII, Screen Codes & Color Codes

The C64 uses three distinct numeric encodings that are frequently confused:

- **PETSCII** — the character set the KERNAL works in. It is what `PRINT`, `CHR$()`, `GET`, `INPUT`, files, and the keyboard use. Values `$00–$1F` and `$80–$9F` are **control codes** (color, cursor, modes) that perform an action rather than print a glyph.
- **Screen codes (POKE codes)** — the values actually stored in screen RAM (`$0400–$07E7`, 1024–2023). A screen code selects which 8x8 glyph the VIC-II fetches from the character generator. These are **not** the same numbers as PETSCII.
- **Color codes** — the 4-bit values 0–15 stored in Color RAM (`$D800–$DBE7`, 55296–56295) and in registers like `$D020`/`$D021`.

---

## G.1 PETSCII Control Codes

Embed these in strings (`PRINT CHR$(n);` or `PRINT "...";` with reverse-shown tokens) to control color, cursor and screen state. They print no glyph.

### Colors (text / cursor color)

| CHR$ (dec) | Hex | Color | Color code |
|---|---|---|---|
| 144 | $90 | Black | 0 |
| 5 | $05 | White | 1 |
| 28 | $1C | Red | 2 |
| 159 | $9F | Cyan | 3 |
| 156 | $9C | Purple / Violet | 4 |
| 30 | $1E | Green | 5 |
| 31 | $1F | Blue | 6 |
| 158 | $9E | Yellow | 7 |
| 129 | $81 | Orange | 8 |
| 149 | $95 | Brown | 9 |
| 150 | $96 | Light red (pink) | 10 |
| 151 | $97 | Dark grey | 11 |
| 152 | $98 | Grey (medium) | 12 |
| 153 | $99 | Light green | 13 |
| 154 | $9A | Light blue | 14 |
| 155 | $9B | Light grey | 15 |

### Cursor, screen & editing

| CHR$ (dec) | Hex | Effect |
|---|---|---|
| 13 | $0D | RETURN (carriage return + linefeed) |
| 141 | $8D | Shifted RETURN (no token forced; used in line continuation) |
| 17 | $11 | Cursor down |
| 145 | $91 | Cursor up |
| 29 | $1D | Cursor right |
| 157 | $9D | Cursor left |
| 19 | $13 | HOME (cursor to top-left) |
| 147 | $93 | CLR (clear screen + HOME) |
| 20 | $14 | DELETE (backspace, pulls text left) |
| 148 | $94 | INSERT (opens a space) |
| 18 | $12 | Reverse ON (subsequent chars get +128 screen code) |
| 146 | $92 | Reverse OFF |

### Mode / keyboard control

| CHR$ (dec) | Hex | Effect |
|---|---|---|
| 14 | $0E | Switch to lower/uppercase charset (text mode) |
| 142 | $8E | Switch to uppercase/graphics charset (default) |
| 8 | $08 | Disable Shift+Commodore charset switching |
| 9 | $09 | Enable Shift+Commodore charset switching |
| 3 | $03 | STOP |
| 133–140 | $85–$8C | Function keys F1–F8 (read via GET; 133=F1,134=F3,135=F5,136=F7,137=F2,138=F4,139=F6,140=F8) |

KickAssembler example (raw PETSCII bytes for a KERNAL `CHROUT` print routine):

```asm
msg:    .byte 147       // CLR
        .byte 30        // green
        .byte 18        // reverse on
        .text "HELLO"
        .byte 146       // reverse off
        .byte 13, 0     // RETURN, null terminator
```

---

## G.2 Screen Codes (POKE codes)

A screen code is the value placed in screen RAM (`$0400+`). The VIC-II uses it as the index into the 8x8 char ROM/RAM glyphs. Range **0–127** are the normal glyphs; **128–255** are the **reverse-video** versions (`screencode + 128`). The layout below is for the **uppercase/graphics** charset (the power-on default).

| Screen code (dec) | Hex | Character |
|---|---|---|
| 0 | $00 | `@` |
| 1–26 | $01–$1A | `A`–`Z` |
| 27 | $1B | `[` |
| 28 | $1C | `£` (pound) |
| 29 | $1D | `]` |
| 30 | $1E | `↑` (up arrow) |
| 31 | $1F | `←` (left arrow) |
| 32 | $20 | space |
| 33–47 | $21–$2F | `! " # $ % & ' ( ) * + , - . /` |
| 48–57 | $30–$39 | `0`–`9` |
| 58–63 | $3A–$3F | `: ; < = > ?` |
| 64–95 | $40–$5F | graphics characters (and `+`-cross, lines, etc.) |
| 96–127 | $60–$7F | graphics / block characters |
| 128–255 | $80–$FF | reverse video of codes 0–127 (i.e. `code XOR/+128`) |

### Screen code vs PETSCII — the key differences

| Char | Screen code | PETSCII (dec) |
|---|---|---|
| `@` | 0 | 64 |
| `A` | 1 | 65 |
| `Z` | 26 | 90 |
| `0` | 48 | 48 |
| `9` | 57 | 57 |
| space | 32 | 32 |
| `!` | 33 | 33 |

Observations:
- **Letters differ**: `A`–`Z` are screen codes 1–26 but PETSCII 65–90 (uppercase) — subtract 64 to convert uppercase PETSCII letters to screen codes.
- **Digits, space and most punctuation `$20–$3F` are identical** in both encodings.
- **Reverse video**: there is no "reverse on" screen code. To show a reversed glyph you POKE `code + 128` directly. (`CHR$(18)` does this automatically when printing.)
- General conversion rule (uppercase set): PETSCII `$40–$5F` → screen `$00–$1F`; PETSCII `$60–$7F` → screen `$40–$5F`; PETSCII `$A0–$BF` → screen `$60–$7F`; PETSCII `$C0–$FF` → screen `$40–$7F`. Codes `$20–$3F` map unchanged.

KickAssembler — write "HI" at top-left of screen, white, using screen RAM + color RAM directly:

```asm
        lda #8          // 'H' screen code (PETSCII 'H'=72, -64=8)
        sta $0400
        lda #9          // 'I' screen code
        sta $0401
        lda #1          // color 1 = white
        sta $d800
        sta $d801
```

---

## G.3 Color Codes (0–15)

These 4-bit values go into Color RAM (`$D800–$DBE7`), the border (`$D020`/53280), background (`$D021`/53281), and sprite/multicolor registers. Names match Appendix C palette ordering.

| Code | Hex | Name |
|---|---|---|
| 0 | $0 | Black |
| 1 | $1 | White |
| 2 | $2 | Red |
| 3 | $3 | Cyan |
| 4 | $4 | Purple / Violet |
| 5 | $5 | Green |
| 6 | $6 | Blue |
| 7 | $7 | Yellow |
| 8 | $8 | Orange |
| 9 | $9 | Brown |
| 10 | $A | Light red (pink) |
| 11 | $B | Dark grey |
| 12 | $C | Grey (medium) |
| 13 | $D | Light green |
| 14 | $E | Light blue |
| 15 | $F | Light grey |

Only the low nibble of Color RAM bytes is significant; the high nibble is ignored in standard (hi-res) text mode.

---

## G.4 The Two Character Sets & petcat escapes

The C64 ships with two 256-char fonts in the same ROM:

- **Uppercase/graphics** (power-on default): uppercase letters plus PETSCII graphic/block glyphs. Selected by `CHR$(142)` (PETSCII) or POKE `$D018`.
- **Lower/uppercase ("text")**: lowercase + uppercase letters, fewer graphics. Selected by `CHR$(14)`.

From assembly, the charset is chosen by the VIC-II memory pointer `$D018` (53272): with the default char ROM at the start of the bank, value `$15` (21) selects uppercase/graphics and `$17` (23) selects lower/uppercase. `CHR$(8)`/`CHR$(9)` enable/disable the user toggling sets with Shift+Commodore.

### petcat `{...}` escape names

`petcat` (the VICE tokenizer/de-tokenizer) prints non-printable PETSCII control codes as `{name}` tokens so source listings stay readable. They denote the **same PETSCII decimal values** above:

| petcat token | CHR$ (dec) | Meaning |
|---|---|---|
| `{clr}` | 147 | CLR |
| `{home}` | 19 | HOME |
| `{down}` | 17 | cursor down |
| `{up}` | 145 | cursor up |
| `{rght}` | 29 | cursor right |
| `{left}` | 157 | cursor left |
| `{rvon}` | 18 | reverse on |
| `{rvof}` | 146 | reverse off |
| `{wht}` | 5 | white |
| `{red}` | 28 | red |
| `{grn}` | 30 | green |
| `{blu}` | 31 | blue |
| `{blk}` | 144 | black |
| `{pur}` | 156 | purple |
| `{yel}` | 158 | yellow |
| `{cyn}` | 159 | cyan |
| `{$xx}` or `{NN spaces}` | (literal) | raw byte / repeat counts |

(Exact token spellings vary slightly by VICE version; the numeric CHR$ values are authoritative.)

---

## Sources

- https://www.c64-wiki.com/wiki/PETSCII
- https://www.c64-wiki.com/wiki/Screen_code
- https://www.c64-wiki.com/wiki/Control_character
- https://www.c64-wiki.com/wiki/Color
- https://sta.c64.org/cbm64pet.html
- https://sta.c64.org/cbm64scr.html
