import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project sites are served from https://<user>.github.io/<repo>/,
// so assets need that subpath baked in at build time. Set VITE_BASE_PATH to
// "/<repo>/" when building for Pages; it defaults to "/" for local dev/preview
// and for a custom-domain or user/org Pages site.
const basePath = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
