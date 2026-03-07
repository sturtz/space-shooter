import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// use a relative base so the site works when hosted under a repo path
export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
