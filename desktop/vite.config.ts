import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the renderer talks same-origin (/api, /assets) and Vite
// forwards to the Python backend (run `python -m backend.server` first).
const backend = process.env.NOVA_API_URL || "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/assets": { target: backend, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
  },
});
