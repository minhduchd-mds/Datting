import * as React from "react";
import { Menu as Base } from "@base-ui/react/menu";

/**
 * Menu hành động.
 *
 * Phần Base UI lo mà tự viết hay sót: điều hướng bằng phím mũi tên theo kiểu
 * roving tabindex, gõ-để-nhảy, định vị popup không tràn khỏi màn hình, và đóng
 * đúng lúc khi tiêu điểm rời ra. Nút "..." trên hồ sơ ứng viên là chỗ dùng đầu
 * tiên ở bản web.
 */
export interface MenuItemSpec {
  id: string;
  label: React.ReactNode;
  onSelect: () => void;
  /** Hành động phá huỷ — tô theo `--bad`, không phải `--accent`. */
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  trigger: React.ReactElement;
  items: MenuItemSpec[];
}

export function Menu({ trigger, items }: MenuProps) {
  return (
    <Base.Root>
      <Base.Trigger render={trigger} />
      <Base.Portal>
        <Base.Positioner className="dw-menu__positioner" sideOffset={6}>
          <Base.Popup className="dw-menu">
            {items.map((it) => (
              <Base.Item
                key={it.id}
                className={["dw-menu__item", it.danger ? "dw-menu__item--danger" : ""]
                  .filter(Boolean)
                  .join(" ")}
                disabled={it.disabled}
                onClick={it.onSelect}
              >
                {it.label}
              </Base.Item>
            ))}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
