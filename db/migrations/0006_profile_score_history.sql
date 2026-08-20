-- ===========================================================================
-- 0006 — lịch sử điểm chất lượng hồ sơ
--
-- Vì sao cần bảng riêng thay vì đọc `profiles.completeness`: cột đó chỉ giữ giá
-- trị HIỆN TẠI. Một biểu đồ đường cần biết điểm đã đi qua những đâu, và không
-- có cách nào dựng lại quá khứ từ một con số duy nhất.
--
-- ─── Chỉ ghi khi điểm THAY ĐỔI ────────────────────────────────────────────
-- Không ghi mỗi lần mở trang, cũng không ghi theo lịch. Người dùng bấm Lưu mười
-- lần trong một phút mà điểm không đổi thì đó vẫn là MỘT sự kiện duy nhất — ghi
-- mười hàng chỉ làm biểu đồ thành đường răng cưa vô nghĩa và làm bảng phình
-- theo số lần bấm nút.
--
-- Điều kiện đó service phải giữ; xem ghi chú cuối file.
-- ===========================================================================

CREATE TABLE profile_score_history (
  user_id     BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  score       SMALLINT NOT NULL,

  -- Vì sao điểm đổi. Không có cột này thì biểu đồ chỉ là một đường trơ: người
  -- dùng thấy điểm TỤT mà không biết vì sao (ví dụ ảnh bị gỡ sau kiểm duyệt).
  --   0 khởi tạo · 1 sửa hồ sơ · 2 đổi ảnh · 3 kết quả kiểm duyệt
  reason      SMALLINT NOT NULL DEFAULT 1,

  -- `recorded_at` nằm TRONG khoá chính nên các mốc của một người tự nằm liền
  -- nhau và đã sắp sẵn theo thời gian — truy vấn biểu đồ đi thẳng theo khoá,
  -- không phải sắp xếp.
  PRIMARY KEY (user_id, recorded_at),
  CONSTRAINT score_in_range CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT score_reason_known CHECK (reason BETWEEN 0 AND 3)
);

-- ---------------------------------------------------------------------------
-- Hai quy tắc KHÔNG đặt được ở tầng lược đồ, service phải giữ:
--
--   1. Chỉ INSERT khi điểm mới KHÁC mốc gần nhất. Một CHECK không so được với
--      hàng khác, và trigger cho việc này là đặt logic sản phẩm vào chỗ khó
--      test — service đã tính điểm rồi, so thêm một lần là miễn phí.
--
--   2. Điểm phải tính bằng `profileScore()` của `@datting/core`, KHÔNG viết lại
--      công thức ở service. Hai bản sẽ lệch, và khi lệch thì biểu đồ nói một
--      đằng còn con số lớn trên màn nói một nẻo — mà cả hai đều trông có lý.
-- ---------------------------------------------------------------------------
