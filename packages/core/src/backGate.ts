/**
 * Cổng "bấm back lần nữa để thoát".
 *
 * Vì sao cần: màn deck là gốc của cây điều hướng (app/index.tsx dùng
 * `<Redirect>`, tức là `replace`, nên không có gì để quay lại). Back ở đó rơi
 * thẳng xuống Android và app đóng. Người dùng vuốt thẻ ở sát mép màn hình rất
 * dễ chạm nhầm cử chỉ back của hệ thống — và mất luôn cả phiên.
 *
 * Vì sao logic nằm ở đây chứ không nằm trong component: nó là một máy trạng
 * thái nhỏ có biên thời gian, tức là đúng loại thứ mà test bắt được lỗi còn mắt
 * người thì không. Component chỉ còn việc nối nó vào `BackHandler`.
 *
 * Trả "warn" hay "exit" chứ KHÔNG tự gọi hàm thoát: package này thuần tuý,
 * không biết `BackHandler` là gì, và người gọi mới là người quyết định "thoát"
 * nghĩa là gì trên nền tảng của họ.
 */
export interface BackToExitGate {
  /** Ghi nhận một lần bấm back. `nowMs` do người gọi truyền vào để test được. */
  press(nowMs: number): "warn" | "exit";
  /** Huỷ cảnh báo đang treo — gọi khi màn hình mất focus. */
  reset(): void;
}

/** 2 giây: đủ đọc xong toast, chưa đủ để quên là mình vừa bấm gì. */
export const BACK_TO_EXIT_WINDOW_MS = 2000;

export function createBackToExitGate(
  windowMs: number = BACK_TO_EXIT_WINDOW_MS,
): BackToExitGate {
  let warnedAt = -Infinity;
  return {
    press(nowMs: number): "warn" | "exit" {
      if (nowMs - warnedAt <= windowMs) {
        // Nạp lại NGAY: nếu không, lần bấm thứ ba cũng ra "exit" và người dùng
        // quay lại app rồi bấm back một cái là bay ra lần nữa.
        warnedAt = -Infinity;
        return "exit";
      }
      warnedAt = nowMs;
      return "warn";
    },
    reset(): void {
      warnedAt = -Infinity;
    },
  };
}
