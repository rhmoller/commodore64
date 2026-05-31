// Thin HTTP client for the debugger server's file + build endpoints.
// In dev these are proxied by Vite to the Node server on :8080; in the built
// app they are same-origin.

export interface FileResponse {
  path: string;
  content: string;
}

export interface RunResult {
  ok: boolean;
  /** Combined assembler/tokenizer stdout+stderr. */
  output: string;
  /** Path of the produced .prg, when the build succeeded. */
  prg?: string;
  /** Present when the build or inject step failed. */
  error?: string;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function readFile(path: string): Promise<FileResponse> {
  return asJson(await fetch(`/api/file?path=${encodeURIComponent(path)}`));
}

export async function writeFile(path: string, content: string): Promise<void> {
  await asJson(
    await fetch("/api/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    }),
  );
}

/** Save (if content given), build, and autostart the file into running VICE. */
export async function run(path: string): Promise<RunResult> {
  return asJson(
    await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }),
  );
}
