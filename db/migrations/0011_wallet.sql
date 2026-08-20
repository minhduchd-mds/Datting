-- Ví xu + sổ cái + thanh toán.
--
-- Đây là bảng ghi TIỀN THẬT của người dùng. Một lỗi ở đây không phải lỗi hiển
-- thị: nó là xu biến mất khỏi tài khoản của người đã trả tiền, hoặc xu tự sinh
-- ra từ hư không. Bốn quyết định dưới đây tồn tại vì lý do đó.
--
-- 1. SỐ NGUYÊN, đơn vị nhỏ nhất. Không bao giờ dùng số thực.
--    `0.1 + 0.2 = 0.30000000000000004` trong IEEE-754. Cộng dồn qua vài nghìn
--    giao dịch là số dư lệch, và không ai dựng lại được nó lệch từ đâu. Xu là
--    số nguyên; tiền lưu bằng ĐỒNG (đơn vị nhỏ nhất của VND).
--
-- 2. Sổ cái CHỈ GHI THÊM. Sửa sai bằng một dòng mới, không bằng UPDATE.
--    Sửa một dòng cũ là xoá mất bằng chứng về thứ đã thực sự xảy ra. Khi người
--    dùng khiếu nại "tôi nạp 100k mà không thấy xu", thứ duy nhất trả lời được
--    là một lịch sử chưa bị ai sửa.
--
-- 3. Mỗi lần cộng xu phải có KHOÁ CHỐNG TRÙNG.
--    Webhook của cổng thanh toán gửi LẠI khi không nhận được 200 — đó là hành
--    vi bình thường và bắt buộc của họ, không phải sự cố. Không có khoá chống
--    trùng thì một lần trả tiền cộng xu hai, ba lần.
--
-- 4. `wallets.balance` là BẢN SAO CÓ KHOÁ, không phải nguồn sự thật.
--    Nguồn sự thật là SUM(coin_ledger.delta). Nhưng đọc-rồi-ghi trên tổng đó
--    thì hai lệnh tiêu cùng lúc đều thấy đủ tiền và cùng trừ — ra số dư âm.
--    Nên mọi thay đổi phải `SELECT ... FOR UPDATE` hàng ví trước. CHECK >= 0 ở
--    dưới là lưới cuối: nếu có đường nào lách qua, database từ chối chứ không
--    im lặng cho số âm chạy tiếp.

CREATE TABLE wallets (
  user_id    BIGINT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,

  -- Bản sao của SUM(coin_ledger.delta). Tồn tại vì HAI lý do, và cả hai đều
  -- không phải "cho nhanh": (a) hàng này là chỗ để khoá khi tiêu, (b) CHECK
  -- dưới đây biến một lỗi logic thành một lỗi database ồn ào.
  balance    BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE coin_ledger (
  entry_id   BIGINT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Dương = cộng, âm = trừ. KHÔNG tách thành hai cột `credit`/`debit`: một
  -- dòng có cả hai đều khác 0 là trạng thái vô nghĩa mà lược đồ vẫn cho phép.
  delta      BIGINT NOT NULL CHECK (delta <> 0),

  -- 1 nạp · 2 tặng quà (trừ) · 3 nhận quà (cộng) · 4 hoàn tiền · 5 điều chỉnh tay
  reason     SMALLINT NOT NULL CHECK (reason BETWEEN 1 AND 5),

  -- Trỏ tới sự kiện gây ra dòng này: payment_id, gift_event_id... Để đối soát
  -- ngược từ sổ cái ra nghiệp vụ mà không phải đoán theo thời gian.
  ref_id     BIGINT,

  /*
   * Khoá chống trùng.
   *
   * UNIQUE, và cho phép NULL: điều chỉnh tay thì không có khoá tự nhiên nào.
   * Postgres coi mọi NULL là khác nhau trong UNIQUE, nên nhiều dòng NULL sống
   * chung được — đúng thứ ta cần.
   *
   * Với nạp tiền thì đây là `<nhà cung cấp>:<mã giao dịch của họ>`. Webhook
   * gửi lại lần thứ hai đụng UNIQUE và bị từ chối, thay vì cộng xu lần nữa.
   */
  idem_key   TEXT UNIQUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lịch sử ví của một người, mới nhất trước.
CREATE INDEX idx_ledger_user ON coin_ledger (user_id, created_at DESC);

CREATE TABLE payments (
  payment_id   BIGINT PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  /*
   * Nhà cung cấp. Cột này là lý do cả bảng TRUNG LẬP được.
   *
   * Hàng số bán TRONG app iOS/Android BẮT BUỘC đi qua In-App Purchase (App
   * Store 3.1.1) và Google Play Billing — không được dùng cổng nội địa. Trên
   * WEB thì ngược lại, cổng nào cũng được và không mất 15–30%.
   *
   * Nghĩa là sản phẩm này chắc chắn có NHIỀU đường thanh toán cùng lúc. Ghi
   * chúng vào cùng một bảng với một cột phân biệt, thay vì mỗi nhà một bảng:
   * số dư của người dùng phải là MỘT con số dù họ nạp bằng đường nào.
   *
   * 'apple' · 'google' · 'vnpay' · 'momo' · 'zalopay' · 'manual'
   */
  provider     TEXT NOT NULL,

  -- Mã giao dịch phía nhà cung cấp. UNIQUE theo từng nhà: hai nhà khác nhau
  -- hoàn toàn có thể trùng chuỗi mã.
  provider_ref TEXT NOT NULL,

  -- ĐỒNG, số nguyên. Xem quyết định 1 ở đầu file.
  amount_vnd   BIGINT NOT NULL CHECK (amount_vnd > 0),
  coins        BIGINT NOT NULL CHECK (coins > 0),

  -- 0 đang chờ · 1 đã ghi có · 2 thất bại · 3 đã hoàn
  --
  -- `0` tồn tại vì khoảnh khắc giữa "người dùng bấm trả tiền" và "nhà cung cấp
  -- xác nhận" là có thật và có thể kéo dài. Không có trạng thái chờ thì đoạn
  -- đó không được ghi ở đâu, và một giao dịch treo trở thành vô hình.
  status       SMALLINT NOT NULL DEFAULT 0 CHECK (status BETWEEN 0 AND 3),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at   TIMESTAMPTZ,

  UNIQUE (provider, provider_ref)
);

CREATE INDEX idx_payments_user ON payments (user_id, created_at DESC);
-- Tìm giao dịch treo để đối soát. Partial index vì đó là số ít.
CREATE INDEX idx_payments_pending ON payments (created_at) WHERE status = 0;
