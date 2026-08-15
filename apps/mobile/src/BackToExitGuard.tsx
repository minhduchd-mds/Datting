/**
 * Chặn Back làm thoát app — cho MỌI màn, không riêng màn deck.
 *
 * ─── Vì sao bản trước sai ─────────────────────────────────────────────────
 * Bản đầu gắn cổng vào đúng `(tabs)/discover` vì đó là chỗ quan sát thấy lỗi.
 * Nhưng nguyên nhân không nằm ở màn deck: nó nằm ở chỗ CÂY ĐIỀU HƯỚNG SÂU ĐÚNG
 * MỘT TẦNG. `app/index.tsx` dùng `<Redirect>` (tức `replace`), nên bất kỳ màn
 * nào là màn đầu tiên — cổng tuổi, đăng nhập, và cả 4 bước onboarding — đều
 * không có gì để lùi về, và Back ở đó rơi thẳng xuống Android.
 *
 * Sửa ở một màn lá là vá đúng chỗ mình NHÌN THẤY, không phải chỗ lỗi ở.
 *
 * ─── Luật ở đây thay cho luật "màn nào" ───────────────────────────────────
 * Không hỏi "đang ở màn nào" mà hỏi "còn chỗ nào để lùi không":
 *
 *   canGoBack() = true   → trả `false`, để navigation lùi như bình thường.
 *                          Màn chat và màn hồ sơ vẫn quay lại được bằng Back.
 *   canGoBack() = false  → lần Back kế tiếp sẽ ĐÓNG APP. Cảnh báo trước.
 *
 * Nhờ vậy nó tự đúng với mọi màn hiện có và mọi màn thêm sau, không cần ai nhớ
 * đi gắn thêm hook.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler } from "react-native";
import { router } from "expo-router";
import { createBackToExitGate } from "@datting/core";

import { Toast } from "./components/Feedback";

export function BackToExitGuard() {
  const gate = useMemo(() => createBackToExitGate(), []);
  const [hint, setHint] = useState(false);
  const warn = useCallback(() => setHint(true), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      // Còn chỗ lùi ⇒ không phải việc của cổng này.
      if (router.canGoBack()) {
        gate.reset();
        return false;
      }
      // Trả `false` ở lần thứ hai thay vì gọi `exitApp()`: tài liệu BackHandler
      // nói Android chạy hành vi mặc định khi KHÔNG listener nào trả `true`,
      // nên hệ điều hành tự kết thúc activity đúng cách — kể cả khi người dùng
      // vào bằng cử chỉ vuốt mép chứ không bằng nút.
      if (gate.press(Date.now()) === "exit") return false;
      warn();
      return true;
    });
    return () => sub.remove();
  }, [gate, warn]);

  return (
    <Toast
      kind="info"
      message="Nhấn lần nữa để thoát"
      visible={hint}
      onDismiss={() => setHint(false)}
    />
  );
}
