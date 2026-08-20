-- 0002 — thêm mã lý do 6 (lừa đảo) và chặn mã trôi thêm lần nữa.
--
-- Bối cảnh: app di động đã gửi reason=6 từ TRƯỚC khi mã này tồn tại, vì danh
-- sách lý do trong app dài 6 mục còn bảng chỉ biết 5. Cột không có CHECK nên
-- PostgreSQL nhận hết; lỗi chỉ lộ ra ở hàng đợi kiểm duyệt, nơi trọng số
-- nghiêm trọng không tra được và điểm ưu tiên thành NaN. Với đội MỘT NGƯỜI,
-- một báo cáo xếp sai chỗ là một báo cáo không bao giờ được đọc.
--
-- Chạy được trên dữ liệu đang có: mọi hàng hiện tại đều nằm trong 1..6.

COMMENT ON COLUMN reports.reason IS
  '1 spam, 2 quấy rối, 3 giả mạo, 4 nội dung xấu, 5 khác, 6 lừa đảo';

-- CHECK chính là thứ đã thiếu. Từ nay thêm mã mới phải sửa ở đây trước, và
-- packages/core/src/moderation.ts sẽ báo lỗi biên dịch nếu quên trọng số —
-- SEVERITY_WEIGHT là Record<ReportReason, number>, thiếu khoá là không build.
ALTER TABLE reports
  ADD CONSTRAINT reports_reason_known CHECK (reason BETWEEN 1 AND 6);
