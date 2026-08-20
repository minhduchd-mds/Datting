import * as React from "react";
import { Field as Base } from "@base-ui/react/field";

/**
 * Trường nhập liệu có nhãn, mô tả và lỗi.
 *
 * Base UI tự nối `id`/`aria-describedby`/`aria-invalid` giữa bốn phần. Đó chính
 * là phần hay sai khi tự viết: nhãn không nối với ô thì bấm nhãn không focus, và
 * lỗi không nối với ô thì trình đọc màn hình đọc ô mà không đọc lỗi — người dùng
 * nghe "bắt buộc" mà không biết bắt buộc cái gì.
 */
export interface FieldProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, description, error, children, className }: FieldProps) {
  return (
    <Base.Root className={["dw-field", className].filter(Boolean).join(" ")}>
      <Base.Label className="dw-field__label">{label}</Base.Label>
      {children}
      {description !== undefined && (
        <Base.Description className="dw-field__desc">{description}</Base.Description>
      )}
      {error !== undefined && <Base.Error className="dw-field__error">{error}</Base.Error>}
    </Base.Root>
  );
}

export const FieldControl = Base.Control;
