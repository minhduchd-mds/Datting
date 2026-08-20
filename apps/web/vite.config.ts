import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/*
 * Chặn một bản deploy production âm thầm chạy dữ liệu giả.
 *
 * `apps/web/src/api.ts` đặt `IS_DEMO = API_BASE === ""`, mà `API_BASE` đọc từ
 * `VITE_API_BASE`. Quên khai biến đó trên Vercel thì bản build vẫn XANH, trang
 * vẫn lên, thẻ vẫn vuốt được — chỉ là toàn bộ dữ liệu do `DemoApi` bịa ra. Không
 * có gì trên màn hình cho biết, và đó chính là kiểu hỏng khó phát hiện nhất:
 * nó trông y như đang chạy.
 *
 * Vercel đặt sẵn `VERCEL_ENV` ("production" | "preview" | "development"). Chỉ
 * chặn ở nhánh production: preview và dev vẫn dùng bản demo được, và đó là công
 * dụng chính đáng của nó.
 */
function chanDemoOProduction(): void {
  const env = process.env["VERCEL_ENV"];
  const base = process.env["VITE_API_BASE"] ?? "";
  if (env === "production" && base.trim() === "") {
    throw new Error(
      "VITE_API_BASE trống ở bản production. Bản build này sẽ chạy DemoApi — " +
        "dữ liệu bịa, không chạm server. Khai biến môi trường đó trong Vercel " +
        "(Settings → Environment Variables) rồi build lại.",
    );
  }
}
chanDemoOProduction();

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
