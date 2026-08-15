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

import { canUndo, UNDO_WINDOW_MS, type UndoCandidate, type UndoVerdict } from "@datting/core";

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
/* ---------------------------------------------------------------- Hoàn tác
 * `pass` được HOÃN, `like`/`superlike` gửi NGAY.
 *
 * Lý do bất đối xứng: `recordSwipe` phía server trả về ngay cho `pass` mà không
 * chạm Redis, nên hoãn nó vài giây không mất gì. Còn `like` phải đi ngay vì màn
 * ăn mừng phụ thuộc câu trả lời — hoãn nó là hoãn khoảnh khắc quan trọng nhất
 * của sản phẩm, đổi lấy một tính năng đa số người dùng không bấm.
 *
 * Chỉ giữ MỘT lượt hoàn tác được, không giữ ngăn xếp. Hoàn tác nhiều bước khi
 * thẻ đã bay khỏi màn hình là mời người dùng lạc: họ không nhớ thẻ thứ ba lùi
 * về là ai.
 */
let last: (UndoCandidate & { toUserId: string }) | null = null;
let deferred: ReturnType<typeof setTimeout> | null = null;

function clearDeferred(): void {
  if (deferred) {
    clearTimeout(deferred);
    deferred = null;
  }
}

/**
 * Ghi một lượt vuốt.
 *
 * Không trả Promise nữa: `pass` bị hoãn nên "khi nào xong" không còn là câu hỏi
 * có câu trả lời tại chỗ. Kết quả đi qua `onResult`, và `null` giữ nguyên nghĩa
 * cũ — "chưa biết có match hay không", KHÔNG phải "không match".
 */
export function queueSwipe(
  toUserId: string,
  action: SwipeAction,
  onResult?: (r: SwipeResult | null) => void,
): void {
  // Lượt trước hết quyền hoàn tác ngay khi có lượt mới: đang hoãn thì đẩy đi
  // luôn, đừng để nằm chờ hết 5 giây trong khi người dùng đã vuốt tiếp — thoát
  // app lúc đó là mất nó.
  flushDeferred();

  const s: UndoCandidate & { toUserId: string } = {
    toUserId, action, atMs: Date.now(), sent: false, createdMatch: false,
  };
  last = s;

  if (action === "pass") {
    deferred = setTimeout(() => {
      deferred = null;
      void send(s, onResult);
    }, UNDO_WINDOW_MS);
    return;
  }

  void send(s, onResult);
}

/** Đẩy ngay lượt đang hoãn (nếu có), không chờ hết cửa sổ. */
export function flushDeferred(): void {
  if (!deferred || !last || last.sent) return;
  const s = last;
  clearDeferred();
  void send(s);
}

async function send(
  s: UndoCandidate & { toUserId: string },
  onResult?: (r: SwipeResult | null) => void,
): Promise<void> {
  s.sent = true;
  try {
    const r = await api.swipe(s.toUserId, s.action);
    if (r.matched) s.createdMatch = true;
    onResult?.(r);
  } catch {
    write([...read(), { toUserId: s.toUserId, action: s.action, at: s.atMs }]);
    onResult?.(null);
  }
}

/**
 * Hoàn tác lượt vuốt gần nhất.
 *
 * Hai đường, tuỳ lượt đó đã rời máy chưa:
 *   chưa gửi → huỷ hẹn giờ. Server chưa từng biết chuyện này xảy ra.
 *   đã gửi   → gọi `api.undoSwipe`, xoá like ở phía server.
 *
 * Cả hai chỉ chạy sau khi `canUndo` gật đầu — luật nằm ở @datting/core để
 * backend dùng lại được cùng một hàm.
 */
export async function undoLast(nowMs: number = Date.now()): Promise<UndoVerdict> {
  const verdict = canUndo(last, nowMs);
  if (!verdict.ok || !last) return verdict;

  const target = last;
  last = null;

  if (!target.sent) {
    clearDeferred();
    return { ok: true };
  }

  try {
    await api.undoSwipe(target.toUserId);
    return { ok: true };
  } catch {
    // Không gọi được server. Không nuốt im lặng — nhưng cũng không dựng lại
    // thẻ: giật ngược một thẻ đã hiện lại còn khó hiểu hơn là để nó ở đó.
    return { ok: false, reason: "expired" };
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
    // Có lượt đang chờ hết cửa sổ hoàn tác thì đẩy trước, để thứ tự gửi khớp
    // thứ tự vuốt. Một người có thể bị 'pass' rồi 'like' ở hai lần khác nhau;
    // đảo thứ tự là ghi ngược ý định của người dùng.
    flushDeferred();
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
