-- ===========================================================================
-- 0003 — tin nhắn
--
-- Hợp đồng phía client đã tồn tại TỪ TRƯỚC migration này: kiểu `Message`, hai
-- endpoint `GET|POST /v1/matches/:pairKey/messages`, và `NudgeMessage` trong
-- `services/ws-gateway`. Thiếu đúng bảng này và một service thi hành. Vì vậy
-- lược đồ dưới đây bám theo hợp đồng đã có, không định nghĩa lại nó.
-- ===========================================================================

CREATE TABLE messages (
  -- Khoá cặp dạng chuẩn "min:max" — CÙNG một biểu diễn với Kafka partition,
  -- Scylla partition, khoá Valkey và `matches.pair_key`. Đặt nó làm cột đầu của
  -- khoá chính khiến toàn bộ tin của một cuộc trò chuyện nằm liền nhau trên
  -- đĩa, và giữ đúng bất biến khoá cặp của cả hệ thống.
  pair_key   TEXT   NOT NULL REFERENCES matches(pair_key) ON DELETE CASCADE,

  -- Id do ứng dụng sinh, đơn điệu tăng theo thời gian (cùng lối với
  -- `consent_id`). Nhờ đơn điệu, khoá chính bên dưới phục vụ luôn được truy vấn
  -- phân trang theo con trỏ mà không cần index thứ hai.
  message_id BIGINT NOT NULL,

  sender_id  BIGINT NOT NULL REFERENCES users(user_id),
  body       TEXT   NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Đã đọc tới đâu. NULL = chưa đọc. Để ở đây thay vì một bảng riêng vì nó
  -- luôn được đọc cùng tin nhắn và không bao giờ được đọc một mình.
  read_at    TIMESTAMPTZ,

  -- Kiểm duyệt tin nhắn là BẤT ĐỒNG BỘ và KHÔNG chặn gửi (CLAUDE.md). Nghĩa là
  -- hàng được ghi ở trạng thái 0 rồi mới có người/máy quét sau — nên cột này
  -- phải có mặt ngay từ migration đầu. Thêm cột vào một bảng tin nhắn đã có dữ
  -- liệu thật tốn hơn nhiều lần so với đặt đúng chỗ ngay bây giờ.
  --   0 chưa quét · 1 sạch · 2 gắn cờ chờ người xem · 3 đã gỡ
  scan_state SMALLINT NOT NULL DEFAULT 0,
  scanned_at TIMESTAMPTZ,

  PRIMARY KEY (pair_key, message_id),
  CONSTRAINT message_body_not_blank CHECK (length(btrim(body)) > 0),
  CONSTRAINT message_scan_state_known CHECK (scan_state BETWEEN 0 AND 3)
);

-- Hàng đợi quét: index MỘT PHẦN, chỉ chứa hàng chưa quét. Bảng tin nhắn sẽ lớn
-- hơn mọi bảng khác vài bậc, còn số hàng chưa quét thì luôn nhỏ — index đầy đủ
-- ở đây sẽ tốn gần bằng chính bảng mà 99,99% số hàng không bao giờ được dùng.
CREATE INDEX idx_messages_unscanned ON messages (created_at) WHERE scan_state = 0;

-- Đếm chưa đọc cho người nhận. Cũng là index một phần vì tin đã đọc không bao
-- giờ được hỏi theo chiều này.
CREATE INDEX idx_messages_unread ON messages (pair_key, sender_id) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
-- Ba quy tắc KHÔNG đặt được ở tầng lược đồ, service phải tự giữ:
--
--   1. `sender_id` phải là `user_a` hoặc `user_b` của chính `pair_key` đó.
--      Kiểm được bằng trigger, nhưng một truy vấn phụ trên mỗi INSERT vào bảng
--      nóng nhất hệ thống là cái giá sai — service đã phải đọc match để xác
--      thực rồi, kiểm ở đó là miễn phí.
--
--   2. `matches.unmatched_at IS NULL`. Huỷ kết nối rồi thì không nhắn tiếp
--      được. CHÚ Ý: không dùng ON DELETE cho việc này vì huỷ kết nối là xoá
--      MỀM — hàng `matches` vẫn còn, chỉ có `unmatched_at` được đặt.
--
--   3. Không có hàng nào trong `blocks` giữa hai người. Chặn là một chiều
--      trong bảng nhưng hai chiều trong hiệu lực.
-- ---------------------------------------------------------------------------
