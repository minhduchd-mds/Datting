import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Thứ tự import CÓ Ý NGHĨA: theme đặt biến, primitives dùng biến, styles của
// app này ghi đè sau cùng. Đảo thứ tự thì primitives đọc biến chưa tồn tại.
import "@datting/ui-web/theme.css";
import "@datting/ui-web/primitives.css";
import "./styles.css";

import { App } from "./App.js";
import { Gate } from "./screens/Auth.js";

const el = document.getElementById("root");
if (!el) throw new Error("không tìm thấy #root");

createRoot(el).render(
  <StrictMode>
    {/*
      `Gate` bọc NGOÀI `App`, không phải là một route bên trong nó.
      Là route thì gõ thẳng `#/de-xuat` là vào được deck khi chưa qua cổng tuổi
      và chưa có đồng ý xu hướng tính dục — tức là xử lý dữ liệu nhạy cảm không
      có cơ sở pháp lý. Bọc ngoài thì không URL nào đi vòng qua được.
    */}
    <Gate>
      <App />
    </Gate>
  </StrictMode>,
);
