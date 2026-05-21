import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/prompter/",
  build: {
    outDir: "../public/prompter",
    emptyOutDir: true
  }
});
