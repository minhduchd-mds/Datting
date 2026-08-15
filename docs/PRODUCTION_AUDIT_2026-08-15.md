# Datting — Production Audit · 15/08/2026

## 1. Kết luận điều hành

Datting V2/V2.1 đã vượt giai đoạn “UI scaffold” ở phía mobile: luồng chính, visual system, optimistic interaction, realtime nudge, safety actions, profile prompts, Likes You, AI conversation starter và Date Plan đã được tổ chức thành một product journey tương đối rõ.

Tuy nhiên phải tách hai khái niệm:

- **Production-target client:** đã có thể build với `EXPO_PUBLIC_APP_MODE=production`, API/WS thật và fail-fast khi thiếu cấu hình. Không còn được phép âm thầm rơi sang dữ liệu demo trong build production.
- **Production-complete platform:** **chưa đạt** vì backend hiện mới triển khai thật phần matching/deck + WS foundation; OTP, profile service, messages, notifications, Likes You, moderation handlers và một số social endpoints vẫn cần service source-of-truth thật.

### Scorecard hiện tại

| Hạng mục | Điểm | Nhận xét |
|---|---:|---|
| Product flow / IA | 8.1/10 | Luồng đã rõ hơn nhiều, còn vài CTA chưa hoạt động thật |
| Visual UI | 8.2/10 | Warm Midnight coherent, cần icon/font system hoàn chỉnh |
| Dating UX | 8.0/10 | Profile-first + prompt-like + opener tốt; Date Plan còn local-first |
| Accessibility | 7.7/10 | Có labels, reduced motion, haptics; text nhỏ và touch target cần chuẩn hoá |
| Mobile frontend | 8.3/10 | RN/Expo hiện đại, strict TS, optimistic/offline/realtime tốt |
| Core architecture | 8.7/10 | pairKey, mutual-like, ranking, geoshard, test invariants rất tốt |
| Backend production completeness | 5.8/10 | Ranh giới đúng nhưng còn thiếu nhiều service/handler thật |
| Moderation console | 7.5/10 | Workflow tốt, backend moderation chưa production |
| Typography / font system | 6.8/10 | System font ổn định nhưng chưa thành design system typography thật |
| Tổng thể production readiness | **7.1/10** | Có nền rất tốt; P0 nằm ở backend source-of-truth + hardening |

---

## 2. UI/UX audit

### 2.1 Information Architecture

V2 chuyển navigation chính sang:

- Khám phá
- Kết nối
- Hồ sơ

Thông báo được hạ khỏi primary navigation thành event stream phụ. Đây là quyết định đúng: Notification không phải một “job to be done” cấp 1 như khám phá, kết nối hay quản lý bản thân.

**Điểm tốt**

- Vòng đời người dùng rõ: discover → understand → connect → converse → date → manage self.
- Kết nối đã tách `Likes You`, `Match mới`, `Tin nhắn` thành các lớp ý nghĩa khác nhau.
- Hồ sơ cá nhân trở thành destination cấp 1 thay vì một settings screen bị giấu.

**Vấn đề cần sửa**

1. Comment trong `_layout.tsx` vẫn nói “Bốn tab” nhưng thực tế chỉ có 3 tab. Đây là documentation drift nhỏ nhưng nên sửa vì file navigation là nguồn sự thật UX.
2. Glyph tab hiện dùng `◇`, `♥`, `●` thay icon set chuẩn. Visual nhẹ nhưng semantic chưa đủ rõ và khác nhau giữa font/platform.
3. Notification entry đang lặp ở Discover và Profile nhưng chưa có badge/unread count ở icon.

**Đề xuất**

- Giữ 3 tab hiện tại.
- Chuẩn hoá icon bằng Lucide/Expo Symbols hoặc icon set có native rendering.
- Badge notification chỉ hiển thị khi có unread; không thêm tab thứ 4.

### 2.2 Discover

Discover V2.1 đã đúng hướng image-first, không ép user quyết định trước khi hiểu hồ sơ.

**Điểm tốt**

- Header có mode “Dành cho bạn”.
- Card lớn, compatibility badge, topic chips, explicit Pass/Like ngoài gesture.
- “Xem hồ sơ đầy đủ” tạo progressive disclosure tốt.
- Swipe vẫn optimistic và giữ offline queue.
- Khi match, CTA `Nhắn lời chào` và `Xem hồ sơ` đã đúng semantic.

**Vấn đề**

1. Nút **Bộ lọc hiện `onPress={() => {}}`** — dead action P0 UX. Không nên để affordance bấm được mà không có hành vi.
2. “Dành cho bạn ⌄” trông như dropdown nhưng chưa có mode chooser.
3. Compatibility % hiện là một số khá mạnh về mặt thuyết phục. Cần tooltip/“Vì sao gợi ý” rõ để tránh cảm giác AI phán quyết tuyệt đối.
4. Full profile data được truyền qua route params bằng JSON (`topics`, `prompts`, `commonPoints`). UX vẫn chạy nhưng deep-link/state restoration sẽ kém bền.

**Đề xuất V2.2**

- Filter sheet thật: tuổi, khoảng cách, intent; sensitive filters phải theo consent.
- Mode chooser: `Dành cho bạn · Gần bạn · Best Match hôm nay`.
- Full profile chỉ truyền `userId`; screen fetch/hydrate qua profile repository/cache.
- Compatibility: hiển thị 2–3 reason chips trước số %, số % trở thành supporting signal.

### 2.3 Candidate Profile

Đây là một trong những phần tốt nhất của V2.1.

**Điểm tốt**

- User có thể like **ảnh / prompt / toàn profile**.
- Prompt tạo “conversation object” rõ hơn swipe mù.
- Common points giải thích recommendation.
- Like context được truyền sang conversation starter thay vì để AI tự bịa.

**Cần cải thiện**

- Chỉ có một hero photo trên detail; nên có full gallery 3–6 ảnh với moderation status đã được server lọc.
- Like prompt/ảnh cần trạng thái network pending/failure riêng. Hiện local context được ghi trước request; khi swipe queue offline cần UX nói “đã lưu, sẽ gửi khi có mạng”.
- Menu `…` trên profile hiện chưa mở safety/report action.

### 2.4 Connections / Likes You

Phân loại `Likes You → Match mới → Tin nhắn` là hợp lý hơn một list messenger phẳng.

**Điểm tốt**

- Match mới có treatment hình ảnh và CTA “Nói lời chào”.
- Thread list tối ưu unread/recency.
- Likes You nói rõ người kia thích ảnh/prompt/profile nào.

**Cần cải thiện**

- Heading “Những người đã chọn bạn” hơi rộng: thread cũ không còn là “người vừa chọn bạn”. Nên đổi thành `Kết nối của bạn`.
- Likes You entry cần count thật hoặc ẩn count hoàn toàn; tránh fake urgency.
- Nếu sản phẩm có free/premium sau này, blur/paywall Likes You phải được thiết kế từ product rule, không patch sau.

### 2.5 Chat / AI conversation starter

Chat V2.1 có triết lý đúng: AI hỗ trợ nhưng không chiếm quyền nói của user.

**Điểm tốt**

- AI suggestion chỉ copy vào composer, **không auto-send**.
- Optimistic send, retry từng message.
- Report/block/unmatch vẫn trong tầm với.
- Date Plan nằm trong header, tạo bridge từ online → offline.

**Vấn đề**

1. Header chưa có back button hiển thị rõ; iOS gesture/system back là chưa đủ cho mọi user/platform.
2. `Hẹn` và `…` dùng touch target 38px, thấp hơn target lý tưởng ~44px.
3. AI card có text 10–12px khá nhỏ.
4. Starter carousel ngang bên trên chat làm viewport message bị thu hẹp trên màn thấp; nên collapse sau khi user chọn một suggestion hoặc khi keyboard mở.

### 2.6 Date Plan

Ý tưởng tốt nhưng hiện là **local-first draft**, chưa phải shared plan.

**Nên phát triển thành**

1. User tạo proposal.
2. Đối phương accept / suggest another time.
3. Shared Date Card trong conversation.
4. Optional safety check-in.
5. Post-date feedback.

Không lưu địa chỉ nhà; mặc định public place và chỉ khu vực là đúng.

### 2.7 Profile Hub

**Điểm tốt**

- Profile quality score tạo feedback loop.
- Prompt, intent, photo, verification đều thành tín hiệu hành động.
- Information hierarchy tốt hơn settings list truyền thống.

**Vấn đề**

- Điểm completeness hiện được tính client bằng heuristic. Production nên server-computed/versioned để A/B test và thống nhất mọi client.
- Các menu `Quyền riêng tư`, `An toàn`, `Tài khoản` hiện là View chứ chưa phải interactive route thực.
- Profile data vẫn local cache cho nhiều field; chưa phải source-of-truth server.

---

## 3. Visual / Design System audit

### 3.1 Warm Midnight

Current palette:

- Background `#0B0B0D`
- Surface `#151518`
- Primary rose `#F06274`
- Coral `#FF8A72`
- Lavender `#B9A7FF`
- Success `#59D8A3`

**Điểm mạnh**

- Không giống “GitHub dark + pink button” như scaffold đầu.
- Rose/coral tạo emotional warmth phù hợp dating.
- Surface hierarchy đủ rõ mà không thành dashboard enterprise.
- Radius 16–30 hợp image-first mobile.

**Điểm yếu**

- `theme.type` mới chỉ chứa font-size, chưa chứa font family / weight / line-height / letter-spacing semantic.
- Nhiều screen vẫn hardcode `fontSize`, `fontWeight`, `lineHeight` thay vì dùng token.
- Một số overlay/border rose được hardcode `rgba(...)` thay vì semantic token.
- Glyph Unicode phụ thuộc system font nên hình icon thay đổi theo thiết bị.

### 3.2 Component system

`PressableScale`, Skeleton, Toast, ListEnter, motion config, haptic gate là nền component khá tốt.

Cần nâng thành 3 lớp:

```text
Design tokens
  color / typography / spacing / radius / elevation / motion

Primitives
  Button / IconButton / Text / Avatar / Surface / Chip / Badge / Input

Patterns
  ProfileCard / PromptCard / MatchCard / ConversationHeader / SafetySheet
```

Hiện nhiều screen tự tạo style cho button/card/text, làm consistency phụ thuộc discipline của từng file.

---

## 4. Typography / Fonts

### 4.1 Trạng thái hiện tại

Mobile hiện **không có custom font package** như `expo-font` và không khai báo `fontFamily`. Vì vậy:

- iOS dùng system font (San Francisco family theo hệ điều hành).
- Android dùng system sans-serif/Roboto family theo hệ điều hành.

Đây không phải lỗi. Nó cho:

- render nhanh;
- hỗ trợ tiếng Việt tốt;
- native feeling;
- tránh FOUT/font-loading.

Nhưng hiện chưa có một **typography system** hoàn chỉnh.

### 4.2 Vấn đề typography

1. `fontWeight: "900"` xuất hiện rất nhiều. Android không phải thiết bị nào cũng map 800/900 giống iOS.
2. Caption 9–10px xuất hiện ở chat/status/eyebrow — quá nhỏ cho accessibility và màn hình mật độ thấp.
3. Heading/body scale chưa hoàn toàn đi qua `theme.type`.
4. Letter-spacing uppercase khá mạnh ở nhiều eyebrow; nếu lạm dụng sẽ tạo cảm giác dashboard hơn dating lifestyle.

### 4.3 Khuyến nghị

**Option A — Native-first (khuyến nghị hiện tại)**

Giữ system font, nhưng tạo semantic typography tokens:

```ts
typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "800" },
  h1:      { fontSize: 26, lineHeight: 32, fontWeight: "800" },
  h2:      { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  title:   { fontSize: 17, lineHeight: 22, fontWeight: "700" },
  body:    { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  meta:    { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
};
```

Không xuống dưới 11–12px cho text cần đọc.

**Option B — Brand consistency**

Nếu muốn Android/iOS nhìn đồng nhất hơn, dùng **Inter Variable** hoặc **Plus Jakarta Sans** có Vietnamese glyph đầy đủ. Không dùng SF Pro làm font bundle cross-platform; SF Pro nên chỉ để system render trên Apple.

---

## 5. Frontend audit

### 5.1 Nền tảng

- Expo SDK 57
- React Native 0.86
- React 19.2
- New Architecture enabled
- Expo Router typed routes
- React Compiler experiment
- Reanimated 4
- Gesture Handler
- MMKV
- strict TypeScript + `noUncheckedIndexedAccess`

Đây là stack mới và phù hợp cho app tương tác nhiều.

### 5.2 Điểm mạnh

**Gesture/motion**

Swipe chạy trên UI thread, prefetch, spring/fling token riêng và reduced-motion handling.

**Optimistic UX**

Swipe queue và message send đều optimistic; lỗi message ở lại đúng bubble để retry.

**Offline behavior**

Pending swipe ghi MMKV thay vì RAM, giữ được sau restart.

**Realtime**

WS gateway chỉ phát nudge và client refetch state thay vì đẩy toàn payload qua socket — giảm coupling và stale payload.

**Type discipline**

API contracts, pairKey, common points, prompts có type rõ; `noUncheckedIndexedAccess` là lựa chọn tốt cho code production.

### 5.3 Frontend debt

1. `src/api.ts` đang gom contract + HTTP adapter + DemoApi + fixtures + fallback copy vào một file lớn. Nên tách:

```text
api/contracts.ts
api/httpClient.ts
api/mobileApi.ts
api/demoApi.ts        # internal QA only
api/mappers.ts
```

2. Route params chứa JSON object lớn. Chỉ truyền ID và fetch/cache entity ở destination.
3. Không có query/cache layer chuẩn. Hiện nhiều màn tự quản `loading/failed/revision`. Có thể dùng TanStack Query hoặc một repository cache nhẹ.
4. HTTP client chưa có centralized token refresh / 401 handling / request timeout / AbortController.
5. RN `Image` còn được dùng nhiều nơi dù đã có `expo-image`; nên thống nhất caching, contentFit, transition, blurhash.
6. Error state đang khá generic; cần phân biệt offline / timeout / unauthorized / server maintenance.
7. Chưa có component/E2E coverage cho critical flow. Nên thêm Maestro: onboarding → discover → match → message → block/report.
8. Dead actions phải bị CI/UX checklist bắt: filter, profile menu, settings rows.

---

## 6. Dev / Architecture audit

### 6.1 Core matching — rất tốt

Các invariant đáng giữ nguyên:

- canonical `pairKey`;
- mutual-like nguyên tử;
- one-round-trip Redis/Valkey design;
- P(Match) hai chiều;
- diversity/exposure caps;
- Bloom filter seen;
- Gale–Shapley batch;
- geoshard water-filling;
- WebSocket nudge.

Các phần này có test bảo vệ logic chứ không chỉ test “function trả về”.

### 6.2 Production gap lớn nhất

`match-service` hiện vẫn dùng `InMemoryRedis`, `InMemoryCandidateSource` và demo deps khi chạy scaffold. Database/infra container đã mô tả Valkey, Scylla, Qdrant, OpenSearch, nhưng wiring runtime production chưa hoàn chỉnh.

Mobile production contract còn yêu cầu các endpoint/service:

- OTP request / verify;
- profile hydrate + `/profiles/me`;
- matches list;
- messages;
- notifications;
- Likes You;
- reports / block / unmatch;
- consent persistence;
- moderation queues/decisions;
- AI conversation starters.

Vì vậy **không được gọi toàn platform là production-complete chỉ vì APK build production thành công**.

### 6.3 Database

Migration 0001 có nền tốt cho users/profile/preferences/photos/matches/block/report/consent.

Cần migration kế tiếp cho:

- profile prompts;
- interaction target metadata (photo/prompt likes);
- message metadata/read cursor nếu Postgres giữ projection;
- notifications projection;
- moderation audit log;
- date-plan proposal nếu feature trở thành shared state;
- account/session/device records;
- OTP challenge/rate-limit audit hoặc storage tương đương.

**Một điểm cần review kỹ:** `profiles.s2_cell_l8` và `s2_cell_l12` đang NOT NULL trong khi location consent có thể bị từ chối/rút lại. Schema phải cho phép user tồn tại hợp pháp mà không ép lưu geolocation-derived key.

### 6.4 Security / privacy

Điểm tốt:

- consent tách theo purpose;
- client copy không được coi là legal source-of-truth;
- block/report nằm trong product flow;
- exact location không hiển thị.

P0 production:

- token session hiện lưu trong MMKV thường. Cần đánh giá Keychain/Keystore hoặc encrypted storage cho refresh/access token.
- centralized auth expiration / device revocation.
- OTP rate limiting + abuse prevention.
- backend authorization tuyệt đối không tin `from userId` do client gửi trong `/v1/swipe`; user identity phải lấy từ authenticated principal ở gateway.
- signed CDN/photo URLs và moderation gate server-side.
- audit log immutable cho moderation/admin actions.

---

## 7. Moderation console

Workflow keyboard-first, deferred commit + undo, priority queue theo severity là thiết kế phù hợp một moderator có throughput cao.

Nhưng current API adapter vẫn có DemoModerationApi khi thiếu `VITE_API_BASE`; production deployment phải cấu hình backend moderation thật và nên áp dụng cùng nguyên tắc fail-fast như mobile.

P0:

- auth moderator bằng HttpOnly cookie/session;
- RBAC dù hiện chỉ một moderator;
- signed image access;
- audit trail cho every decision;
- reason + evidence snapshot;
- appeal/re-review path.

---

## 8. Roadmap ưu tiên

### P0 — để gọi là production platform

1. Auth/OTP service thật + session security.
2. Profile service + photo upload/moderation source-of-truth.
3. Social service: matches/messages/notifications/likes-you.
4. Wire match-service sang Valkey + candidate retrieval thật; bỏ demo deps khỏi production entrypoint.
5. Moderation handlers + admin authentication + audit log.
6. Production observability: structured logs, metrics, tracing, crash reporting.
7. End-to-end test production contract.

### P1 — product quality

1. Filter / recommendation mode thật.
2. Full photo gallery.
3. Profile/settings routes thật.
4. Shared Date Plan + accept/counter-propose.
5. Notification deep-link chuẩn.
6. Typography/icon system.
7. Network error taxonomy + offline banner.

### P2 — growth / intelligence

1. Best Match Daily.
2. AI Profile Coach.
3. Vibe Search.
4. Post-date feedback loop.
5. Experiment platform / feature flags.

---

## 9. Quyết định merge

Có thể merge V2/V2.1 vào `main` với định nghĩa:

> `main` là **production-target product code**, không phải demo branch.

Nhưng trạng thái phải được ghi rõ:

> Client production target đã sẵn sàng để tích hợp; platform backend vẫn còn các P0 service trước khi public launch.

Không được dùng build demo để phát hành. Demo chỉ tồn tại như internal QA profile và phải được bật explicit bằng `EXPO_PUBLIC_APP_MODE=demo`.
