-- Thách thức OTP cho đăng nhập bằng SĐT.
--
-- Danh tính của Datting CHỈ là SĐT + OTP (không mật khẩu, không email, không
-- login MXH — xem `users.phone_e164`). Nghĩa là bảng này là TOÀN BỘ cơ chế xác
-- thực của sản phẩm: hỏng ở đây là ai cũng đăng nhập được vào tài khoản người
-- khác. Bốn quyết định dưới đây không phải chi tiết triển khai.
--
-- 1. KHÔNG lưu mã thô, chỉ lưu băm.
--    Một bản dump database — sao lưu, log replica, lộ do đọc lậu — không được
--    phép biến thành khả năng đăng nhập vào bất kỳ tài khoản nào đang chờ mã.
--
-- 2. Đếm số lần thử, và có TRẦN.
--    Mã 6 chữ số chỉ có một triệu khả năng. Không có trần thì một script dò
--    hết trong vài giây; mã dài hơn cũng không cứu được. Chính cái trần mới là
--    thứ làm nên an toàn, không phải độ dài mã.
--
-- 3. Có hạn dùng.
--    Mã sống vĩnh viễn nghĩa là một tin nhắn SMS cũ trong máy đã mất vẫn còn
--    mở được tài khoản.
--
-- 4. Một hàng cho mỗi số (PRIMARY KEY là SĐT), và có thời gian chờ gửi lại.
--    Gửi OTP là gửi tin nhắn tới một người THẬT và tốn tiền thật cho mỗi tin.
--    Không giới hạn thì endpoint này thành công cụ dội tin nhắn nhắm vào người
--    khác, do máy chủ của chính mình trả tiền. Đây là kiểu lạm dụng mà nạn
--    nhân không hề có tài khoản trên nền tảng.

CREATE TABLE otp_challenges (
  -- Một số điện thoại chỉ có MỘT thách thức đang sống. Xin mã mới thì ghi đè
  -- mã cũ (ON CONFLICT DO UPDATE) — giữ nhiều mã cùng hiệu lực cho một số là
  -- nhân số cơ hội đoán trúng lên.
  phone_e164   TEXT PRIMARY KEY,

  -- HMAC-SHA256 của mã, khoá là bí mật phía server. Không phải SHA256 trần:
  -- không gian mã chỉ có một triệu phần tử nên bảng tra cứu dựng sẵn được
  -- trong vài giây. Có khoá bí mật thì bảng dựng sẵn vô dụng.
  code_hash    TEXT        NOT NULL,

  expires_at   TIMESTAMPTZ NOT NULL,

  -- Số lần nhập sai. Chạm trần là thách thức chết, phải xin mã mới.
  attempts     SMALLINT    NOT NULL DEFAULT 0 CHECK (attempts >= 0),

  -- Mốc gửi lần cuối, để chặn gửi lại quá dày.
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dọn rác: thách thức hết hạn không còn giá trị gì, và số điện thoại là dữ
-- liệu cá nhân — giữ lại quá thời gian cần thiết là xử lý không có mục đích.
CREATE INDEX idx_otp_expired ON otp_challenges (expires_at);
