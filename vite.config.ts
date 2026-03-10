import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import pkg from "./package.json" with { type: "json" };

// use a relative base so the site works when hosted under a repo path
export default defineConfig({
  base: "./",
  define: {
    /** Injected at compile-time from package.json — use `npm version patch` to bump */
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
