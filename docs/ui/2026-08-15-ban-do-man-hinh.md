# Bản đồ màn hình — 15/08/2026

Bản HTML có sơ đồ luồng: xem artifact "Datting Screen Map".
Tài liệu này là bản trong repo để không phụ thuộc dịch vụ ngoài.

## Thống kê

| | Số lượng |
|---|---|
| Màn đang có | **10** |
| Màn còn thiếu | **11** |
| Endpoint khai / có server | **14 / 3** |
| Màn thiếu thuộc nhóm "vi phạm" | **4** |

Hoàn thành theo màn: 10/21 ≈ 48%. Nhưng con số đó lạc quan hơn thực tế — trong
10 màn đang có, chỉ **2** (Khám phá, Hồ sơ người khác) chạy được với backend
thật; tám màn còn lại chỉ sống trong `DemoApi`.

## 10 màn đang có

| Màn | Route | Backend | Chạy thật? |
|---|---|---|---|
| Điểm vào | `index.tsx` | — | Có |
| Cổng tuổi | `(auth)/age-gate` | cục bộ | Có |
| Đăng nhập SĐT | `(auth)/sign-in` | `otp/request` `verify` | Demo |
| Onboarding 4 bước | `(onboarding)/profile` | `profiles/me` | Ảnh thật, không lưu |
| Tiêu chí kết nối | `(onboarding)/preferences` | `me/consents` | Demo |
| Xác minh ảnh | `(onboarding)/verify` | `verify/challenge` | Camera thật, chưa so khớp |
| **Khám phá** | `(tabs)/discover` | `deck` `swipe` `undo` | **Có** |
| Kết đôi | `(tabs)/matches` | `matches` | Demo |
| Thông báo | `(tabs)/notifications` | `notifications` | Demo |
| Hội thoại | `chat/[matchId]` | `messages` `report` `block` | Demo |
| **Hồ sơ người khác** | `profile/[userId]` | `profiles` | **Có** |

## 11 màn còn thiếu

### Nhóm 1 — thiếu là VI PHẠM (4 màn)

Không phải tính năng. Thiếu chúng thì app không hợp pháp ở VN và không qua nổi
App Store, bất kể giao diện thế nào.

| # | Màn | Vì sao bắt buộc | Hàm đã có sẵn |
|---|---|---|---|
| 1 | Cài đặt | Không có cửa vào bất cứ thứ gì bên dưới | — |
| 2 | Quản lý đồng ý | NĐ13/2023: rút lại phải DỄ NGANG lúc đồng ý. Hiện **không có cách nào rút** | `session.setConsent(p, false)` |
| 3 | Xoá tài khoản | App Store 5.1.1(v) bắt buộc | `session.wipe()` |
| 4 | Danh sách đã chặn | Chặn được nhưng **không gỡ được** | `api.block()` |

Ba trong bốn màn đã có sẵn hàm xử lý — chỉ thiếu giao diện gọi chúng.

### Nhóm 2 — luồng gãy giữa chừng (4 màn)

| # | Màn | Tình trạng |
|---|---|---|
| 5 | Sửa hồ sơ | Chỉ sửa được lúc onboarding; sau đó vĩnh viễn không |
| 6 | Quản lý ảnh | Không thêm/xoá/sắp xếp lại ảnh sau onboarding |
| 7 | Bộ lọc deck | `preferences` có trong DB nhưng không màn nào sửa |
| 8 | Hồ sơ của tôi | Không xem được mình như người khác thấy |

### Nhóm 3 — nên có (3 màn)

| # | Màn | Ghi chú |
|---|---|---|
| 9 | Màn "Đã kết đôi" | Hiện là overlay `MatchCelebration`, không phải route ⇒ không deep-link được |
| 10 | Trung tâm an toàn | App Store soi rất kỹ với dating app |
| 11 | Chi tiết thông báo | Mở đúng ngữ cảnh thay vì luôn nhảy về tab Kết đôi |

## Backend: 11/14 endpoint chưa tồn tại

Có: `GET /v1/deck` · `POST /v1/swipe` · `POST /v1/swipe/undo`

Chưa: OTP request + verify · `/v1/profiles` · `/v1/matches` · messages ·
notifications + read · reports · block · unmatch · consents

**Báo cáo và chặn không có server** là mục đáng lo nhất: đó là hai đường an toàn
mà App Store kiểm bằng tay khi duyệt dating app. Nút bấm được, dữ liệu không đi
đâu cả.
