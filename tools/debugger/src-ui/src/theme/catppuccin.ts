import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Catppuccin Mocha for CodeMirror 6.
 *
 * `theme` paints the editor chrome (background, gutter, selection, cursor,
 * active line); `highlight` colours the tokens our StreamLanguages emit. The
 * stream tokenizers return classic CM5 names which StreamLanguage maps onto the
 * lezer tags below — so styling the tags is enough to cover both languages.
 */

// Mocha palette (https://catppuccin.com/palette).
const mocha = {
  base: "#1e1e2e",
  mantle: "#181825",
  surface0: "#313244",
  surface1: "#45475a",
  surface2: "#585b70",
  overlay0: "#6c7086",
  overlay1: "#7f849c",
  text: "#cdd6f4",
  blue: "#89b4fa",
  sapphire: "#74c7ec",
  sky: "#89dceb",
  teal: "#94e2d5",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  peach: "#fab387",
  red: "#f38ba8",
  mauve: "#cba6f7",
};

export const catppuccinTheme = EditorView.theme(
  {
    "&": {
      color: mocha.text,
      backgroundColor: mocha.base,
      height: "100%",
    },
    ".cm-scroller": { overflow: "auto" },
    ".cm-content": { caretColor: mocha.blue },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: mocha.blue },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: mocha.surface1 },
    ".cm-activeLine": { backgroundColor: "#ffffff0d" },
    ".cm-gutters": {
      backgroundColor: mocha.mantle,
      color: mocha.overlay0,
      border: "none",
      borderRight: `1px solid ${mocha.surface0}`,
    },
    ".cm-activeLineGutter": { backgroundColor: mocha.surface0, color: mocha.text },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: mocha.surface2,
      color: mocha.text,
    },
  },
  { dark: true },
);

export const catppuccinHighlight = HighlightStyle.define([
  { tag: t.comment, color: mocha.overlay1, fontStyle: "italic" },
  { tag: t.keyword, color: mocha.mauve },
  { tag: t.string, color: mocha.green },
  { tag: [t.number, t.bool], color: mocha.peach },
  { tag: t.atom, color: mocha.peach },
  { tag: t.meta, color: mocha.yellow },
  { tag: t.operator, color: mocha.sky },
  { tag: t.variableName, color: mocha.text },
  { tag: t.definition(t.variableName), color: mocha.blue },
  { tag: t.special(t.variableName), color: mocha.teal },
  { tag: t.labelName, color: mocha.blue },
]);
