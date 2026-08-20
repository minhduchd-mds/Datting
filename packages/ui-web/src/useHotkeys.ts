import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (() => void) | undefined>;

/**
 * Gắn phím tắt ở cấp document.
 *
 * Chuyển từ `apps/admin/src/useHotkeys.ts` sang đây vì bản web cũng điều khiển
 * bằng bàn phím — thiết kế VTF-6 ghi thẳng dưới thẻ hồ sơ:
 * `← Bỏ qua · → Kết nối · ↓ Xem chi tiết · Enter Mở hồ sơ`, và không có cử chỉ
 * vuốt nào thay thế. Hai app web dùng chung một bản là cách duy nhất để ba cạm
 * bẫy dưới đây không phải sửa hai lần.
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
 * 4. Bỏ qua sự kiện TỰ LẶP khi giữ phím (`e.repeat`). Xem ngay dưới — đây là
 *    cái đắt nhất trong bốn cái.
 * 5. Không nuốt Enter/Space khi tiêu điểm đang ở link hoặc nút. Xem dưới.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      // Giữ một phím thì hệ điều hành tự bắn lại `keydown` liên tục (~30/giây
      // sau độ trễ đầu). Không chặn thì giữ `→` ở màn Đề xuất là gửi hàng chục
      // lượt "thích" THẬT cho hàng chục người, trong khi `Z` chỉ lùi được ĐÚNG
      // MỘT lượt gần nhất. Đây là hành động không thể hoàn tác, nên nó phải
      // chết ngay ở dòng đầu tiên.
      if (e.repeat) return;
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

      const key = e.key.toLowerCase();

      // Link và nút TỰ có hành vi kích hoạt bằng Enter (nút thêm cả Space), và
      // hành vi đó chỉ chạy nếu `keydown` chưa bị `preventDefault()`. Nuốt hai
      // phím này ở cấp document là vô hiệu hoá chính chúng: Tab tới link
      // sidebar rồi Enter sẽ KHÔNG điều hướng — người dùng bàn phím mất hẳn
      // đường đi mà không có triệu chứng nào ngoài "bấm không ăn".
      //
      // Chỉ loại trừ đúng hai phím đó, không loại trừ cả phần tử: mũi tên
      // không phải phím kích hoạt của link/nút, nên vừa bấm nút trên thẻ xong
      // vẫn vuốt tiếp bằng mũi tên được.
      if (
        (key === "enter" || key === " ") &&
        el?.closest('a[href], button, [role="button"], [role="link"]')
      ) {
        return;
      }

      const handler = ref.current[key];
      if (!handler) return;

      e.preventDefault();
      handler();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
