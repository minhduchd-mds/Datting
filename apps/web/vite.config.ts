import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
  },
  optimizeDeps: {
    // Hai package workspace này có "exports" trỏ thẳng vào .ts nguồn. Loại khỏi
    // pre-bundle để Vite xử lý chúng qua pipeline TS bình thường — giống hệt
    // cấu hình của apps/admin.
    exclude: ["@datting/core", "@datting/ui-web"],
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
