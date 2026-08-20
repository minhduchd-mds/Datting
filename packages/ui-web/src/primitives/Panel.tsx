import * as React from "react";
import { Dialog as Base } from "@base-ui/react/dialog";

/**
 * Tấm nổi ở GIỮA màn, cỡ lớn.
 *
 * ─── Vì sao không dùng `Sheet` cho hồ sơ ────────────────────────────────
 * `Sheet` neo vào mép phải và rộng tối đa 620px. Với hội thoại thì đúng: nó là
 * một luồng phụ chạy song song với danh sách phía sau, và giữ được ngữ cảnh
 * nền là có ích.
 *
 * Hồ sơ thì ngược lại. Nó KHÔNG phải luồng phụ — nó là toàn bộ việc người dùng
 * đang làm ở màn Đề xuất, và quyết định kết nối hay bỏ qua nằm trong đó. Nhét
 * vào một dải dọc 620px ở mép phải sinh ra ba vấn đề đo được:
 *
 *   1. Ảnh — thứ người ta thực sự nhìn khi xem một hồ sơ hẹn hò — bị ép xuống
 *      còn một avatar 96px, trong khi chữ chiếm hết bề ngang.
 *   2. Mọi thứ xếp thành MỘT cột dài, nên hai nút quyết định trôi xuống dưới
 *      đáy trang: phải cuộn hết hồ sơ mới bấm được. Ở màn Đề xuất, nơi người
 *      dùng ra quyết định liên tục, đó là chi phí thật cho mỗi hồ sơ.
 *   3. Ở màn 1440–2560, một dải 620px dán mép phải trông như một cái điện thoại
 *      dán vào cạnh màn hình, còn 800–1900px bên trái thì bỏ trống.
 *
 * Tấm ở giữa chữa cả ba: ảnh được một cột riêng, chữ được cột kia, và hàng nút
 * ghim ở đáy TẤM chứ không ở đáy nội dung.
 *
 * ─── Vẫn là Base UI, vì cùng một lý do như `Sheet` ─────────────────────────
 * Bẫy tiêu điểm, trả tiêu điểm về đúng phần tử đã mở, `inert` phần nền, thoát
 * bằng Esc, khoá cuộn nền — năm việc này đến từ Base UI. Tự viết
 * `<div role="dialog" aria-modal="true">` là khai một lời hứa rồi không giữ.
 */
export interface PanelProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Tên khả truy cập — tấm không có tiêu đề cố định nên phải truyền vào. */
  label: string;
  className?: string;
  children?: React.ReactNode;
}

export function Panel({ open, onOpenChange, label, className, children }: PanelProps) {
  return (
    <Base.Root open={open} onOpenChange={onOpenChange}>
      <Base.Portal>
        <Base.Backdrop className="dw-panel__backdrop" />
        <Base.Popup
          className={className ? `dw-panel ${className}` : "dw-panel"}
          aria-label={label}
        >
          {children}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
