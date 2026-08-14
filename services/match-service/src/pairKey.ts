/**
 * pairKey — biểu diễn CHUẨN DUY NHẤT của một cặp người dùng.
 *
 * Đây là nền tảng của toàn bộ hệ thống match. Vì `pairKey(a,b) === pairKey(b,a)`,
 * cả hai chiều swipe luôn rơi vào CÙNG một partition (Kafka, ScyllaDB) và cùng
 * một khoá (Valkey). Nhờ đó:
 *
 *   1. Kiểm tra mutual-like = một lần đọc single-partition, không cần
 *      transaction phân tán, không cần Cassandra LWT.
 *   2. Kafka giữ đúng thứ tự cho mọi sự kiện của một cặp.
 *   3. Race condition "A và B cùng vuốt phải cách nhau 3ms" biến mất.
 *
 * Nếu bỏ quy ước này, bạn sẽ phải trả giá bằng một hệ thống đối soát phức tạp
 * gấp nhiều lần — đây là quyết định lược đồ đắt nhất khi phải sửa về sau.
 */
export function pairKey(a: bigint | number, b: bigint | number): string {
  const x = BigInt(a);
  const y = BigInt(b);
  if (x === y) throw new Error("pairKey: không thể ghép một người với chính họ");
  return x < y ? `${x}:${y}` : `${y}:${x}`;
}

/** Tách pairKey ngược lại thành hai id (đã sắp xếp tăng dần). */
export function unpairKey(key: string): [bigint, bigint] {
  const [a, b] = key.split(":");
  if (a === undefined || b === undefined) throw new Error(`pairKey không hợp lệ: ${key}`);
  return [BigInt(a), BigInt(b)];
}

/** Cho pairKey và một phía, trả về phía còn lại. */
export function otherSide(key: string, self: bigint | number): bigint {
  const [a, b] = unpairKey(key);
  const s = BigInt(self);
  if (s === a) return b;
  if (s === b) return a;
  throw new Error(`${self} không thuộc cặp ${key}`);
}
