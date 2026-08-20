import * as React from "react";
import { ScrollArea as Base } from "@base-ui/react/scroll-area";

/**
 * Vùng cuộn có thanh cuộn vẽ được.
 *
 * Lý do không dùng `overflow: auto` trần: thanh cuộn mặc định của trình duyệt
 * không nhận màu theo token, và trên giao diện tối nó là thứ trông sai nhất.
 * Base UI giữ nguyên cuộn NATIVE (bánh xe, chạm, phím) và chỉ vẽ đè thanh —
 * khác hẳn thư viện cuộn giả lập, vốn hay làm hỏng cuộn bằng bàn phím.
 */
export interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ScrollArea({ children, className, style }: ScrollAreaProps) {
  return (
    <Base.Root className={["dw-scroll", className].filter(Boolean).join(" ")} style={style}>
      <Base.Viewport className="dw-scroll__viewport">{children}</Base.Viewport>
      <Base.Scrollbar className="dw-scroll__bar" orientation="vertical">
        <Base.Thumb className="dw-scroll__thumb" />
      </Base.Scrollbar>
    </Base.Root>
  );
}
