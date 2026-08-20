import * as React from "react";
import { Switch as Base } from "@base-ui/react/switch";

/**
 * Công tắc. Thiết kế dùng 11 lần.
 *
 * Khác ô tích ở NGỮ NGHĨA, không chỉ ở hình: công tắc có hiệu lực NGAY khi gạt,
 * ô tích thì chờ nút xác nhận. Dùng nhầm là hứa sai với người dùng — nên hai
 * component tách riêng, không phải một component với prop `variant`.
 */
export interface SwitchProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Base.Root>, "className"> {
  className?: string;
}

export function Switch({ className, ...rest }: SwitchProps) {
  return (
    <Base.Root {...rest} className={["dw-switch", className].filter(Boolean).join(" ")}>
      <Base.Thumb className="dw-switch__thumb" />
    </Base.Root>
  );
}
