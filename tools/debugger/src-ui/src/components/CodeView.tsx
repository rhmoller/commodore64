import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  bracketMatching,
  indentOnInput,
} from "@codemirror/language";
import { langExtension, type LangId } from "../langs/index.ts";
import { catppuccinTheme, catppuccinHighlight } from "../theme/catppuccin.ts";

interface CodeViewProps {
  /** The file contents to display. Changing this reloads the document. */
  content: string;
  language: LangId;
  /** Fired (with the live document text) on Ctrl/Cmd-S. */
  onSave?: (content: string) => void;
  /** Fired on the false→true / true→false transitions of the dirty flag. */
  onDirtyChange?: (dirty: boolean) => void;
}

// Recreating the editor on every keystroke would be wasteful; the document and
// language are swapped via reconfiguration/transactions instead. Patterns here
// (dirty tracking against a baseline, language compartment, Ctrl-S keymap)
// mirror BotFace's CodeView, with the LSP machinery stripped out for v1.
export function CodeView({ content, language, onSave, onDirtyChange }: CodeViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langComp = useRef(new Compartment());
  const baseline = useRef(content);
  const dirty = useRef(false);

  // Keep callbacks current without rebuilding the editor.
  const onSaveRef = useRef(onSave);
  const onDirtyRef = useRef(onDirtyChange);
  onSaveRef.current = onSave;
  onDirtyRef.current = onDirtyChange;

  function setDirty(next: boolean) {
    if (next !== dirty.current) {
      dirty.current = next;
      onDirtyRef.current?.(next);
    }
  }

  // Mount once.
  useEffect(() => {
    const saveKey = keymap.of([
      {
        key: "Mod-s",
        preventDefault: true,
        run: (v) => {
          onSaveRef.current?.(v.state.doc.toString());
          return true;
        },
      },
    ]);
    const watch = EditorView.updateListener.of((u) => {
      if (u.docChanged) setDirty(u.state.doc.toString() !== baseline.current);
    });
    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(catppuccinHighlight, { fallback: true }),
        langComp.current.of(langExtension(language)),
        saveKey,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        watch,
        catppuccinTheme,
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload document when the file (content identity) changes.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (content === v.state.doc.toString()) return;
    baseline.current = content;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: content } });
    setDirty(false);
  }, [content]);

  // Swap language without touching the document.
  useEffect(() => {
    view.current?.dispatch({ effects: langComp.current.reconfigure(langExtension(language)) });
  }, [language]);

  return <div className="cm-host" ref={host} />;
}
