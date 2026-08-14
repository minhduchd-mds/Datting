# Datting — Platform Scaffold

Ứng dụng hẹn hò **công khai**. Bộ khung mã nguồn đi kèm tài liệu *"Kiến trúc và Lộ trình"*.

Đây **không phải** một app hoàn chỉnh. Đây là phần **khó nhất và dễ làm sai nhất** của
một nền tảng hẹn hò quy mô lớn, được cài đặt thật, có test thật, để bạn không phải
phát hiện ra các lỗi này ở tháng thứ sáu:

| Cài đặt | Tại sao nó ở đây |
|---|---|
| `pairKey` — biểu diễn chuẩn của một cặp | Nền tảng của mọi thứ. Bỏ nó = phải xây hệ đối soát phức tạp gấp nhiều lần |
| Mutual-like nguyên tử (Lua, 1 round-trip) | Race condition khi 2 người vuốt cách nhau 3ms — lỗi kinh điển làm mất match |
| Geosharding water-filling + ngưỡng thích nghi | Không có nó, mọi truy vấn quét toàn bộ user |
| P(Match) = P(A→B) × P(B→A) | Match là đồng thuận **hai chiều**. Tối ưu "lượt thích" ≠ tối ưu "match" |
| Đa dạng hoá + trần hiển thị + hạn ngạch user mới | Chống vòng lặp phản hồi khuếch đại bất bình đẳng |
| Gale–Shapley + kiểm tra tính ổn định | Job batch sinh gợi ý cặp đôi (màn PairCard trong Figma) |
| Bloom filter "đã swipe" | Không bao giờ hiện lại người đã bỏ qua |
| WS gateway theo mô hình "nudge" + graceful drain | Pod WebSocket là **stateful**; kill đột ngột = bão reconnect |
| Hệ thống hiệu ứng (motion tokens, spring, haptic gate) | Animation sai không crash — nó chỉ khiến app cảm thấy rẻ tiền, nên nó trôi đi mà không ai phát hiện |
| 9 màn hình bổ sung lấp 11 lỗ hổng thiết kế | Thiếu cổng tuổi / báo cáo / chặn = **bị App Store từ chối** |

---

## Bối cảnh sản phẩm (quyết định rồi, đừng suy diễn lại)

| Câu hỏi | Trả lời | Hệ quả kỹ thuật |
|---|---|---|
| Sản phẩm gì? | App hẹn hò **công khai**, người lạ gặp người lạ | Không SSO, không đồ thị xã hội có sẵn, cold-start là bài toán thật |
| Danh tính? | **SĐT + OTP**, không có đường nào khác | Chưa cần "Sign in with Apple". Thêm login MXH ⇒ Apple bắt buộc có ngay (mục 4.8) |
| Ai kiểm duyệt? | **Một người** | Xem bên dưới — đây là ràng buộc thiết kế, không phải chi tiết vận hành |
| Quy mô thật? | **Chưa chốt** | Code geoshard đã có sẵn và có test; `CandidateSource` là interface nên khởi động bằng một truy vấn PostGIS cũng được |

**Vì sao "một người kiểm duyệt" là chuyện của kiến trúc, không phải của nhân sự.**
Duyệt ảnh hồ sơ là **CHẶN** — ảnh chưa duyệt không được hiển thị công khai. Một
người, ~10 giây/ảnh, 6 ảnh/hồ sơ ⇒ trần cứng ~60 hồ sơ/giờ. Đó là **trần đăng ký
của toàn bộ sản phẩm**, không phải trần của phòng kiểm duyệt. Hai lối thoát duy nhất:

1. **ML lọc trước, người chỉ xử lý dải giữa.** Tự động duyệt khi điểm an toàn
   > 0.98, tự động chặn khi < 0.02, người xem phần còn lại (thường 5–10%). Trần
   nhảy lên ~600–1200 hồ sơ/giờ với cùng một người.
2. **CSAM không bao giờ vào hàng đợi người.** PhotoDNA / Thorn Safer chặn và báo
   cáo tự động. Không ai phải nhìn thứ đó bằng mắt — đây là vấn đề đạo đức trước
   khi là vấn đề thông lượng.

Tin nhắn quét **BẤT ĐỒNG BỘ** (không chặn gửi). Báo cáo xử lý theo **mức nghiêm
trọng**, không theo FIFO — 200 báo cáo spam không được phép chôn vùi 1 báo cáo
quấy rối. Xem `db/migrations/0001_init.sql`, bảng `photos` và `reports`.

---

## Chạy thử trong 60 giây

```bash
# 1. Test toàn bộ (không cần Docker, không cần mạng)
make test
#    → ws-gateway (Go):  6 test (có -race)
#    → @datting/core:       27 test (hiệu ứng + cổng tuổi)
#    → match-service:   34 test (matching + geoshard)

# 2. Chạy match-service với dữ liệu mẫu 500 user
cd services/match-service && npm run dev

# 3. Lấy deck — chú ý breakdown 3 chỉ số đúng như màn "It's a Match" trong Figma
curl 'http://localhost:8080/v1/deck?uid=1&limit=3'

# 4. Chứng minh mutual-like hoạt động
curl -XPOST localhost:8080/v1/swipe -d '{"from":"1","to":"2","action":"like"}'
#    → {"matched":false,"pair_key":"1:2"}
curl -XPOST localhost:8080/v1/swipe -d '{"from":"2","to":"1","action":"like"}'
#    → {"matched":true,"pair_key":"1:2"}   + log [nudge] match → 2,1
```

Hạ tầng đầy đủ (PostgreSQL 18 + PostGIS, Valkey 9, ScyllaDB 2026.1, Redpanda,
Qdrant 1.19, OpenSearch):

```bash
make up && make migrate
```

---

## Cấu trúc

```
datting-platform/
├── services/
│   ├── ws-gateway/              Go 1.26 · WebSocket "nudge" gateway
│   │   ├── hub.go               ghép kênh subscription, graceful drain, slow-consumer
│   │   ├── main.go              /ws  /push  /healthz  /stats
│   │   ├── hub_test.go          6 test — bao gồm test chứng minh hub KHÔNG BAO GIỜ block
│   │   └── internal/ws/ws.go    RFC 6455 tối thiểu, chỉ dùng stdlib
│   │
│   └── match-service/           Node 24 · TypeScript strict · 0 dependency runtime
│       ├── src/pairKey.ts       biểu diễn chuẩn của cặp
│       ├── src/mutualLike.ts    script Lua nguyên tử + InMemoryRedis cho test
│       ├── src/geo.ts           cellId (S2-like), water-filling, findHotCells
│       ├── src/ranking.ts       P(Match), lời giải thích, đa dạng hoá
│       ├── src/galeShapley.ts   deferred acceptance + kiểm tra tính ổn định
│       ├── src/seen.ts          Bloom filter "đã swipe"
│       ├── src/deck.ts          pipeline 3 tầng: truy hồi → xếp hạng → đa dạng
│       └── test/                34 test
│
├── packages/core/               logic THUẦN TUÝ dùng chung — không import react-native
│   ├── src/motion.ts            motion tokens · spring · stagger · fling · haptic gate
│   ├── src/birthDate.ts         kiểm tra tuổi (logic PHÁP LÝ, tách khỏi UI)
│   └── test/core.test.ts        27 test
│
├── apps/mobile/                 Expo SDK 57 · RN 0.86 · Reanimated 4
│   ├── src/components/
│   │   ├── SwipeDeck.tsx        cử chỉ 100% trên UI thread, prefetch, lạc quan
│   │   ├── MatchCelebration.tsx màn "It's a Match" — 6 nhịp dàn dựng
│   │   └── Feedback.tsx         PressableScale · Skeleton · Toast · StepProgress · Shake
│   ├── src/motion/              hook đọc "Giảm chuyển động" + haptics
│   ├── src/screens/
│   │   ├── AuthScreens.tsx      ✦ cổng tuổi · đăng nhập SĐT + OTP
│   │   ├── OnboardingScreens.tsx ✦ onboarding 4 bước · xác minh ảnh
│   │   └── SocialScreens.tsx    ✦ hội thoại · báo cáo/chặn · thông báo · 4 trạng thái
│   └── src/nudgeClient.ts       backoff CÓ JITTER, resume khi foreground
│
├── db/migrations/0001_init.sql  PostgreSQL 18 + PostGIS 3.6 + pgvector 0.8.2
└── docker-compose.yml           hạ tầng dev
```

---

## Những chỗ CỐ Ý để trống (và cách lấp)

Scaffold này thay các thành phần nặng bằng interface, để nó chạy được offline.
Ranh giới đã được thiết kế sao cho việc thay thế **không đụng vào logic**:

| Đang là | Thay bằng | Ở đâu |
|---|---|---|
| `InMemoryRedis` | `ioredis` trỏ vào Valkey 9 (script Lua giữ nguyên) | `src/mutualLike.ts` — chỉ cần implement `RedisLike` |
| `InMemoryCandidateSource` | OpenSearch geoshard query + Qdrant ANN | `src/deck.ts` — implement `CandidateSource` |
| `pLike()` công thức tay | Inference two-tower qua ONNX Runtime / Triton | `src/ranking.ts` — giữ nguyên chữ ký hàm |
| `cellId()` xấp xỉ quadtree | Thư viện S2 thật (`s2-geometry`) ở level 7–8 | `src/geo.ts` — water-filling không đổi |
| `internal/ws` stdlib | `gorilla/websocket` hoặc `coder/websocket` | `ws.Conn` là interface, Hub không đổi |
| `pushNudge` console.log | HTTP POST tới `ws-gateway:8081/push` | `src/server.ts` |

**11 lỗ hổng ở mục 1.4 của tài liệu nay đã có màn hình + code** (thư mục
`apps/mobile/src/screens/`, đánh dấu ✦ ở trên).

Còn lại **chưa làm**, xếp theo mức chặn:

1. **Bảng điều khiển kiểm duyệt + lượt lọc ML.** Đây là thứ chặn nhất trong danh
   sách: chưa có nó, trần đăng ký là ~60 hồ sơ/giờ (xem "Bối cảnh sản phẩm").
   Bảng DB đã sẵn (`photos.moderation`, `reports`), phần thiếu là ML + giao diện.
2. **API phía server cho báo cáo/chặn.** Màn hình đã có, bảng DB đã có, thiếu handler.
3. Xác thực SĐT/OTP thật (hiện `onRequestOtp`/`onVerifyOtp` là interface).
4. Thanh toán/gói premium, đa ngôn ngữ.

---

## Ba điều quan trọng nhất cần biết trước khi sửa code này

**1. `pairKey` là bất khả xâm phạm.** Mọi thứ — Kafka partition, Scylla partition,
khoá Valkey, `CHECK (user_a < user_b)` trong PostgreSQL — đều dựa vào việc một cặp
chỉ có **một** biểu diễn. Đổi quy ước này là đổi toàn bộ hệ thống.

**2. Hub không bao giờ được block.** Test `TestSlowConsumerIsDroppedNotBlocking`
tồn tại để bảo vệ điều đó. Nudge là idempotent — mất một cái thì client vẫn fetch
lại ở nudge sau hoặc khi mở app. Một client chậm **không được phép** làm chậm 200.000
client khác trên cùng pod.

**3. Ngưỡng shard phải THÍCH NGHI.** Nếu dùng ngưỡng cố định `total/target`, một ô
"nóng" (Hà Nội, TP.HCM ở level 8) sẽ nuốt trọn ngân sách và bạn kết thúc với ít shard
hơn mục tiêu. `findHotCells()` phát hiện các ô cần tăng level S2 — đó là cách chữa
**duy nhất** cho ô không thể chia nhỏ.

---

## Kiểm chứng

```
$ make test
── ws-gateway (Go) ─────────────────────────────
ok  datting/ws-gateway            (6 test, chạy với -race)
── @datting/core ───────────────────────────────────
# tests 27  # pass 27  # fail 0
── match-service ───────────────────────────────
# tests 34  # pass 34  # fail 0
```

**67 test.** Chúng không kiểm tra "code chạy" mà kiểm tra các **bất biến** của
hệ thống — những thứ nếu vỡ thì sản phẩm sai chứ không phải chương trình lỗi:

- đúng 100 match từ 100 cặp swipe đồng thời, không thừa không thiếu
- Bloom filter **không bao giờ** có false negative
- Gale–Shapley không sinh ra cặp chặn (kết quả là stable matching)
- deck không bao giờ chứa người đã swipe, không bao giờ chứa chính viewer
- không quá 2 người liên tiếp cùng khu vực trong một deck
- water-filling tạo **đúng** số shard mục tiêu kể cả khi mật độ lệch
- hub WebSocket **không bao giờ** bị block bởi một client chậm
- 60 frame liên tiếp vượt ngưỡng chỉ tạo **đúng 1** lần rung
- "Giảm chuyển động" **không bao giờ** làm animation dài ra
- sinh 31/12/2008, đến 14/08/2026 là **17 tuổi** — bị chặn


---

## Hệ thống hiệu ứng

Mọi con số hiệu ứng đều nằm ở `packages/core/src/motion.ts` và **có test**.
Nếu bạn thấy một `withTiming(300)` hardcode ở đâu đó trong codebase, đó là bug —
nó sẽ trôi khỏi phần còn lại của app trong ba tháng.

**Ba quy tắc:**

1. **Cử chỉ dùng lò xo, không dùng thời gian.** Bất cứ thứ gì ngón tay đang chạm
   vào phải phản hồi bằng `withSpring` — vì lò xo mang theo vận tốc, và người
   dùng cảm nhận được vận tốc. `withTiming` cho chuyển động do ngón tay điều
   khiển luôn cho cảm giác cao su, chết.
2. **Vào nhanh, ra chậm hơn.** Phần tử xuất hiện phải nhanh (người dùng đang
   chờ); phần tử biến mất có thể chậm hơn (người dùng đã chuyển sự chú ý).
3. **Tôn trọng "Giảm chuyển động".** Không phải tuỳ chọn — với người bị rối loạn
   tiền đình, parallax/scale/xoay gây chóng mặt thật sự. `resolveMotionConfig()`
   giữ fade, bỏ transform lớn, rút ngắn thời lượng, tắt nảy của lò xo.
   Có 3 test riêng cho việc này, gồm một test bảo đảm giảm chuyển động **không
   bao giờ** làm animation dài ra.

**Bảng phân bổ haptic** (rung là để XÁC NHẬN, không phải để TRANG TRÍ):

| Rung | Khi nào |
|---|---|
| `selection` | chọn/bỏ chọn chip, đổi tab |
| `light` | thẻ vượt ngưỡng swipe — báo "thả ra là xong" |
| `success` | **có match** — khoảnh khắc duy nhất trong app xứng đáng với nó |
| `warning` | hết lượt swipe, mất mạng |
| `error` | thao tác thất bại, nhập sai OTP |

Không rung khi: cuộn, mở màn, nhận tin nhắn, hiện toast. Rung quá tay → người
dùng tắt haptics ở cấp hệ thống → mất luôn cả lần rung "có match".

**Cổng chống rung liên tiếp.** Khi thẻ dao động quanh ngưỡng, hàm cập nhật được
gọi 60–120 lần/giây. `createThresholdGate` chỉ bắn ở **cạnh lên** và phải kéo về
dưới ngưỡng mới nạp lại. Có test chứng minh: 60 frame liên tiếp ở trạng thái
"đã vượt ngưỡng" chỉ tạo **đúng 1** lần rung.

**Màn "It's a Match" — 6 nhịp dàn dựng có chủ ý:**

```
0ms     nền tối dần + haptic success        xác nhận "có chuyện xảy ra"
80ms    hai avatar bay vào từ hai bên       kể chuyện: hai người gặp nhau
340ms   trái tim + vòng % nảy lên           phần thưởng
520ms   ba thanh breakdown chạy số          LÝ DO  ← điểm khác biệt với Tinder
700ms+  "điểm chung nổi bật" hiện so le     bằng chứng cụ thể
1100ms  nút CTA trượt lên                   chỉ mời hành động SAU khi kể xong
```

Nút CTA xuất hiện **cuối cùng** là có lý do: nếu hiện ngay từ đầu, người dùng
bấm luôn và không bao giờ đọc phần giải thích — thứ tạo ra niềm tin vào thuật
toán. Con số trong thanh đo **chạy cùng thanh**; nếu số hiện sẵn ở giá trị cuối,
thanh chạy trở thành trang trí vô nghĩa và người dùng cảm nhận được sự giả tạo đó.
