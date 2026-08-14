/**
 * Hàng đợi lượt vuốt chưa gửi được.
 *
 * ─── Vì sao cần ───────────────────────────────────────────────────────────
 * Màn OfflineState nói nguyên văn: "những lượt vuốt của bạn đã được lưu và sẽ
 * tự gửi khi có mạng trở lại". Một câu như thế trong UI là một HỢP ĐỒNG. File
 * này là bên thực hiện hợp đồng đó; nếu xoá nó thì phải xoá câu kia trước.
 *
 * ─── Vì sao ghi xuống MMKV chứ không giữ trong RAM ────────────────────────
 * Mất mạng thì người ta thoát app. Hàng đợi trong RAM chết theo tiến trình, và
 * lời hứa ở trên thành nói dối. MMKV ghi đồng bộ nên `queueSwipe` không cần
 * `await` một lần ghi đĩa trước khi trả về — nhịp vuốt không bị chạm vào.
 *
 * ─── Vì sao match phát hiện muộn KHÔNG bật màn ăn mừng ────────────────────
 * Khi hàng đợi được đẩy đi, người dùng đang ở đâu đó khác — có khi đang giữa
 * một cuộc trò chuyện. Ném màn ăn mừng toàn màn hình vào lúc đó là cướp ngữ
 * cảnh. Match muộn chỉ đánh dấu chủ đề "matches"/"notifications" là cũ; nó sẽ
 * xuất hiện ở tab Kết đôi như mọi match khác.
 *
 * ─── Chính sách khi hàng đợi đầy ──────────────────────────────────────────
 * Chặn trên là 500. Vượt thì BỎ CÁI CŨ NHẤT. Lý do: người vuốt 500 lượt khi mất
 * mạng gần như chắc chắn sẽ không bao giờ thấy lại 500 hồ sơ đó, và giữ phần
 * đầu thì phần đuôi — thứ họ vừa làm và còn nhớ — mới là phần bị mất. Đây là
 * lựa chọn có mất mát, chỉ là mất ít hơn.
 */
import { MMKV } from "react-native-mmkv";

import { api, type SwipeResult } from "./api";
import type { SwipeAction } from "./components/SwipeDeck";
import { bump } from "./live";

interface PendingSwipe {
  toUserId: string;
  action: SwipeAction;
  at: number;
}

const KEY = "swipes.pending.v1";
const MAX = 500;
const storage = new MMKV({ id: "datting-swipes" });

function read(): PendingSwipe[] {
  const raw = storage.getString(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingSwipe[];
  } catch {
    storage.delete(KEY);
    return [];
  }
}

function write(q: PendingSwipe[]): void {
  storage.set(KEY, JSON.stringify(q.slice(-MAX)));
}

export function pendingCount(): number {
  return read().length;
}

/**
 * Gửi ngay; hỏng thì xếp hàng.
 *
 * Trả `SwipeResult` khi gửi được, `null` khi đã vào hàng đợi. `null` KHÔNG phải
 * lỗi — nó có nghĩa là "chưa biết có match hay không", và người gọi phải xử lý
 * đúng như vậy chứ không được coi là "không match".
 */
export async function queueSwipe(
  toUserId: string,
  action: SwipeAction,
): Promise<SwipeResult | null> {
  try {
    return await api.swipe(toUserId, action);
  } catch {
    write([...read(), { toUserId, action, at: Date.now() }]);
    return null;
  }
}

let flushing = false;

/**
 * Đẩy hàng đợi theo ĐÚNG THỨ TỰ, dừng ngay ở lỗi đầu tiên.
 *
 * Dừng chứ không bỏ qua: lỗi đầu tiên gần như luôn là "vẫn chưa có mạng", và
 * cố gửi 499 cái còn lại chỉ đốt pin. Giữ nguyên thứ tự cũng quan trọng — một
 * người có thể bị vuốt "pass" rồi "like" ở hai lần khác nhau, đảo thứ tự là
 * ghi ngược ý định của người dùng.
 */
export async function flushSwipes(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let q = read();
    let matched = false;
    while (q.length > 0) {
      const head = q[0] as PendingSwipe;
      let r: SwipeResult;
      try {
        r = await api.swipe(head.toUserId, head.action);
      } catch {
        return; // vẫn chưa gửi được — giữ nguyên hàng đợi, thử lại lần sau
      }
      if (r.matched) matched = true;
      q = q.slice(1);
      write(q);
    }
    if (matched) {
      bump("matches");
      bump("notifications");
    }
  } finally {
    flushing = false;
  }
}
