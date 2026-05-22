import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/pb/",
  build: {
    outDir: "../public/pb",
    emptyOutDir: true
  }
});
