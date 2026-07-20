import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4317,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:2567",
    },
  },
  build: {
    target: "es2022",
  },
});
