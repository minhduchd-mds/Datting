-- Quà tặng trong phòng + gói nâng cấp.
--
-- Cả hai đứng TRÊN `0011_wallet.sql`: không có bảng nào ở đây tự cộng trừ xu.
-- Mọi thay đổi số dư đều đi qua sổ cái, để có đúng MỘT chỗ trả lời được câu
-- "xu này từ đâu ra và đi đâu".

-- ------------------------------------------------------------------ quà tặng

CREATE TABLE gift_catalog (
  gift_id    SMALLINT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,       -- 'hoa', 'gau-bong', 'vuong-mien'...
  name       TEXT NOT NULL,

  -- Giá bằng XU, số nguyên. Xem quyết định 1 ở đầu `0011_wallet.sql`.
  price      INTEGER NOT NULL CHECK (price > 0),

  -- Ký tự emoji hoặc mã hình. Để client vẽ; server không cần biết nó là gì.
  glyph      TEXT NOT NULL,

  /*
   * Tỉ lệ người NHẬN được hưởng, tính theo phần trăm.
   *
   * Lưu ở đây chứ không hardcode trong mã: đổi tỉ lệ ăn chia là một quyết định
   * kinh doanh, và nó phải đổi được mà không cần deploy. Quan trọng hơn — mỗi
   * `gift_events` ghi lại tỉ lệ TẠI THỜI ĐIỂM tặng (xem `earn_rate` dưới), nên
   * đổi tỉ lệ hôm nay không viết lại lịch sử hôm qua.
   */
  earn_rate  SMALLINT NOT NULL DEFAULT 50 CHECK (earn_rate BETWEEN 0 AND 100),

  -- Ngừng bán mà KHÔNG xoá: `gift_events` cũ vẫn phải tra ngược ra được món
  -- quà đó là gì. Xoá hàng là làm hỏng lịch sử.
  active     BOOLEAN NOT NULL DEFAULT true,

  sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE gift_events (
  gift_event_id BIGINT PRIMARY KEY,

  room_id       BIGINT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  from_user     BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  to_user       BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  gift_id       SMALLINT NOT NULL REFERENCES gift_catalog(gift_id),

  qty           SMALLINT NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 99),

  /*
   * Giá và tỉ lệ ĐÃ CHỐT tại thời điểm tặng.
   *
   * Nhìn qua thì đây là dữ liệu thừa — `gift_catalog` đã có. Nhưng catalog là
   * bảng SỐNG: giá đổi, tỉ lệ đổi. Không chốt lại ở đây thì báo cáo doanh thu
   * tháng trước sẽ tự đổi số khi ai đó chỉnh giá hôm nay, và không ai hiểu vì
   * sao. Đây là lý do mọi hệ thống bán hàng đều sao chép giá vào đơn hàng.
   */
  unit_price    INTEGER NOT NULL CHECK (unit_price > 0),
  earn_rate     SMALLINT NOT NULL CHECK (earn_rate BETWEEN 0 AND 100),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Không cho tự tặng mình. Nếu không, đây là một vòng bơm chỉ số: tặng cho
  -- chính mình rồi nhận lại phần earn_rate.
  CONSTRAINT gift_not_self CHECK (from_user <> to_user)
);

CREATE INDEX idx_gift_room ON gift_events (room_id, created_at DESC);
-- Bảng xếp hạng người nhận trong phòng, và đối soát thu nhập của một người.
CREATE INDEX idx_gift_to ON gift_events (to_user, created_at DESC);

-- -------------------------------------------------------------- gói nâng cấp

CREATE TABLE subscriptions (
  sub_id       BIGINT PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- 'plus' | 'gold'. Chuỗi chứ không phải số: nó xuất hiện trong mã sản phẩm
  -- của Apple/Google, và một con số thì không đối chiếu được bằng mắt.
  tier         TEXT NOT NULL,

  /*
   * Quyền lợi là KHOẢNG THỜI GIAN, không phải một cờ boolean.
   *
   * `is_premium BOOLEAN` là cách hỏng kinh điển: nó cần một job đi tắt khi hết
   * hạn, và job đó chậm một ngày là phát không một ngày cho tất cả, hoặc chạy
   * sai là cắt quyền của người đang còn hạn. Khoảng thời gian thì câu hỏi "còn
   * hạn không" trả lời được bằng `now() < expires_at`, không cần ai chạy gì.
   */
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,

  -- Giao dịch đã mua ra gói này. NULL khi là quà tặng/khuyến mãi thủ công.
  payment_id   BIGINT REFERENCES payments(payment_id),

  -- Huỷ gia hạn ≠ mất quyền ngay. Người dùng đã trả tiền cho tới `expires_at`,
  -- nên cắt ngay lúc bấm huỷ là lấy lại thứ đã bán.
  cancelled_at TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sub_period CHECK (expires_at > started_at)
);

/*
 * "Người này còn quyền không" — câu hỏi chạy ở MỌI request có phân quyền, nên
 * nó phải rẻ.
 *
 * KHÔNG dùng partial index `WHERE expires_at > now()`: `now()` không bất biến
 * nên Postgres từ chối đưa vào định nghĩa index. Index theo
 * `(user_id, expires_at DESC)` cho phép lấy gói xa hạn nhất của một người bằng
 * một lần tìm, rồi so với `now()` lúc chạy.
 */
CREATE INDEX idx_subs_active ON subscriptions (user_id, expires_at DESC);

-- ------------------------------------------------------------ catalog ban đầu
--
-- Giá đặt theo bậc rõ ràng để người dùng đọc được thứ tự mà không phải so
-- sánh: 10 · 50 · 200 · 1000. Mỗi bậc gấp 4–5 lần bậc dưới.
INSERT INTO gift_catalog (gift_id, code, name, price, glyph, earn_rate, sort_order) VALUES
  (1, 'hoa',        'Bông hoa',    10,   '🌷', 50, 1),
  (2, 'ca-phe',     'Ly cà phê',   50,   '☕', 50, 2),
  (3, 'gau-bong',   'Gấu bông',    200,  '🧸', 55, 3),
  (4, 'vuong-mien', 'Vương miện',  1000, '👑', 60, 4);
