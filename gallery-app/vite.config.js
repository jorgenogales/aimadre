import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/gallery/",
  build: {
    outDir: "../public/gallery",
    emptyOutDir: true
  }
});
