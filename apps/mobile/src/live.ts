/**
 * Cầu nối giữa nudge (WebSocket) và các màn hình.
 *
 * Nudge KHÔNG chở nội dung — chỉ nói "chủ đề X có cái mới". Vậy nên chỗ này
 * không lưu dữ liệu, chỉ đếm số lần một chủ đề thay đổi. Màn hình lấy con số đó
 * làm dependency của effect tải dữ liệu: số tăng ⇒ effect chạy lại ⇒ màn hình
 * tự fetch qua HTTP. Đúng mô hình ở CLAUDE.md, và cũng là lý do mất một nudge
 * không sao: nudge kế tiếp kéo lại toàn bộ trạng thái đúng.
 *
 * getSnapshot trả về SỐ NGUYÊN chứ không phải object. Đây không phải chi tiết
 * vặt: `useSyncExternalStore` so sánh bằng `Object.is`, nên trả object mới mỗi
 * lần gọi sẽ render vô hạn. Số nguyên thì không bao giờ dính lỗi đó.
 */
import { useSyncExternalStore } from "react";

export type Topic = "matches" | "messages" | "notifications";

const revisions: Record<Topic, number> = { matches: 0, messages: 0, notifications: 0 };
const listeners = new Set<() => void>();

export function bump(topic: Topic): void {
  revisions[topic] += 1;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRevision(topic: Topic): number {
  const get = () => revisions[topic];
  return useSyncExternalStore(subscribe, get, get);
}
