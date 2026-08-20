# PostgreSQL 18 + PostGIS + pgvector.
#
# ─── Vì sao cần file này ────────────────────────────────────────────────────
# `0001_init.sql` mở đầu bằng ba extension:
#
#     CREATE EXTENSION IF NOT EXISTS postgis;
#     CREATE EXTENSION IF NOT EXISTS vector;     ← không có trong ảnh postgis
#     CREATE EXTENSION IF NOT EXISTS pg_trgm;
#
# `postgis/postgis:18-3.6` có postgis và pg_trgm, KHÔNG có pgvector. Thiếu nó
# thì migration dừng ngay dòng 10 — và vì `psql` mặc định chạy tiếp sau lỗi,
# bảng `profiles` (khai ngay sau đó, có cột `embedding VECTOR(128)`) không được
# tạo, còn chín bảng phía sau thì có. Kết quả là một database trông như đã
# migrate xong nhưng thiếu đúng bảng trung tâm. Đã dính đúng lỗi này khi dựng
# môi trường dev bằng tay.
#
# `docker-compose.yml` trước đây ghi "pgvector cài thêm ở bước init (xem ops/)"
# mà thư mục `ops/` không tồn tại. File này lấp chỗ đó.
#
# ─── Vì sao dựng ảnh chứ không cài lúc khởi động ────────────────────────────
# Đặt một script `apt-get install` vào `/docker-entrypoint-initdb.d` cũng chạy
# được, nhưng nó tải gói MỖI LẦN dựng container mới — chậm, và cần mạng đúng
# vào lúc khởi động database. Trên CI thì đó là thêm một điểm hỏng nằm ngoài
# tầm kiểm soát. Nướng vào ảnh thì tải một lần, cache lại, và container lên là
# đã sẵn sàng.

FROM postgis/postgis:18-3.6

# Ảnh này dựng trên ảnh `postgres` chính thức nên đã có sẵn kho PGDG — cài
# thẳng được, không phải biên dịch từ nguồn.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-18-pgvector \
 && rm -rf /var/lib/apt/lists/*
