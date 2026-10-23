import fs from "fs";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Node 24 的 fs.rmSync(recursive) 在含中文的路徑（D:\專題）會原生崩潰（0xC0000409），
// Vite 內建的 emptyOutDir 用的就是它。改用 fs.promises.rm 自己清空輸出資料夾。
function emptyOutDirSafely() {
  let outDir;
  return {
    name: "empty-out-dir-safely",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async buildStart() {
      await fs.promises.rm(outDir, { recursive: true, force: true });
    }
  };
}

export default defineConfig({
  // 整個專案共用根目錄 .env，frontend 本身不再放第二份 env。
  envDir: path.resolve(__dirname, ".."),
  plugins: [react(), emptyOutDirSafely()],
  build: { chunkSizeWarningLimit: 2000, emptyOutDir: false },
  resolve: {
    alias: { app: path.resolve(__dirname, "src/app") }
  }
});
