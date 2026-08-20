-- Phòng nhiều người (live) + tin nhắn trong phòng.
--
-- ─── Vì sao KHÔNG dùng lại bảng `messages` ────────────────────────────────
-- `0003_messages.sql` khoá chính là `(pair_key, message_id)`. Cả bảng đó dựng
-- quanh một giả định: cuộc trò chuyện có ĐÚNG HAI người, và `pair_key` là
-- `min:max` (bất biến #1 của CLAUDE.md). Phòng có N người thì không có
-- `pair_key` nào cả. Nhét phòng vào đó là phá bất biến đang đỡ Kafka
-- partition, Scylla partition và khoá Valkey.
--
-- ─── Vì sao phòng KHÁC hẳn tin nhắn 1-1 về kiểm duyệt ─────────────────────
-- Một tin nhắn 1-1 xấu chạm tới một người. Một tin trong phòng 200 người chạm
-- tới 200 người ngay lập tức, và CLAUDE.md ghi đội kiểm duyệt là MỘT người.
-- Nên các trần dưới đây không phải "để sau": chúng là điều kiện để tính năng
-- này tồn tại được với nguồn lực thật.

CREATE TABLE rooms (
  room_id      BIGINT PRIMARY KEY,
  owner_id     BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  topic        TEXT CHECK (length(topic) <= 200),

  -- Trần người trong phòng. Có trần thì mới ước lượng được tải kiểm duyệt và
  -- tải fan-out; không trần thì một phòng viral vừa dội vào hub vừa vượt xa
  -- khả năng xử lý báo cáo của một người.
  max_members  SMALLINT NOT NULL DEFAULT 50 CHECK (max_members BETWEEN 2 AND 500),

  -- 0 đang mở · 1 chủ phòng đã đóng · 2 kiểm duyệt tắt
  --
  -- Tách 1 và 2 chứ không gộp thành một cờ `closed`: khi kiểm duyệt tắt một
  -- phòng, chủ phòng KHÔNG được mở lại. Cùng một giá trị cho hai nguyên nhân
  -- thì logic mở lại không phân biệt được, và cách hỏng là im lặng.
  status       SMALLINT NOT NULL DEFAULT 0 CHECK (status BETWEEN 0 AND 2),

  -- Đếm sẵn để danh sách phòng không phải COUNT(*) trên room_members cho từng
  -- hàng. Cập nhật bằng trigger ở dưới, không để tầng ứng dụng tự nhớ.
  member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_msg_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Danh sách phòng: đang mở, sôi động nhất lên trước.
CREATE INDEX idx_rooms_live ON rooms (last_msg_at DESC) WHERE status = 0;

/*
 * Tìm kiếm phòng.
 *
 * `pg_trgm` (đã bật ở `0001_init.sql`) chứ không phải `to_tsvector`: tên phòng
 * do người dùng đặt, thường ngắn, viết tắt, không dấu, và sai chính tả. Full
 * text search tiếng Việt cần từ điển và sẽ trượt "ca phe" khi phòng tên "Cà
 * phê"; trigram thì khớp được vì nó so từng cụm ba ký tự chứ không so từ.
 */
CREATE INDEX idx_rooms_search ON rooms USING GIN (title gin_trgm_ops);

CREATE TABLE room_members (
  room_id    BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- 0 người xem · 1 điều phối · 2 chủ phòng
  role       SMALLINT NOT NULL DEFAULT 0 CHECK (role BETWEEN 0 AND 2),

  -- Tắt tiếng tới thời điểm nào. NULL = không bị tắt.
  --
  -- Lưu MỐC HẾT HẠN chứ không lưu cờ boolean: cờ thì phải có một job đi bật
  -- lại, và job đó hỏng là người dùng bị câm vĩnh viễn mà không ai biết. Mốc
  -- thời gian thì tự hết hạn, không cần ai chạy gì.
  muted_until TIMESTAMPTZ,

  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Một người CHỈ ở trong một phòng một lần. Khoá chính lo việc đó, không để
  -- tầng ứng dụng tự kiểm — mở hai tab là hai request đua nhau.
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX idx_room_members_user ON room_members (user_id);

CREATE TABLE room_messages (
  room_id    BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL,
  sender_id  BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),

  -- 0 chưa quét · 1 sạch · 2 đã ẩn
  --
  -- Có mặt từ NGÀY ĐẦU, giống `0003_messages.sql`. Thêm cột trạng thái vào một
  -- bảng đã có hàng triệu dòng là một cuộc di trú; thêm lúc bảng còn rỗng là
  -- một dòng SQL. Quét chạy BẤT ĐỒNG BỘ, không chặn lúc gửi.
  scan_state SMALLINT NOT NULL DEFAULT 0 CHECK (scan_state BETWEEN 0 AND 2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (room_id, message_id)
);

-- Đọc phòng = lấy N tin mới nhất. Index giảm dần để không phải sort.
CREATE INDEX idx_room_messages_recent ON room_messages (room_id, message_id DESC)
  WHERE scan_state <> 2;

/*
 * Giữ `member_count` đúng bằng trigger, không bằng tầng ứng dụng.
 *
 * Đếm ở tầng ứng dụng nghĩa là mỗi đường vào/ra phải nhớ cộng trừ — và sẽ có
 * một đường quên (ví dụ khi user bị xoá thì CASCADE dọn `room_members` mà
 * không ai chạy code đếm). Con số lệch dần và không ai biết nó lệch từ bao giờ.
 * Trigger thì mọi đường đều đi qua, kể cả CASCADE.
 */
CREATE FUNCTION room_member_count_sync() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE rooms SET member_count = member_count + 1 WHERE room_id = NEW.room_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE rooms SET member_count = member_count - 1 WHERE room_id = OLD.room_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_room_member_count
  AFTER INSERT OR DELETE ON room_members
  FOR EACH ROW EXECUTE FUNCTION room_member_count_sync();
