-- ===========================================================================
-- 0004 — lượt thích đến (bản chiếu)
--
-- Nguồn sự thật của lượt vuốt là ScyllaDB, append-only — giống hệt match. Bảng
-- `matches` trong 0001 đã tự khai là "bản chiếu" của Scylla; bảng này theo đúng
-- khuôn đó, KHÔNG mở ra một nguồn sự thật thứ hai.
--
-- Vì sao cần: màn "Chờ" (`/v1/me/likes-you`, hợp đồng đã có sẵn ở
-- `apps/mobile/src/api.ts`) hỏi một câu mà Postgres trước đây không trả lời
-- được: "ai đã thích tôi mà tôi chưa quyết". Câu đó lọc theo người NHẬN và theo
-- trạng thái đã quyết hay chưa — quét toàn bộ lịch sử vuốt trong Scylla cho mỗi
-- lần mở màn là sai kiểu lưu trữ. Bản chiếu tồn tại chính vì thế.
-- ===========================================================================

CREATE TABLE incoming_likes (
  -- Người NHẬN đứng trước trong khoá chính: mọi truy vấn của màn này đều bắt
  -- đầu bằng "của tôi", nên khoá chính phục vụ luôn, không cần index thứ hai.
  to_user_id   BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  from_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Người kia thích CÁI GÌ. Thiết kế VTF-6 hiện dòng "đã thích ảnh của bạn" /
  -- "đã thích câu trả lời của bạn" chứ không chỉ "đã thích bạn" — một tín hiệu
  -- cụ thể giúp mở lời dễ hơn nhiều so với một lượt thích trống.
  --   0 hồ sơ · 1 ảnh · 2 câu trả lời
  liked_kind   SMALLINT NOT NULL DEFAULT 0,
  liked_label  TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = tôi chưa quyết. Đây là thứ phân biệt "đang chờ" với "đã xử lý", và
  -- là lý do bảng này không thể chỉ là một VIEW trên lịch sử vuốt.
  decided_at   TIMESTAMPTZ,

  PRIMARY KEY (to_user_id, from_user_id),
  CONSTRAINT like_not_self CHECK (to_user_id <> from_user_id),
  CONSTRAINT like_kind_known CHECK (liked_kind BETWEEN 0 AND 2)
);

-- Hàng đợi "đang chờ tôi": index MỘT PHẦN, chỉ giữ hàng chưa quyết. Số lượt
-- thích tích luỹ theo thời gian không giới hạn, còn số lượt đang chờ thì luôn
-- nhỏ — index đầy đủ ở đây sẽ lớn dần mãi mà 99% số hàng không bao giờ đọc tới.
CREATE INDEX idx_incoming_likes_pending
  ON incoming_likes (to_user_id, created_at DESC) WHERE decided_at IS NULL;
