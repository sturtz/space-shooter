import { defineConfig } from "vite";
import { resolve } from "path";

// use a relative base so the site works when hosted under a repo path
export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
