import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";

/**
 * Nút.
 *
 * Dùng `Button` của Base UI thay vì `<button>` trần vì nó xử lý đúng trường hợp
 * `render` sang thẻ khác (ví dụ `<a>`): khi đó phải thêm `role="button"` và bắt
 * phím Space, thứ mà `<a>` không tự làm. Tự viết là đúng chỗ dễ quên nhất.
 *
 * KHÔNG có prop `size`. Thang chữ đã cố định ở `TYPE`, và mỗi biến thể kích cỡ
 * thêm vào là một chỗ nữa để hai app web lệch nhau. Cần nút to hơn thì đặt
 * padding ở nơi dùng.
 */
export type ButtonTone = "neutral" | "accent" | "danger";

export interface ButtonProps
  extends Omit<React.ComponentPropsWithoutRef<typeof BaseButton>, "className"> {
  tone?: ButtonTone;
  className?: string;
}

export function Button({ tone = "neutral", className, ...rest }: ButtonProps) {
  return (
    <BaseButton
      {...rest}
      className={["dw-btn", "dw-btn--" + tone, className].filter(Boolean).join(" ")}
    />
  );
}
