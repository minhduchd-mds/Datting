-- =============================================================================
-- DATTING — lược đồ khởi tạo
-- PostgreSQL 18 + PostGIS 3.6 + pgvector 0.8.2
--
-- ⚠ pgvector: PHẢI dùng >= 0.8.2. Bản 0.8.0/0.8.1 dính CVE-2026-3172
--   (buffer overflow khi build HNSW song song, có thể rò dữ liệu hoặc crash).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- người dùng
CREATE TABLE users (
  user_id        BIGINT PRIMARY KEY,             -- Snowflake ID (sortable theo thời gian)
  -- Danh tính DUY NHẤT là số điện thoại đã xác thực OTP. Không SSO, không mật
  -- khẩu, không email. Một app hẹn hò cần rào cản chi phí để chặn tài khoản rác.
  --
  -- UNIQUE vẫn có hiệu lực với hàng đã xoá mềm (deleted_at IS NOT NULL). Đó là
  -- CHỦ Ý: nó chặn xoá-rồi-tạo-lại để né lệnh cấm trong 30 ngày. Đừng "sửa" chỗ
  -- này thành partial unique index — bạn sẽ mở lại đúng lỗ hổng đó.
  phone_e164     TEXT NOT NULL UNIQUE,
  status         SMALLINT NOT NULL DEFAULT 0,    -- 0 active 1 paused 2 shadowban 3 banned 4 deleted
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ                     -- xoá mềm; purge cứng sau 30 ngày (NĐ13)
);
CREATE INDEX idx_users_active ON users (last_active_at DESC) WHERE status = 0;

-- -------------------------------------------------------------------- hồ sơ
CREATE TABLE profiles (
  user_id        BIGINT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL,
  birth_date     DATE NOT NULL,                  -- lưu ngày sinh, KHÔNG lưu tuổi
  gender         SMALLINT NOT NULL,
  bio            TEXT CHECK (length(bio) <= 500),
  community      TEXT,                           -- quận/khu vực: TRỤC ĐA DẠNG HOÁ, không xếp hạng
  job_title      TEXT,
  lifestyle      TEXT[] NOT NULL DEFAULT '{}',   -- "Dậy sớm", "Nuôi thú cưng", "Không hút thuốc"...
  interests      TEXT[] NOT NULL DEFAULT '{}',
  intent         TEXT[] NOT NULL DEFAULT '{}',   -- "Hẹn hò nghiêm túc", "Kết bạn trước"...
  completeness   SMALLINT NOT NULL DEFAULT 0 CHECK (completeness BETWEEN 0 AND 100),
  verified_photo BOOLEAN NOT NULL DEFAULT false,
  geo            GEOGRAPHY(POINT, 4326),         -- truy vấn CÓ THẨM QUYỀN
  s2_cell_l8     BIGINT NOT NULL,                -- khoá geoshard (đường NÓNG)
  s2_cell_l12    BIGINT NOT NULL,
  embedding      VECTOR(128),                    -- bản sao của Qdrant, để backfill
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_adult CHECK (birth_date <= (CURRENT_DATE - INTERVAL '18 years'))
);
CREATE INDEX idx_profiles_shard     ON profiles (s2_cell_l8, updated_at DESC);
CREATE INDEX idx_profiles_geo       ON profiles USING GIST (geo);
CREATE INDEX idx_profiles_interests ON profiles USING GIN (interests);
CREATE INDEX idx_profiles_lifestyle  ON profiles USING GIN (lifestyle);
-- HNSW cho pgvector: chỉ dùng để backfill/đối soát. Truy hồi production đi Qdrant.
CREATE INDEX idx_profiles_embedding ON profiles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- ------------------------------------------------------------ tiêu chí kết nối
CREATE TABLE preferences (
  user_id           BIGINT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  -- ⚠ NĐ13/2023: `want_genders` suy ra được XU HƯỚNG TÍNH DỤC ⇒ dữ liệu nhạy
  --   cảm, ngang hàng với vị trí. Cần đồng ý RIÊNG (consents.purpose =
  --   'orientation'), và KHÔNG BAO GIỜ được lộ ra API công khai của người khác.
  want_genders      SMALLINT[] NOT NULL DEFAULT '{}',
  age_min           SMALLINT NOT NULL DEFAULT 18 CHECK (age_min >= 18),
  age_max           SMALLINT NOT NULL DEFAULT 99,
  max_distance_km   SMALLINT NOT NULL DEFAULT 50 CHECK (max_distance_km BETWEEN 1 AND 500),
  interest_tags     TEXT[] NOT NULL DEFAULT '{}',
  auto_suggest      BOOLEAN NOT NULL DEFAULT true,   -- "Đề xuất tự động kết nối"
  notify_on_connect BOOLEAN NOT NULL DEFAULT true,
  msg_on_connect    BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT prefs_age_order CHECK (age_min <= age_max)
);

-- --------------------------------------------------------------------- ảnh
CREATE TABLE photos (
  photo_id     BIGINT PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  position     SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 5), -- tối đa 6 ảnh
  cdn_key      TEXT NOT NULL,
  blurhash     TEXT,
  moderation   SMALLINT NOT NULL DEFAULT 0,  -- 0 pending 1 approved 2 blurred 3 blocked
  moderated_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, position)
);
-- Ảnh CHƯA duyệt không bao giờ được hiển thị công khai — ràng buộc ở tầng đọc.
--
-- ⚠ RÀNG BUỘC VẬN HÀNH: đội kiểm duyệt hiện tại là MỘT NGƯỜI. Duyệt ảnh là
--   CHẶN (blocking), nên hàng đợi này chính là trần đăng ký của cả sản phẩm:
--   1 người ×  ~10 giây/ảnh × 6 ảnh/hồ sơ = ~60 hồ sơ/giờ, tuyệt đối.
--   ⇒ BẮT BUỘC có lượt lọc ML trước: tự động duyệt khi điểm an toàn > 0.98,
--     tự động chặn khi < 0.02, người chỉ xem dải ở giữa (thường ~5-10%).
--   ⇒ CSAM (PhotoDNA/Thorn Safer) KHÔNG bao giờ vào hàng đợi người: chặn +
--     báo cáo tự động. Không ai phải nhìn thứ đó bằng mắt.
CREATE INDEX idx_photos_pending ON photos (created_at) WHERE moderation = 0;

-- --------------------------------------------------- giới thiệu (bottom-sheet)
CREATE TABLE introductions (
  intro_id      BIGINT PRIMARY KEY,
  introducer_id BIGINT NOT NULL REFERENCES users(user_id),
  subject_id    BIGINT NOT NULL REFERENCES users(user_id),
  target_id     BIGINT NOT NULL REFERENCES users(user_id),
  note          TEXT CHECK (length(note) <= 300),
  status        SMALLINT NOT NULL DEFAULT 0,   -- 0 sent 1 viewed 2 accepted 3 declined
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intro_distinct CHECK (subject_id <> target_id AND introducer_id <> subject_id)
);
CREATE INDEX idx_intro_target ON introductions (target_id, created_at DESC);
COMMENT ON TABLE introductions IS
  'Đồ thị xã hội thứ 2. Tỉ lệ status=2 (accepted) là tín hiệu chất lượng rất mạnh cho recsys.';

-- ------------------------------- gợi ý cặp đôi hằng ngày (Gale-Shapley batch)
CREATE TABLE daily_pair_suggestion (
  suggestion_id BIGINT PRIMARY KEY,
  batch_date    DATE   NOT NULL,
  user_a        BIGINT NOT NULL REFERENCES users(user_id),
  user_b        BIGINT NOT NULL REFERENCES users(user_id),
  score         REAL   NOT NULL,
  reason        JSONB  NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  CONSTRAINT pair_canonical CHECK (user_a < user_b),      -- biểu diễn CHUẨN
  UNIQUE (batch_date, user_a, user_b)
);
CREATE INDEX idx_pair_a ON daily_pair_suggestion (user_a, batch_date DESC);
CREATE INDEX idx_pair_b ON daily_pair_suggestion (user_b, batch_date DESC);

-- ------------------------------------------------------- match (bản đối soát)
-- Nguồn sự thật của match là ScyllaDB (append-only). Bảng này là bản chiếu
-- dùng cho truy vấn quan hệ và cho job đối soát mỗi 15 phút.
CREATE TABLE matches (
  pair_key    TEXT PRIMARY KEY,                 -- "min:max", KHỚP với Valkey/Kafka
  user_a      BIGINT NOT NULL,
  user_b      BIGINT NOT NULL,
  matched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  unmatched_at TIMESTAMPTZ,
  unmatched_by BIGINT,
  CONSTRAINT match_canonical CHECK (user_a < user_b)
);
CREATE INDEX idx_matches_a ON matches (user_a, matched_at DESC) WHERE unmatched_at IS NULL;
CREATE INDEX idx_matches_b ON matches (user_b, matched_at DESC) WHERE unmatched_at IS NULL;

-- ------------------------------------------------------- báo cáo & chặn (bắt buộc)
CREATE TABLE blocks (
  blocker_id BIGINT NOT NULL REFERENCES users(user_id),
  blocked_id BIGINT NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT block_distinct CHECK (blocker_id <> blocked_id)
);

CREATE TABLE reports (
  report_id        BIGINT PRIMARY KEY,
  reporter_id      BIGINT NOT NULL REFERENCES users(user_id),
  reported_user_id BIGINT NOT NULL REFERENCES users(user_id),
  reason           SMALLINT NOT NULL,   -- 1 spam 2 quấy rối 3 giả mạo 4 nội dung xấu 5 khác
  detail           TEXT,
  status           SMALLINT NOT NULL DEFAULT 0, -- 0 mới 1 đang xử lý 2 đã xử lý 3 bác bỏ
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);
-- Một người kiểm duyệt ⇒ FIFO là SAI: 200 báo cáo spam sẽ chôn vùi 1 báo cáo
-- quấy rối. Index theo (reason, created_at) để rút riêng từng nhóm nghiêm trọng
-- (2 quấy rối, 4 nội dung xấu) trước, spam gom lại xử lý theo lô sau.
-- Thứ tự ưu tiên nằm ở TRUY VẤN, không nằm ở index — đừng ORDER BY reason ASC,
-- vì reason=1 là spam.
CREATE INDEX idx_reports_queue ON reports (reason, created_at) WHERE status = 0;
CREATE INDEX idx_reports_target ON reports (reported_user_id, created_at DESC);

-- ------------------------------------------------------------ nhật ký đồng ý
-- NĐ13/2023: vị trí VÀ xu hướng tính dục là dữ liệu nhạy cảm ⇒ mỗi thứ cần sự
-- đồng ý RIÊNG BIỆT, có thể chứng minh được, và rút lại được. Gộp chung vào một
-- ô tích "Tôi đồng ý với điều khoản" là KHÔNG hợp lệ.
CREATE TABLE consents (
  consent_id  BIGINT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  purpose     TEXT   NOT NULL,   -- 'location', 'orientation', 'photo_processing', 'marketing', ...
  granted     BOOLEAN NOT NULL,
  policy_version TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_consents_user ON consents (user_id, purpose, created_at DESC);
