import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  // allow the sandbox preview host (and any tunnel) to load the dev/preview server
  server: { host: "0.0.0.0", port: 5173, allowedHosts: [".e2b.app", ".localhost"] },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: [".e2b.app", ".localhost"] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
