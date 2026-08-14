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
-- Trả về 1 nếu ĐÂY là lượt vuốt tạo ra match, 0 nếu chưa
redis.call('HSET', KEYS[1], ARGV[1], '1')
redis.call('EXPIRE', KEYS[1], ARGV[3])
if redis.call('HEXISTS', KEYS[1], ARGV[2]) == 1 then
  return 1
end
return 0
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
  /** true khi chính lượt swipe này tạo ra match (dùng để chống gửi nudge 2 lần). */
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
  const matched = r === 1;
  return { matched, pairKey: key, createdMatch: matched };
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

  async eval(_script: string, _numKeys: number, ...args: string[]): Promise<number> {
    this.evalCount++;
    const [key, from, to, ttl] = args as [string, string, string, string];
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    h.set(from, "1");
    this.ttl.set(key, Number(ttl));
    return h.has(to) ? 1 : 0;
  }

  /** Chỉ dùng cho test. */
  dump(key: string): Record<string, string> {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
  ttlOf(key: string): number | undefined {
    return this.ttl.get(key);
  }
}
