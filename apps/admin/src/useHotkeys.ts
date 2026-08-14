import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (() => void) | undefined>;

/**
 * Gắn phím tắt ở cấp document.
 *
 * Ba chi tiết dễ bỏ sót, và cả ba đều từng làm hỏng công cụ kiểu này:
 *
 * 1. Đọc handler qua ref chứ không đưa vào mảng phụ thuộc. Nếu không, mỗi lần
 *    render lại là một lần gỡ và gắn lại listener; phím bấm đúng lúc giao tranh
 *    đó sẽ rơi mất. Với hàng đợi bấm liên tục thì đó là mất quyết định.
 * 2. Bỏ qua khi con trỏ đang ở ô nhập liệu. Không có nó, gõ chữ "d" vào ô ghi
 *    chú sẽ CHẶN một tài khoản.
 * 3. Bỏ qua khi đang giữ Cmd/Ctrl/Alt. Cmd+A là "chọn tất cả" của hệ điều hành,
 *    không phải "duyệt".
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      ) {
        return;
      }

      const handler = ref.current[e.key.toLowerCase()];
      if (!handler) return;

      e.preventDefault();
      handler();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
