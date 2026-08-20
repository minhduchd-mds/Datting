import * as React from "react";
import { Checkbox as Base } from "@base-ui/react/checkbox";

/**
 * Ô tích. Thiết kế VTF-6 dùng 13 lần nên nó xứng đáng là primitive.
 *
 * Ô vẽ ra là một `<span>`; ô nhận sự kiện vẫn là `<input type="checkbox">` ẩn do
 * Base UI dựng. Nhờ vậy nó vào được form thật, đọc được bằng trình đọc màn hình,
 * và trạng thái nửa-tích (`indeterminate`) hoạt động — ba thứ mà một
 * `<div onClick>` tô cho giống ô tích không bao giờ có.
 */
export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Base.Root>, "className"> {
  className?: string;
  /** Nhãn đi kèm. Bỏ trống thì nơi dùng PHẢI tự gắn `aria-label`. */
  label?: React.ReactNode;
}

export function Checkbox({ className, label, ...rest }: CheckboxProps) {
  const box = (
    <Base.Root {...rest} className={["dw-check", className].filter(Boolean).join(" ")}>
      <Base.Indicator className="dw-check__mark">
        {/* Dấu tích vẽ bằng SVG chứ không phải ký tự: ký tự tick đổi hình theo
            font hệ thống, và stack font ở đây cố ý là font hệ thống. */}
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path
            d="M1.5 6.2 L4.4 9 L10.5 2.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Base.Indicator>
    </Base.Root>
  );

  if (label === undefined) return box;
  return (
    <label className="dw-check-row">
      {box}
      <span className="dw-check-row__label">{label}</span>
    </label>
  );
}
