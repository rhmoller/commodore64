import { useCallback, useEffect, useState } from "react";
import { CodeView } from "./components/CodeView.tsx";
import { langFromPath, type LangId } from "./langs/index.ts";
import { readFile, writeFile, run, type RunResult } from "./api.ts";

export default function App() {
  const [path, setPath] = useState("");
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState<LangId>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ kind: "info" | "err"; text: string }[]>([]);

  const note = useCallback((kind: "info" | "err", text: string) => {
    setLog((l) => [...l, { kind, text }]);
  }, []);

  const open = useCallback(
    async (p: string) => {
      const target = p.trim();
      if (!target) return;
      try {
        const r = await readFile(target);
        setContent(r.content);
        setOpenPath(r.path);
        setLanguage(langFromPath(r.path));
        setDirty(false);
        note("info", `opened ${r.path}`);
      } catch (e) {
        note("err", `open failed: ${(e as Error).message}`);
      }
    },
    [note],
  );

  const save = useCallback(
    async (text: string) => {
      if (!openPath) return;
      try {
        await writeFile(openPath, text);
        setContent(text);
        setDirty(false);
        note("info", `saved ${openPath}`);
      } catch (e) {
        note("err", `save failed: ${(e as Error).message}`);
      }
    },
    [openPath, note],
  );

  const buildAndRun = useCallback(async () => {
    if (!openPath) return;
    setBusy(true);
    note("info", `build & inject ${openPath} …`);
    try {
      const r: RunResult = await run(openPath);
      if (r.output.trim()) note(r.ok ? "info" : "err", r.output.trimEnd());
      if (r.ok) note("info", `↻ injected ${r.prg ?? ""}`);
      else note("err", `failed: ${r.error ?? "build error"}`);
    } catch (e) {
      note("err", `run failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [openPath, note]);

  // Ctrl/Cmd-S saves even when focus is outside the editor; Ctrl/Cmd-Enter runs.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void buildAndRun();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [buildAndRun]);

  return (
    <div className="ide">
      <header className="bar">
        <span className="brand">C64&nbsp;IDE</span>
        <input
          className="pathinput"
          placeholder="path to .asm / .bas …"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && open(path)}
        />
        <button onClick={() => open(path)}>open</button>
        <span className="sep" />
        <span className="curfile">
          {openPath ?? "no file"}
          {dirty ? " ●" : ""}
        </span>
        <span className="grow" />
        <button disabled={!openPath || !dirty} onClick={() => save(content)}>
          save
        </button>
        <button className="primary" disabled={!openPath || busy} onClick={buildAndRun}>
          {busy ? "building…" : "▶ build & run"}
        </button>
        <a className="legacy" href="/legacy/" title="open the live debugger panels">
          debugger ↗
        </a>
      </header>

      <main className="editorwrap">
        {openPath ? (
          <CodeView
            content={content}
            language={language}
            onSave={save}
            onDirtyChange={setDirty}
          />
        ) : (
          <div className="empty">Open a file to start editing.</div>
        )}
      </main>

      <section className="console">
        <div className="chead">
          build console
          <button className="mini" onClick={() => setLog([])}>
            clear
          </button>
        </div>
        <div className="cbody">
          {log.map((l, i) => (
            <pre key={i} className={l.kind === "err" ? "err" : ""}>
              {l.text}
            </pre>
          ))}
        </div>
      </section>
    </div>
  );
}
