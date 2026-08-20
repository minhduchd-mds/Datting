-- ===========================================================================
-- 0005 — liên kết mạng xã hội trên hồ sơ
--
-- ⚠ ĐÂY KHÔNG PHẢI ĐĂNG NHẬP MXH. Danh tính vẫn CHỈ là SĐT + OTP. Thêm bất kỳ
--   login MXH nào là Apple bắt buộc phải có "Sign in with Apple" ngang hàng
--   (App Store 4.8). Bảng này chỉ chứa NỘI DUNG hồ sơ — cái handle người dùng
--   tự khai để người kia tìm được mình sau khi đã kết nối.
--
-- ─── Vì sao `visibility` mặc định là 1, không phải 2 ───────────────────────
-- Datting là app CÔNG KHAI, người lạ gặp người lạ. Một handle Instagram đặt
-- trên thẻ khám phá là đường định danh ngược trực tiếp: ghép với vị trí và xu
-- hướng tính dục — hai thứ đã là dữ liệu nhạy cảm theo NĐ13 — thì một hồ sơ
-- ẩn danh thành một người thật mà bất kỳ ai lướt qua cũng chụp lại được, không
-- cần người đó đồng ý gì.
--
-- Sau khi đã kết nối thì khác hẳn: hai bên đã cùng chọn nhau, nên việc trao
-- handle là một trao đổi có đồng thuận. Vì vậy mặc định là 1.
--
-- Mức 2 (công khai) có trong lược đồ nhưng giao diện CHƯA mở, vì nó cần một
-- bước xin đồng ý riêng nói rõ hậu quả — không phải một công tắc lặng lẽ.
-- ===========================================================================

CREATE TABLE profile_links (
  user_id    BIGINT   NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Danh sách ĐÓNG thay vì TEXT tự do: URL tự do trên hồ sơ là một bề mặt lừa
  -- đảo (dẫn sang trang giả, link rút gọn). Mã hoá nền tảng thì server dựng
  -- được URL an toàn từ handle, và người kiểm duyệt biết mình đang xem cái gì.
  --   0 instagram · 1 tiktok · 2 spotify · 3 facebook · 4 khác
  platform   SMALLINT NOT NULL,
  handle     TEXT     NOT NULL,

  --   0 ẩn · 1 chỉ sau khi kết nối · 2 công khai
  visibility SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, platform),
  CONSTRAINT link_platform_known   CHECK (platform BETWEEN 0 AND 4),
  CONSTRAINT link_visibility_known CHECK (visibility BETWEEN 0 AND 2),
  CONSTRAINT link_handle_not_blank CHECK (length(btrim(handle)) > 0),
  -- Handle dài bất thường gần như luôn là dán nhầm cả URL vào ô nhập.
  CONSTRAINT link_handle_sane      CHECK (length(handle) <= 64)
);

-- ---------------------------------------------------------------------------
-- Một quy tắc KHÔNG đặt được ở tầng lược đồ, service phải giữ:
--
--   Chỉ trả liên kết có `visibility = 2`, HOẶC `visibility = 1` khi người hỏi
--   và người sở hữu đang có match còn hiệu lực (`matches.unmatched_at IS NULL`).
--   Không có kiểm này thì cột `visibility` chỉ là chú thích, không phải hàng rào.
-- ---------------------------------------------------------------------------
