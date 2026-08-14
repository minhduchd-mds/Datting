/**
 * Thông báo trong app.
 *
 * "Đánh dấu đã đọc" cập nhật LẠC QUAN: đổi state ngay, gọi server sau. Đây là
 * thao tác không thể sai theo hướng nguy hiểm — cùng lắm là một chấm đỏ hiện
 * lại sau lần fetch tới. Bắt người dùng ngồi chờ spinner cho một việc như vậy
 * là đổi sự khó chịu chắc chắn lấy một sự chính xác không ai cần.
 */
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";

import { api } from "../../src/api";
import { useRevision } from "../../src/live";
import {
  ErrorState,
  NotificationsScreen,
  type NotificationItem,
} from "../../src/screens/SocialScreens";

export default function Notifications() {
  const revision = useRevision("notifications");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.fetchNotifications());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  if (failed && items.length === 0) return <ErrorState onRetry={() => void load()} />;

  return (
    <NotificationsScreen
      items={items}
      onOpen={(n) => {
        setItems((cur) => cur.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
        // Thông báo match/tin nhắn dẫn về hội thoại; loại còn lại chưa có đích
        // đến nên chỉ đánh dấu đã đọc. Điều hướng tới một màn chưa tồn tại còn
        // tệ hơn là không điều hướng.
        if (n.kind === "match" || n.kind === "message") {
          router.push("/(tabs)/matches" as never);
        }
      }}
      onMarkAllRead={() => {
        setItems((cur) => cur.map((i) => ({ ...i, read: true })));
        void api.markNotificationsRead().catch(() => {});
      }}
    />
  );
}
