import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Console kiểm duyệt KHÔNG được phơi ra mạng LAN khi chạy dev: màn hình này
    // hiển thị ảnh và báo cáo của người dùng thật.
    host: "127.0.0.1",
  },
  optimizeDeps: {
    // @datting/core là workspace link và "exports" trỏ thẳng vào .ts nguồn.
    // Loại khỏi pre-bundle để Vite xử lý nó qua pipeline TS bình thường.
    exclude: ["@datting/core"],
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
