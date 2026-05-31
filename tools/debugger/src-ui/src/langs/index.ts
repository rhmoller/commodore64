import type { Extension } from "@codemirror/state";
import { kickassLanguage } from "./kickass.ts";
import { c64basicLanguage } from "./c64basic.ts";

export type LangId = "kickass" | "c64basic" | null;

/** Pick a language id from a file path's extension. */
export function langFromPath(path: string): LangId {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (ext === "asm" || ext === "s" || ext === "a" || ext === "kick") return "kickass";
  if (ext === "bas" || ext === "prg.txt") return "c64basic";
  return null;
}

/** Resolve a language id to its CodeMirror extension (empty if none). */
export function langExtension(id: LangId): Extension {
  if (id === "kickass") return kickassLanguage;
  if (id === "c64basic") return c64basicLanguage;
  return [];
}
