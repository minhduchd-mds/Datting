import { pairKey } from "./pairKey.js";

/**
 * Phát hiện mutual-like NGUYÊN TỬ.
 *
 * Race condition kinh điển: A và B cùng vuốt phải cách nhau vài mili-giây,
 * cả hai đều đọc "chưa có like nào", không ai tạo match.
 *
 * Cách chữa: một script Lua chạy nguyên tử trên Valkey/Redis — ghi like của
 * mình VÀ kiểm tra chiều ngược lại trong CÙNG một lệnh, một round-trip.
 * Vì cả hai chiều dùng chung `pairKey`, chúng luôn ở cùng một khoá.
 */
export const MUTUAL_LIKE_LUA = `
-- KEYS[1] = like:{pairKey}
-- ARGV[1] = from_user   ARGV[2] = to_user   ARGV[3] = ttl giây
--
-- Trả về BA giá trị, không phải hai:
--   0 = chưa match
--   1 = CHÍNH lượt này tạo ra match
--   2 = đã match từ trước, lượt này không tạo thêm gì
redis.call('HSET', KEYS[1], ARGV[1], '1')
redis.call('EXPIRE', KEYS[1], ARGV[3])
if redis.call('HEXISTS', KEYS[1], ARGV[2]) == 0 then
  return 0
end
-- Đã match. HSETNX trả 1 CHỈ ở lần đặt đầu tiên, nên đúng một lượt vuốt trong
-- toàn bộ vòng đời của cặp này nhận được giá trị 1.
--
-- Tên trường là '$m': mọi trường khác trong hash là user_id, tức chuỗi chữ số,
-- nên ký tự '$' đứng đầu không bao giờ đụng phải một id thật.
if redis.call('HSETNX', KEYS[1], '$m', '1') == 1 then
  return 1
end
return 2
`.trim();


/**
 * Hoàn tác một like. NGUYÊN TỬ, cùng lý do với MUTUAL_LIKE_LUA.
 *
 * Kiểm chiều ngược lại TRƯỚC khi xoá: nếu cả hai đã like nhau thì match đã tồn
 * tại, cả hai đã nhận nudge, và xoá một chiều lúc này để lại một match mà một
 * bên "chưa từng like". Đó là trạng thái không đại diện cho bất cứ điều gì.
 */
export const UNDO_LIKE_LUA = `
-- KEYS[1] = like:{pairKey}
-- ARGV[1] = from_user   ARGV[2] = to_user
-- Trả 1 nếu đã xoá, 0 nếu từ chối vì đã thành match
if redis.call('HEXISTS', KEYS[1], ARGV[2]) == 1 then
  return 0
end
redis.call('HDEL', KEYS[1], ARGV[1])
return 1
`.trim();

/** TTL 90 ngày: like cũ hơn thế coi như hết hiệu lực. */
export const LIKE_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Bề mặt tối thiểu của Valkey/Redis mà module này cần. */
export interface RedisLike {
  eval(script: string, numKeys: number, ...args: string[]): Promise<number>;
}

export type SwipeAction = "like" | "pass" | "superlike";

export interface SwipeResult {
  matched: boolean;
  pairKey: string;
  /**
   * true khi CHÍNH lượt swipe này tạo ra match. Dùng để chống gửi nudge 2 lần.
   *
   * ─── Trường này từng là một lời hứa không được giữ ──────────────────────
   * Bản trước gán `createdMatch: matched` — hai trường có giá trị y hệt nhau,
   * nên nó chỉ nói "hai người này thích nhau", không nói "vừa mới thích nhau".
   * Script Lua cũ trả 1 ở MỌI lượt like một khi cả hai chiều đã tồn tại.
   *
   * Hậu quả: `server.ts` dùng đúng trường này làm cổng duy nhất trước
   * `pushNudge`, nên like lại một người đã match (bấm hai lần, gửi lại khi
   * mạng chập, hai thiết bị, hàng đợi swipe của mobile retry) bắn thông báo
   * "hai bạn đã kết nối" thêm một lần nữa cho CẢ HAI người.
   *
   * Bộ test đơn vị không bắt được, vì `InMemoryRedis` mô phỏng TRUNG THÀNH
   * script hỏng. Chỉ bài chạy trên Valkey thật mới lộ ra.
   */
  createdMatch: boolean;
}

/**
 * Ghi một lượt swipe và trả về kết quả match.
 *
 * `pass` KHÔNG bao giờ tạo match và cố ý không ghi vào khoá like — lịch sử pass
 * đi đường Kafka → ScyllaDB (append-only) và Bloom filter phía deck.
 */
export async function recordSwipe(
  redis: RedisLike,
  from: bigint | number,
  to: bigint | number,
  action: SwipeAction,
): Promise<SwipeResult> {
  const key = pairKey(from, to);
  if (action === "pass") {
    return { matched: false, pairKey: key, createdMatch: false };
  }
  const r = await redis.eval(
    MUTUAL_LIKE_LUA,
    1,
    `like:${key}`,
    String(BigInt(from)),
    String(BigInt(to)),
    String(LIKE_TTL_SECONDS),
  );
  // 0 chưa match · 1 lượt này tạo ra match · 2 đã match từ trước.
  // `matched` đúng cho cả 1 và 2; `createdMatch` chỉ đúng cho 1.
  return { matched: r === 1 || r === 2, pairKey: key, createdMatch: r === 1 };
}


export interface UndoResult {
  undone: boolean;
  reason?: "matched";
}

/**
 * Hoàn tác lượt vuốt gần nhất của `from` với `to`.
 *
 * `pass` không ghi gì nên hoàn tác nó luôn thành công — không có gì để xoá.
 */
export async function undoSwipe(
  redis: RedisLike,
  from: bigint | number,
  to: bigint | number,
): Promise<UndoResult> {
  const key = pairKey(from, to);
  const r = await redis.eval(
    UNDO_LIKE_LUA,
    1,
    `like:${key}`,
    String(BigInt(from)),
    String(BigInt(to)),
  );
  return r === 1 ? { undone: true } : { undone: false, reason: "matched" };
}

// ---------------------------------------------------------------------------
// InMemoryRedis — bản mô phỏng đủ dùng cho test và chạy local.
// Cố ý cài đặt eval() bằng cách CHẠY TUẦN TỰ, mô phỏng đúng tính nguyên tử
// một-luồng của Redis: đó chính là thứ khiến thiết kế này đúng.
// ---------------------------------------------------------------------------
export class InMemoryRedis implements RedisLike {
  private hashes = new Map<string, Map<string, string>>();
  private ttl = new Map<string, number>();
  /** Đếm số lần eval — dùng trong test để chứng minh chỉ tốn 1 round-trip. */
  public evalCount = 0;

  async eval(script: string, _numKeys: number, ...args: string[]): Promise<number> {
    this.evalCount++;
    const [key, from, to, ttl] = args as [string, string, string, string?];
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }

    // Phân nhánh theo SCRIPT. Bản trước bỏ qua tham số này vì chỉ có một script;
    // giờ có hai, và "bỏ qua" sẽ thành "chạy nhầm cái kia" mà không báo gì.
    if (script === UNDO_LIKE_LUA) {
      if (h.has(to)) return 0;
      h.delete(from);
      return 1;
    }

    h.set(from, "1");
    this.ttl.set(key, Number(ttl));
    if (!h.has(to)) return 0;
    // Mô phỏng HSETNX '$m': chỉ lượt ĐẦU TIÊN sau khi cả hai chiều tồn tại mới
    // được coi là lượt tạo ra match. Con giả này phải bám sát script thật —
    // bản trước bám sát một script HỎNG, nên test đơn vị xanh trong khi hành vi
    // thật thì sai. Xem chú thích ở `SwipeResult.createdMatch`.
    if (h.has("$m")) return 2;
    h.set("$m", "1");
    return 1;
  }

  /** Chỉ dùng cho test. */
  dump(key: string): Record<string, string> {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
  ttlOf(key: string): number | undefined {
    return this.ttl.get(key);
  }
}
