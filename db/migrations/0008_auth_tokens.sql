-- Token phiên sau khi xác thực OTP.
--
-- Không có bảng này thì "đăng nhập" chỉ là kịch: màn hình đổi, nhưng API vẫn
-- phục vụ một người dùng cứng. Token phải TRA RA được một hàng thật thì lượt
-- đăng nhập mới có nghĩa.
--
-- ─── Vì sao lưu BĂM chứ không lưu token ────────────────────────────────────
-- Token là vật mang quyền: ai cầm nó thì LÀ người dùng đó, không cần biết mật
-- khẩu (mà sản phẩm này cũng không có mật khẩu). Lưu nguyên văn thì bảng này
-- ngang một bảng mật khẩu chưa băm — đọc được database là đóng vai được mọi
-- người đang đăng nhập. Băm rồi thì bản dump chỉ còn là chuỗi vô dụng.
--
-- ─── Vì sao token opaque chứ không JWT ─────────────────────────────────────
-- JWT không thu hồi được trước hạn nếu không có một danh sách đen — tức là
-- vẫn phải có bảng, cộng thêm một lớp mật mã để hiểu sai. Ở đây "đăng xuất
-- khỏi thiết bị này" và "thu hồi mọi phiên khi báo mất máy" chỉ là một câu
-- DELETE. Với một app hẹn hò, thu hồi được là yêu cầu an toàn thật.

CREATE TABLE auth_tokens (
  -- SHA-256 của token. Token thô chỉ tồn tại đúng một lần: trong phản hồi của
  -- /v1/auth/otp/verify. Server không bao giờ đọc lại được nó.
  token_hash   TEXT PRIMARY KEY,

  user_id      BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Có hạn. Phiên sống mãi nghĩa là một máy tính công cộng quên đăng xuất là
  -- mất tài khoản vĩnh viễn.
  expires_at   TIMESTAMPTZ NOT NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Để hiện "đăng nhập lần cuối" và để dọn phiên bỏ hoang.
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Thu hồi mọi phiên của người này" — dùng khi báo mất máy, đổi số, hoặc khi
-- kiểm duyệt khoá tài khoản. Không có index này thì thao tác đó quét cả bảng
-- đúng vào lúc cần nhanh nhất.
CREATE INDEX idx_auth_tokens_user ON auth_tokens (user_id);

-- Dọn phiên hết hạn.
CREATE INDEX idx_auth_tokens_expired ON auth_tokens (expires_at);
