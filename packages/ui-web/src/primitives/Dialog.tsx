import * as React from "react";
import { Dialog as Base } from "@base-ui/react/dialog";

/**
 * Hộp thoại.
 *
 * Đây là primitive đáng giá nhất trong cả package. Phần khó không phải cái hộp
 * mà là quản lý tiêu điểm: bẫy tiêu điểm trong hộp, trả về đúng phần tử đã mở nó
 * khi đóng, `inert` phần nền, thoát bằng Esc, và khoá cuộn nền mà không làm
 * trang nhảy. Tự viết là nơi lỗi trợ năng ẩn lâu nhất — `PRODUCTION_AUDIT` xếp
 * hộp thoại xác nhận vào P0 cũng vì thế.
 */
export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Hàng nút ở đáy. */
  actions?: React.ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
}: DialogProps) {
  return (
    <Base.Root open={open} onOpenChange={onOpenChange}>
      <Base.Portal>
        <Base.Backdrop className="dw-dialog__backdrop" />
        <Base.Popup className="dw-dialog">
          <Base.Title className="dw-dialog__title">{title}</Base.Title>
          {description !== undefined && (
            <Base.Description className="dw-dialog__desc">{description}</Base.Description>
          )}
          {children}
          {actions !== undefined && <div className="dw-dialog__actions">{actions}</div>}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}

export const DialogTrigger = Base.Trigger;
export const DialogClose = Base.Close;
