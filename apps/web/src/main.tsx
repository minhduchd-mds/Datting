import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Thứ tự import CÓ Ý NGHĨA: theme đặt biến, primitives dùng biến, styles của
// app này ghi đè sau cùng. Đảo thứ tự thì primitives đọc biến chưa tồn tại.
import "@datting/ui-web/theme.css";
import "@datting/ui-web/primitives.css";
import "./styles.css";

import { App } from "./App.js";

const el = document.getElementById("root");
if (!el) throw new Error("không tìm thấy #root");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
