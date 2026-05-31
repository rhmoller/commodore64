import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));

// Source lives in src-ui/; the production build is emitted to ../web, which
// server.ts serves at "/". In dev, Vite serves with HMR and proxies the API
// and the binary-monitor WebSocket to the Node server on :8080.
export default defineConfig({
  root,
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
});
