import pg from "pg";

/**
 * Kết nối PostgreSQL.
 *
 * `pg.Pool` chứ không phải `Client`: mỗi request HTTP mượn một kết nối rồi trả
 * lại. Một `Client` dùng chung sẽ tuần tự hoá mọi truy vấn của cả tiến trình —
 * đúng loại nút cổ chai không nhìn thấy cho tới khi có tải thật.
 */
export const pool = new pg.Pool({
  connectionString:
    process.env["DATABASE_URL"] ?? "postgresql://datting:datting@127.0.0.1:5432/datting",
  max: 10,
  idleTimeoutMillis: 30_000,
});

/**
 * Sinh id tin nhắn ĐƠN ĐIỆU TĂNG theo thời gian.
 *
 * Khoá chính `(pair_key, message_id)` phục vụ luôn phân trang theo con trỏ, và
 * điều đó CHỈ đúng khi id tăng theo thời gian. Dùng một sequence chung thì vẫn
 * đơn điệu nên vẫn được — nhưng nó buộc mọi lượt ghi đi qua một điểm tranh chấp
 * duy nhất, cho đúng cái bảng nóng nhất hệ thống.
 *
 * Ở đây dùng dạng snowflake rút gọn: mili-giây kể từ mốc riêng dịch trái 10 bit,
 * cộng số thứ tự trong cùng mili-giây. Không cần điều phối giữa các tiến trình ở
 * mức tải dev; khi lên nhiều pod thì chèn thêm bit worker vào giữa.
 */
const EPOCH = Date.UTC(2026, 0, 1);
let lastMs = 0;
let seq = 0;

export function nextMessageId(): string {
  const now = Date.now();
  if (now === lastMs) {
    seq = (seq + 1) & 0x3ff;
    // Cạn 1024 id trong cùng một mili-giây thì đợi sang mili-giây kế. Ở dev
    // không bao giờ chạm, nhưng THIẾU nhánh này thì id sẽ TRÙNG chứ không chậm.
    if (seq === 0) {
      while (Date.now() === now) {
        /* xoay tại chỗ, tối đa 1ms */
      }
      return nextMessageId();
    }
  } else {
    lastMs = now;
    seq = 0;
  }
  return String((BigInt(now - EPOCH) << 10n) | BigInt(seq));
}
