# Datting

Ứng dụng hẹn hò công khai (Việt Nam). Monorepo: Go + TypeScript + React Native.

## Bối cảnh sản phẩm — đã chốt, đừng suy diễn lại

- **Công khai**, người lạ gặp người lạ. **Không** có bất kỳ thành phần doanh
  nghiệp/nội bộ nào: không SSO, không đơn vị công tác, không đồ thị xã hội từ
  dữ liệu nhân sự. Nếu thấy dấu vết của những thứ đó ở đâu, đó là rác còn sót
  lại — xoá đi.
- Danh tính **chỉ** là SĐT + OTP. Không mật khẩu, không email, không login MXH.
  Thêm bất kỳ login MXH nào ⇒ Apple bắt buộc có "Sign in with Apple" ngang hàng
  (App Store 4.8).
- **Đội kiểm duyệt = 1 người.** Xem mục "Ràng buộc kiểm duyệt" bên dưới.
- Quy mô thật **chưa chốt**. Code geoshard đã có và có test, nhưng `CandidateSource`
  là interface — khởi động bằng một truy vấn PostGIS đơn giản là hợp lệ.

## Ba bất biến. Vi phạm là hỏng sản phẩm, không phải hỏng chương trình.

**1. `pairKey` chỉ có MỘT biểu diễn: `min:max`.**
Kafka partition, Scylla partition, khoá Valkey, `CHECK (user_a < user_b)` trong
PostgreSQL — tất cả dựa vào điều này. Đừng bao giờ tạo khoá cặp theo thứ tự
người gọi. Xem `services/match-service/src/pairKey.ts`.

**2. Hub WebSocket KHÔNG BAO GIỜ được block.**
Gửi vào channel của client phải là `select`/`default` — đầy thì **drop**, không
chờ. Nudge là idempotent nên mất một cái không sao; một client chậm làm chậm
200.000 client cùng pod thì rất sao. Test `TestSlowConsumerIsDroppedNotBlocking`
tồn tại để canh đúng chỗ này. Xem `services/ws-gateway/hub.go`.

**3. Ngưỡng chia shard phải THÍCH NGHI, không cố định.**
Ngưỡng cố định `total/target` sẽ để một ô nóng (Hà Nội, TP.HCM ở S2 level 8)
nuốt trọn ngân sách và cho ra ít shard hơn mục tiêu. Công thức đúng là
`(load hiện tại + load còn lại) / số shard còn lại`, tính lại ở mỗi bước.
Ô không thể chia nhỏ chỉ chữa được bằng cách **tăng level S2**, đó là việc của
`findHotCells()`. Xem `services/match-service/src/geo.ts`.

## Ràng buộc kiểm duyệt (một người)

Duyệt ảnh là **CHẶN** (ảnh chưa duyệt không hiển thị công khai) ⇒ hàng đợi này
là trần đăng ký của cả sản phẩm: ~60 hồ sơ/giờ với một người. Mọi thiết kế đụng
tới ảnh/hồ sơ phải tính đến điều đó.

- ML lọc trước; người **chỉ** xem dải điểm không chắc chắn.
- CSAM (PhotoDNA/Thorn Safer): chặn + báo cáo **tự động**, không vào hàng đợi người.
- Tin nhắn quét **bất đồng bộ**, không chặn gửi.
- Báo cáo xử lý theo **mức nghiêm trọng**, không FIFO. `reports.reason` là
  `1 spam, 2 quấy rối, 3 giả mạo, 4 nội dung xấu, 5 khác` — **đừng** `ORDER BY reason ASC`.
- Đừng viết UI hứa thời gian duyệt cụ thể ("dưới 1 phút"). Sẽ sai.

Công cụ của người đó là `apps/admin` (React + Vite, cổng 5174) — console kiểm
duyệt, không phải "trang quản trị" đa năng. Logic xếp hàng nằm ở
`packages/core/src/moderation.ts` (thuần tuý, có test) chứ không nằm trong
component: cùng một hàm sắp xếp phải dùng được cả ở backend khi cần.
Bàn phím là giao diện chính — với một người và ~60 hồ sơ/giờ, mỗi lần rời tay
khỏi phím để rê chuột là chi phí thật.

## Quyết định kỹ thuật đã chốt (đừng "sửa" lại)

- **P(Match) = P(A→B) × P(B→A)** — TÍCH, không phải tổng hay trung bình. Match là
  đồng thuận hai chiều.
- **KHÔNG dùng Elo.** Tinder bỏ từ 2019. Elo khuếch đại bất bình đẳng hiển thị.
- **`community` (quận/khu vực) chỉ là trục ĐA DẠNG HOÁ, không phải tín hiệu xếp
  hạng.** Nó cố ý không xuất hiện trong `pLike()`. Xếp hạng theo "cùng khu vực"
  tạo buồng vang và phân tầng theo quận.
- **Nudge**: WebSocket chỉ chở "có cái mới" + cursor, **không bao giờ** chở nội
  dung. Client tự fetch qua HTTP.
- **`packages/core` là logic THUẦN TUÝ**: không react, không react-native, không
  I/O. Nhờ vậy nó chạy được với `node --test` và dùng lại được ở backend. Kiểm
  tra ngày sinh là logic **pháp lý** — viết hai bản là hai bản sẽ lệch nhau.

## Pháp lý (NĐ13/2023)

Vị trí **và** xu hướng tính dục (suy ra được từ `preferences.want_genders`) đều
là dữ liệu nhạy cảm ⇒ mỗi thứ cần đồng ý **riêng biệt**, chứng minh được, rút
lại được. Một ô tích "Tôi đồng ý với điều khoản" là **không hợp lệ**. Xoá tài
khoản = xoá mềm 30 ngày rồi purge cứng. Lưu **ngày sinh**, không lưu tuổi.

## Lệnh

```bash
npm install      # LẦN ĐẦU — chạy ở ROOT, không phải trong từng package
make test        # Go (-race) + @datting/core + match-service  → 88 test
make up          # hạ tầng dev qua docker-compose
make migrate     # psql ... -f db/migrations/0001_init.sql

npm run dev -w @datting/admin        # console kiểm duyệt (Vite, cổng 5174)
cd apps/mobile && npx expo export --platform android   # kiểm tra bundle Metro
```

Cần Go ≥ 1.24 (`go.mod`) và Node ≥ 22. Đã kiểm trên Go 1.26.6 + Node 24.15.

## Bẫy môi trường đã gặp

- `services/match-service/src/deck.ts` dùng **parameter properties**
  (`constructor(private readonly x)`). Node chạy TypeScript ở chế độ *strip-only*
  **không** xử lý được cú pháp này (nó sinh code, không chỉ là kiểu). Vì vậy
  `npm test` luôn `tsc` trước rồi mới `node --test dist/...`. Đừng chạy
  `node --test` thẳng vào `src/`.
- Import trong TS dùng đuôi `.js` (chuẩn ESM). Đúng sau khi build; sai nếu chạy
  thẳng file `.ts`.
- Shell mặc định ở đây là **zsh**, không tách từ khi khai triển biến không đặt
  trong ngoặc kép. `perl -pi -e '...' $FILES` sẽ nhận cả danh sách như MỘT tên
  file. Dùng `find ... -print0 | xargs -0 ...`.
- Đây là **npm workspaces**: lock file **chỉ có MỘT, ở root**. Chạy `npm ci`
  trong `packages/core` sẽ báo "can only install with an existing
  package-lock.json" — vì npm leo lên root tìm. Cài ở root, hoặc
  `npm install -w @datting/core -w @datting/match-service` nếu chưa muốn kéo về
  toàn bộ Expo/RN.
- **Ghim phiên bản thấp hơn sàn peer ⇒ npm LỒNG bản thứ hai, không báo lỗi.**
  Đã dính hai lần ở `apps/mobile`: `react 19.2.0` (sàn `^19.2.3` của RN 0.86) và
  `react-native-screens ~4.16` (sàn `^4.26` của expo-router 57). Hai bản React ⇒
  "Invalid hook call"; hai bản của một **native module** ⇒ autolink hai lần, hỏng
  build. Sau khi đổi bất kỳ pin nào ở `apps/mobile`, soi lại lock: mỗi native
  module và `react` chỉ được xuất hiện **đúng một entry**. Trùng lặp transitive
  (semver 6/7, ws 7/8, chalk, debug) thì bình thường, kệ nó.
- **`tsc --noEmit` xanh KHÔNG chứng minh Metro bundle được.** Ba lỗi chặn build
  dưới đây đều lọt qua typecheck và chỉ nổ lúc đóng gói. Trước khi đẩy lên EAS
  (xếp hàng ~15 phút mới biết hỏng), chạy `npx expo export --platform android`
  **và** `--platform ios` ở `apps/mobile`. Đó là đúng bundler mà EAS sẽ chạy.
- **ĐỪNG bật `disableHierarchicalLookup` trong `metro.config.js`.** Tài liệu
  monorepo của Expo có gợi ý, nhưng nó giả định cây `node_modules` hoist PHẲNG.
  Cây npm ở đây không phẳng và **không thể** phẳng: `expo-asset`,
  `expo-file-system`, `expo-keep-awake`, `@expo/ui` peer-depend ngược vào `expo`
  trong khi `expo` depend vào chúng — vòng lặp peer npm chỉ giải được bằng cách
  lồng; và `expo-modules-core` khai peer `react-native-worklets` trần `^0.10.0`
  còn Reanimated 4.5.3 bắt buộc 0.11.4. `npm dedupe` **không** gỡ được, đã thử.
  Đây là metadata thượng nguồn lệch, không phải lỗi của ta ⇒ sửa ở phía Metro,
  đừng hạ phiên bản. Lý do đầy đủ nằm ngay trong `apps/mobile/metro.config.js`.
- **`packages/core` là ESM thật nên import phải có đuôi `.js`, nhưng Metro đọc
  thẳng `src/*.ts`** (để babel plugin của Reanimated còn thấy chỉ thị
  `"worklet"`) nên nó đi tìm `motion.js` — file không tồn tại. Đã bắc cầu bằng
  `resolver.resolveRequest` **chỉ trên nhánh lỗi** (`.js` giải không được mới
  thử `.ts`/`.tsx`). Đừng "sửa" bằng cách bỏ đuôi `.js` — `node --test dist/...`
  gãy ngay; cũng đừng trỏ `@datting/core` sang `dist/` — worklet tụt về JS thread
  và thẻ vuốt khựng.
- **Icon iOS không được có kênh alpha** — App Store Connect từ chối kể cả khi
  alpha = 255 ở mọi pixel. `assets/icon.png` phải là PNG color type 2 (RGB), còn
  `adaptive-icon.png`/`splash.png` thì type 6 (RGBA) mới đúng. Kiểm bằng
  `sips -g hasAlpha assets/icon.png`.
- **JVM KHÔNG đọc `HTTP_PROXY`/`HTTPS_PROXY`, cũng không đọc file PAC.** Máy dev
  đang ra Internet qua `10.10.101.100:3128` khai bằng biến môi trường + PAC của
  macOS. `curl`/`npm`/`go` đọc được nên mọi thứ *trông như* mạng bình thường;
  Gradle thì đi thẳng. Hậu quả đo được: `dl.google.com` (Google Maven — nơi chứa
  **AGP**) **timeout hẳn** khi đi thẳng, còn qua proxy trả 200 trong 0,3 s. Maven
  Central thì thông cả hai đường — nên thử nhầm host sẽ ra kết luận ngược. Phải
  khai lại thành `systemProp.http(s).proxyHost/Port` trong
  `android/gradle.properties`. Để ở đó chứ **đừng** để `~/.gradle/gradle.properties`:
  proxy này thuộc về MẠNG, không thuộc về máy — ghim toàn cục thì đổi mạng là
  mọi build Gradle chết vì cố nối một IP nội bộ không còn tồn tại. Đổi lại, file
  đó do prebuild sinh ⇒ **mất sau mỗi `prebuild --clean`**, phải thêm lại.
- **Gradle wrapper có timeout kết nối 10 s cứng, không cấu hình được.**
  `services.gradle.org` chuyển hướng 307 sang CDN GitHub; tuyến đó chậm hơn 10 s
  là wrapper chết với `SocketTimeoutException` ngay giữa chừng. Chữa bằng cách
  tự `curl -L --retry` file `gradle-<ver>-bin.zip` rồi đặt vào đúng
  `~/.gradle/wrapper/dists/gradle-<ver>-bin/<hash>/`, xoá file `.part` — wrapper
  thấy zip có sẵn thì bỏ qua bước tải. Thư mục `<hash>` do wrapper tạo sẵn ở lần
  chạy hỏng, cứ dùng lại đúng tên đó.
- **Build Android cục bộ cần JDK 17, không phải JDK của Android Studio.** Bản
  Android Studio trên máy này kèm JDK 11, mà `sdkmanager` biên dịch ở class file
  version 61.0 ⇒ `UnsupportedClassVersionError` (11 chỉ đọc tới 55.0), kèm một
  lỗi phụ khó hiểu `line 173: test: : integer expression expected`. Dùng
  `brew install openjdk@17` rồi `export JAVA_HOME=/usr/local/opt/openjdk@17`.
  openjdk@17 là keg-only — **đừng** chạy lệnh `sudo ln -s` mà brew gợi ý, không
  cần và nó sửa vào thư mục hệ thống.
- **Phiên bản SDK/NDK KHÔNG nằm trong `android/`, grep ở đó không ra** — và có
  HAI nguồn, đọc nhầm nguồn là ra số sai. `ExpoRootProjectPlugin.kt` gọi
  `versionCatalogs.getVersionOrDefault("compileSdk", "35")`: số 35 trong đó chỉ
  là **giá trị dự phòng khi không có version catalog**. React Native 0.86 CÓ
  catalog và nó thắng. Nguồn đúng là
  `node_modules/react-native/gradle/libs.versions.toml`:
  `compileSdk`/`targetSdk` = **36**, `buildTools` **36.0.0**, `minSdk` 24,
  `ndkVersion` **27.1.12297006** (2,4 GB), `agp` 8.12.0.
  Đã dính đúng bẫy này: đọc mặc định của Expo rồi cài `platforms;android-35`,
  build vẫn chạy được vì AGP lặng lẽ tự tải `android-36` giữa chừng. Không nổ,
  chỉ tải thừa — nên nếu không `aapt2 dump badging` cái APK ra kiểm thì không
  bao giờ biết mình đã đọc nhầm nguồn.
- **`userInterfaceStyle`/`backgroundColor` trong `app.json` cần `expo-system-ui`
  mới có hiệu lực trên Android.** Thiếu gói đó thì khai báo vẫn nằm im, `tsc` và
  `expo export` đều xanh, không ai báo gì — chỉ `expo prebuild` mới cảnh báo vì
  chỉ nó mới sinh mã native đi tìm module thi hành. Nền tối khai rồi mà hệ thống
  vẫn loé trắng lúc khởi động là triệu chứng.
- **APK `assembleRelease` mặc định nặng 105 MB, trong đó ~45 MB là rác đối với
  điện thoại.** `reactNativeArchitectures` trong `android/gradle.properties` liệt
  kê cả bốn ABI, nên Hermes + Reanimated + gesture-handler được biên dịch và đóng
  gói làm **bốn bản C++ song song**; máy Android cài xong chỉ giải nén đúng một
  thư mục khớp CPU. `x86`/`x86_64` chỉ máy ảo trên PC mới chạy. Phát tay thì
  build kèm `-PreactNativeArchitectures=arm64-v8a,armeabi-v7a` → 56 MB, và vì
  phần biên dịch C++ đã cache nên lần dựng thứ hai chỉ mất ~1,5 phút thay vì 30.
  Nộp Play Store thì KHÔNG cần cắt tay: `.aab` mang đủ bốn ABI rồi Google tự tách
  ra cho từng thiết bị lúc tải — bước tách đó chính là thứ APK phát tay không có.
- **Expo SDK 57 tải AAR DỰNG SẴN, không biên dịch module từ `node_modules` —
  và AAR có thể lệch phiên bản với `expo-modules-core` đang cài.** Triệu chứng:
  build XANH, `adb install` `Success`, mở lên **crash trước khi vẽ gì** với
  `NoClassDefFoundError: Lexpo/modules/kotlin/types/AnyTypeProvider;`. Nguyên
  nhân: `expo-haptics` (15.x) và `expo-image` (3.x) có **dòng phiên bản riêng**,
  chạy trước 57.0.x của SDK, nên AAR của chúng được dựng với một
  `expo-modules-core` CHƯA phát hành. Mười module Expo còn lại đều 57.0.x nên
  khớp. Cách nhận ra chắc chắn: `HapticsModule.kt` trong `node_modules` chỉ có
  **57 dòng** mà stack trace trỏ **dòng 80** ⇒ code đang chạy không phải code
  đang có. `try/catch` ở JS vô dụng: `ModuleRegistry.register()` khởi tạo mọi
  module **trước** khi bundle JS được nạp. Chữa bằng
  `expo.autolinking.android.buildFromSource` trong `apps/mobile/package.json`
  (regex khớp TOÀN PHẦN — Kotlin `Regex.matches`, không có ký tự đại diện).
  **Không cần `prebuild` lại**: `settings.gradle` gọi `expoAutolinking` ở thì
  *configure*, đọc `package.json` mới mỗi lần dựng — nhờ vậy khối proxy thêm tay
  trong `android/gradle.properties` sống sót. Đổi lại, source phải biên dịch
  thật nên lần dựng đầu chậm hơn ~1 phút.
