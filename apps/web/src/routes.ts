/**
 * Sáu đích điều hướng, đúng như sidebar trong thiết kế VTF-6.
 *
 * KHÔNG dùng thư viện router. Ở GĐ 2 chỉ có một màn thật, và sáu đích phẳng
 * không có tham số thì `location.hash` là đủ — thêm router bây giờ là thêm một
 * phụ thuộc chưa biện minh được.
 *
 * ĐIỀU KIỆN THAY: khi GĐ 3 thêm route có tham số (`/ho-so/:userId`,
 * `/tro-chuyen/:matchId`), hash thủ công bắt đầu phải tự phân tích tham số và
 * lúc đó thư viện rẻ hơn tự viết. Đừng đợi tới lúc có mười màn.
 */
export const ROUTES = [
  { id: "de-xuat", label: "Đề xuất", glyph: "◆" },
  { id: "cho", label: "Chờ", glyph: "♡" },
  { id: "gioi-thieu", label: "Giới thiệu", glyph: "◎" },
  { id: "ket-noi", label: "Kết nối", glyph: "◇" },
  { id: "ho-so", label: "Hồ sơ", glyph: "○" },
  { id: "thong-bao", label: "Thông báo", glyph: "△" },
] as const;

export type RouteId = (typeof ROUTES)[number]["id"];

export const DEFAULT_ROUTE: RouteId = "de-xuat";

/** Đọc hash hiện tại, trả về đích hợp lệ hoặc mặc định. */
export function routeFromHash(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, "");
  return ROUTES.some((r) => r.id === id) ? (id as RouteId) : DEFAULT_ROUTE;
}
