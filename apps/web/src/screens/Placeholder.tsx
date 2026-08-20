import type { RouteId } from "../routes.js";

/**
 * Màn chưa dựng.
 *
 * Nói THẲNG là chưa có, kèm thứ đang chặn nó. Một màn trống không giải thích gì
 * khiến người xem tưởng app hỏng; một màn giả bằng dữ liệu bịa còn tệ hơn, vì
 * nó khiến người ta tưởng tính năng đã xong.
 */
const BLOCKED_BY: Record<RouteId, string> = {
  "de-xuat": "",
  cho: "API đã có (/v1/me/likes-you) — chờ tới lượt ở GĐ 3",
  "gioi-thieu": "Bảng introductions đã có trong 0001_init.sql, nhưng CHƯA có endpoint nào",
  "ket-noi": "API đã có (/v1/matches) — chờ tới lượt ở GĐ 3",
  "ho-so": "Cần PUT /v1/profiles/me, hiện chưa tồn tại",
  "thong-bao": "API đã có (/v1/me/notifications) — chờ tới lượt ở GĐ 3",
};

export function Placeholder({ title, routeId }: { title: string; routeId: RouteId }) {
  return (
    <div className="empty">
      <h1 className="empty__title">{title}</h1>
      <p className="empty__body">Màn này chưa được dựng.</p>
      <p className="empty__why">{BLOCKED_BY[routeId]}</p>
    </div>
  );
}
