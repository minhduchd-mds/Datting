# Kế hoạch 4 giai đoạn — 15/08/2026

Trạng thái: **chờ xác nhận từng giai đoạn**. Hướng thiết kế đã chốt: **C**.

## Hướng thiết kế đã chốt: C

Ba lựa chọn từng đặt ra:

- A — bám iOS 27 trên cả hai nền
- B — iOS đúng chuẩn, Android theo Material (một bộ token, hai lớp trình bày)
- **C — lấy tinh thần (mờ, viền rõ, thang chữ Apple) áp chung cả hai** ← đã chốt

Lý do C hợp lúc này: chưa có bản build iOS nào, nên mọi công "đúng chuẩn iOS"
đều chưa ai kiểm chứng được. Khi có bản iOS thật thì chuyển sang B.

## iOS 27 — tra được gì (WWDC 6/2026)

iOS 27 là bản SỬA Liquid Glass của iOS 26, không phải ngôn ngữ mới.

| Thay đổi | Ảnh hưởng tới Datting |
|---|---|
| Thanh trượt cường độ Liquid Glass, tác động **mọi app** | Phải thử ở cả dải, không chỉ mặc định |
| **Viền rõ thay cho đổ bóng** | Ngược hướng với bóng đổ vừa thêm cho thẻ vuốt (`8424332`) |
| **Kính sáng hơn ở chế độ tối** ⇒ làm tối nền tab đang chọn và màu bottom-sheet | Datting nền tối, có tab bar + sheet — trúng cả hai |
| Mép cuộn: mờ cứng + viền đáy | Hồ sơ, kết đôi, thông báo |
| Tab bar có vai trò "prominent" | Tab Khám phá |
| Vuốt hành động trên mọi view cuộn | Kết đôi, thông báo |
| NN/g đo được iOS 26 trượt ngưỡng tương phản trên nền rối | Phải tôn trọng Reduce Transparency + Increase Contrast |

⚠ **Liquid Glass áp tự động cho NATIVE component.** Datting là React Native — nó
tự vẽ view, không dùng `UITabBar`/`UIVisualEffectView`. Nên app KHÔNG được
Liquid Glass miễn phí; phải mô phỏng bằng `expo-blur`.

Nguồn: techtimes.com (WWDC 2026 refinements) · designfornative.com (What
Designers Need to Know About iOS 27) · bgr.com · macrumors.com · idownloadblog.com

## Bốn giai đoạn

| # | Nội dung | Ước lượng |
|---|---|---|
| 1 | 4 màn nhóm pháp lý + tab thứ tư làm cửa vào | 6–8 giờ |
| 2 | 11 endpoint backend (OTP cần nhà cung cấp SMS) | 20–30 giờ |
| 3 | 4 màn nhóm luồng gãy | 8–10 giờ |
| 4 | Liquid Glass theo iOS 27, hướng C | 10–12 giờ |
| | **Tổng** | **44–60 giờ** |

### Giai đoạn 4 — chi tiết

1. `expo-blur` cho tab bar và bottom-sheet
2. Làm tối nền tab đang chọn + màu sheet (chỉ dẫn iOS 27 cho chế độ tối)
3. Đổi bóng đổ thành viền rõ trên thẻ vuốt
4. Mép cuộn mờ cứng + viền đáy cho 3 màn cuộn
5. Tab Khám phá dùng vai trò *prominent*
6. Vuốt-để-xoá trên danh sách kết đôi và thông báo
7. Tôn trọng `Reduce Transparency` / `Increase Contrast` — RN có
   `AccessibilityInfo.isReduceTransparencyEnabled()`; không có thì lớp mờ tự
   tắt, giống cách `useMotionConfig` làm với chuyển động
8. Đo lại toàn bộ tương phản CÓ lớp mờ, ở cả ba mức thanh trượt

## Mẫu phải bám, không phát minh lại

| Loại | Nguồn |
|---|---|
| Điều hướng | `session.ts` `STAGE_ROUTE` — mọi đường dẫn qua `nextRoute()` |
| Màu/chữ/khoảng cách | `apps/mobile/src/theme.ts` — `C` `T` `S` `R` |
| Chuyển động | `@datting/core` — không `withTiming` viết tay |
| Trạng thái lỗi | `SocialScreens.tsx` — `EmptyState` `OfflineState` `RateLimitState` `ErrorState` |
| Sheet | `ReportBlockSheet` — hành động có hiệu lực NGAY rồi mới gọi API |
| Logic thuần | `packages/core` — không react, không I/O, test `node --test` |

## Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| App chạy Android, thiết kế Apple | Cao | Đã chốt hướng C |
| 11 endpoint = một dự án backend | Cao | Giai đoạn 2 lớn hơn ba giai đoạn kia cộng lại |
| OTP cần nhà cung cấp SMS thật | Cao | Cần tài khoản + chi phí, chưa có |
| Thay đổi bố cục ở `ee94744` chưa xem trên máy | Vừa | 67 chỗ khoảng cách + 30 chỗ cỡ chữ đổi cùng lúc |
