import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 整個專案共用根目錄 .env，frontend 本身不再放第二份 env。
  envDir: path.resolve(__dirname, ".."),
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
  resolve: {
    alias: { app: path.resolve(__dirname, "src/app") }
  }
});
