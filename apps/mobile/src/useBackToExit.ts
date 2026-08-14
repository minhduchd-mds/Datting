/**
 * Chặn Back ở màn gốc: lần đầu cảnh báo, lần thứ hai mới cho thoát.
 *
 * ─── Vì sao trả `false` chứ không gọi `BackHandler.exitApp()` ─────────────
 * Tài liệu của chính `BackHandler` nói: Android chạy hành vi mặc định (thoát
 * app) khi KHÔNG listener nào trả `true`. Nên trả `false` nghĩa là "tôi không
 * xử lý", và hệ điều hành kết thúc activity theo đúng cách của nó — kể cả khi
 * người dùng đến đây bằng cử chỉ vuốt mép chứ không bằng nút. `exitApp()` là
 * lệnh giết tiến trình từ phía app; nó bỏ qua vòng đời và không phải thứ nên
 * dùng cho thao tác back bình thường.
 *
 * ─── Vì sao `useFocusEffect` chứ không `useEffect` ───────────────────────
 * `BackHandler` là một NGĂN XẾP toàn cục, gọi ngược thứ tự đăng ký. Handler trả
 * `true` sẽ nuốt back của MỌI màn đang mở, kể cả màn chat nằm trên nó. Đăng ký
 * theo focus thì handler chỉ sống đúng lúc màn này đang hiển thị.
 *
 * `useFocusEffect` do expo-router re-export (build/exports.d.ts). Nếu import gãy
 * sau khi nâng cấp, lấy từ `@react-navigation/native` (phụ thuộc bắc cầu của
 * expo-router) — KHÔNG hạ xuống `useEffect`, xem lý do ở trên.
 */
import { useCallback, useMemo } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";
import { createBackToExitGate } from "@datting/core";

export function useBackToExit(onWarn: () => void): void {
  const gate = useMemo(() => createBackToExitGate(), []);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (gate.press(Date.now()) === "exit") return false;
        onWarn();
        return true;
      });
      return () => {
        // Rời màn phải nạp lại cổng. Không nạp lại thì người dùng bấm back ở
        // deck (cảnh báo), sang tab khác, quay lại, bấm back — và thoát ngay.
        gate.reset();
        sub.remove();
      };
    }, [gate, onWarn]),
  );
}
