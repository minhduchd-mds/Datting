// Named import, KHÔNG phải default: `ioredis` là CJS, còn package này là ESM
// thật (`"type": "module"` + moduleResolution nodenext). Với tổ hợp đó,
// `import Redis from "ioredis"` cho ra một NAMESPACE — TypeScript báo
// "Cannot use namespace 'Redis' as a type" và "not constructable".
import { Redis } from "ioredis";

import type { RedisLike } from "./mutualLike.js";
import type { ImpressionLookup } from "./pgSource.js";

/**
 * Valkey thật, thay `InMemoryRedis`.
 *
 * ─── Vì sao `ioredis` chứ không một client tên "valkey" ───────────────────
 * Valkey là bản fork wire-compatible của Redis; lý do repo chọn Valkey là GIẤY
 * PHÉP CỦA SERVER (BSD thay vì AGPLv3), không phải giao thức. Client nào nói
 * đúng RESP cũng dùng được, và `ioredis` là bản đã chạy nhiều nhất — nó lo
 * `EVALSHA` caching, pipelining và reconnect, ba thứ tự viết đều dễ sai.
 *
 * ─── Vì sao đây KHÔNG chỉ là tối ưu ───────────────────────────────────────
 * `InMemoryRedis` giữ trạng thái "đã like" trong RAM tiến trình. Hệ quả không
 * phải chậm mà là SAI: khởi động lại là mất hết like đang chờ đối phương, và
 * hai instance sau load balancer sẽ không bao giờ thấy match của nhau vì mỗi
 * cái giữ một nửa dữ liệu. Script Lua mutual-like sinh ra để nguyên tử trên
 * MỘT kho chung; hai kho thì tính nguyên tử đó vô nghĩa.
 */
export class ValkeyClient implements RedisLike {
  constructor(private readonly redis: Redis) {}

  /**
   * `ioredis.eval` trả `unknown`. Script mutual-like và undo đều trả số, nên ép
   * về number ở đây thay vì rải `as number` khắp các chỗ gọi.
   */
  async eval(script: string, numKeys: number, ...args: string[]): Promise<number> {
    const r = await this.redis.eval(script, numKeys, ...args);
    return Number(r);
  }
}

/**
 * Khoá bộ đếm hiển thị, theo NGÀY.
 *
 * Ngày nằm trong khoá chứ không nằm trong giá trị: nhờ vậy hết ngày là bộ đếm
 * tự biến mất theo TTL, không cần job quét nào đi xoá. Dùng UTC để hai instance
 * ở hai múi giờ không đếm vào hai khoá khác nhau.
 */
export function impressionKey(userId: bigint, now: Date): string {
  return `impr:${now.toISOString().slice(0, 10)}:${userId.toString()}`;
}

/** Bộ đếm sống 48 giờ: qua nửa đêm vẫn còn khoá hôm qua để đối chiếu. */
export const IMPRESSION_TTL_SECONDS = 48 * 60 * 60;

/**
 * Tra số lần hiển thị hôm nay cho một LÔ ứng viên.
 *
 * Một `MGET` cho cả lô, không phải N lần `GET`: deck lấy tới 2.000 ứng viên, và
 * 2.000 round-trip là thứ sẽ xuất hiện trong biểu đồ p99 chứ không phải trong
 * code review.
 */
export function valkeyImpressions(
  redis: Redis,
  now: () => Date = () => new Date(),
): ImpressionLookup {
  return async (ids) => {
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const t = now();
    const values = await redis.mget(ids.map((id) => impressionKey(id, t)));
    ids.forEach((id, i) => {
      const v = values[i];
      // Khoá chưa tồn tại ⇒ null ⇒ bỏ qua, người gọi mặc định 0. Đây là trạng
      // thái ĐÚNG cho người chưa được ai thấy hôm nay — khác hẳn tình huống
      // "không có nguồn đếm" mà PgCandidateSource cảnh báo.
      if (v !== null && v !== undefined) out.set(id.toString(), Number(v));
    });
    return out;
  };
}

/**
 * Ghi nhận một lô hồ sơ vừa được hiển thị.
 *
 * `INCR` + `EXPIRE` trong một pipeline. Đặt TTL mỗi lần chứ không chỉ lần đầu:
 * rẻ hơn nhiều so với `EXISTS` rồi mới quyết, và tránh được trường hợp khoá
 * sống mãi vì lần đặt TTL đầu tiên rơi đúng lúc mất kết nối.
 */
export async function recordImpressions(
  redis: Redis,
  ids: bigint[],
  now = new Date(),
): Promise<void> {
  if (ids.length === 0) return;
  const pipe = redis.pipeline();
  for (const id of ids) {
    const k = impressionKey(id, now);
    pipe.incr(k);
    pipe.expire(k, IMPRESSION_TTL_SECONDS);
  }
  await pipe.exec();
}

/**
 * Mở kết nối và ĐỢI nó sẵn sàng.
 *
 * `lazyConnect` + `await connect()` để lỗi cấu hình nổ ngay lúc khởi động, nơi
 * có chỗ bắt. Mặc định của ioredis là nối ngầm rồi retry mãi — service sẽ lên
 * xanh, nhận request, rồi hỏng từng cái một ở tầng dưới.
 */
export async function connectValkey(url: string): Promise<Redis> {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  await redis.connect();
  return redis;
}
