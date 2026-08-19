/**
 * Điều kiện hoàn tác một lượt vuốt.
 *
 * ─── Vì sao logic này KHÔNG nằm trong component ───────────────────────────
 * Nó có ba trục cùng lúc — thời gian, đã-gửi-hay-chưa, đã-tạo-match-hay-chưa —
 * nên đúng tám tổ hợp. Loại quyết định này viết trong JSX thì ba tháng sau
 * không ai dám sửa. Ở đây nó chạy được với `node --test`, và nếu sau này server
 * cần chặn hoàn tác thì server dùng lại đúng hàm này chứ không viết bản thứ hai
 * — hai bản là hai bản sẽ lệch nhau.
 *
 * ─── Ba sự thật ràng buộc thiết kế ────────────────────────────────────────
 * 1. `pass` KHÔNG ghi gì lên server. `recordSwipe` (services/match-service/
 *    src/mutualLike.ts) trả về ngay với `matched: false` mà không chạm Redis.
 *    Nên hoãn gửi một `pass` vài giây không mất gì cả.
 * 2. `like`/`superlike` phải gửi NGAY, vì màn ăn mừng phụ thuộc câu trả lời.
 *    Hoãn chúng là hoãn khoảnh khắc quan trọng nhất của sản phẩm.
 * 3. Match đã tạo ra thì KHÔNG rút lại bằng hoàn tác. Phía bên kia đã nhận
 *    nudge và đã thấy match. Muốn gỡ thì đó là "huỷ kết nối" — một thao tác
 *    khác, hậu quả khác, và người dùng phải biết mình đang làm gì.
 */

/**
 * 5 giây. Đủ để nhận ra "ơ, vuốt nhầm rồi" và đưa tay tới nút; chưa đủ để
 * người dùng đã vuốt tiếp ba thẻ nữa rồi mới đòi quay lại.
 */
export const UNDO_WINDOW_MS = 5_000;

export interface UndoCandidate {
  action: "like" | "pass" | "superlike";
  /** Thời điểm người dùng vuốt. */
  atMs: number;
  /** Đã đẩy lên server hay còn nằm trong cửa sổ hoãn. */
  sent: boolean;
  /** Lượt vuốt này đã tạo ra một match. */
  createdMatch: boolean;
}

export type UndoVerdict =
  | { ok: true }
  | { ok: false; reason: "expired" | "matched" | "nothing-to-undo" };

/**
 * Lượt vuốt gần nhất còn hoàn tác được không?
 *
 * ─── Thứ tự các nhánh CHÍNH LÀ quyết định ────────────────────────────────
 * `matched` được kiểm TRƯỚC `expired`. Một lượt vừa quá hạn *vừa* đã tạo match
 * thì hai câu trả lời đều đúng về mặt logic, nhưng chỉ một câu hữu ích:
 *
 *   "hết hạn"     → gợi ý "lần sau bấm nhanh hơn". Người dùng sẽ thử lại và
 *                   lại thất bại, vì cái chặn họ không phải thời gian.
 *   "đã kết đôi"  → họ biết phải đi tìm nút "huỷ kết nối".
 *
 * Nguyên tắc chung khi viết hàm trả lý do từ chối: sắp theo thứ tự "cái nào
 * giải thích được nhiều nhất", không theo thứ tự rẻ nhất để kiểm.
 */
export function canUndo(
  c: UndoCandidate | null,
  nowMs: number,
  windowMs: number = UNDO_WINDOW_MS,
): UndoVerdict {
  if (!c) return { ok: false, reason: "nothing-to-undo" };
  if (c.createdMatch) return { ok: false, reason: "matched" };
  if (nowMs - c.atMs > windowMs) return { ok: false, reason: "expired" };
  return { ok: true };
}
