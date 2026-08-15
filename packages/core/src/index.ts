/**
 * @datting/core — logic THUẦN TUÝ dùng chung.
 *
 * Quy tắc duy nhất của package này: KHÔNG import react-native, không import
 * react, không chạm vào I/O. Nhờ vậy nó:
 *   - test được bằng `node --test` (nhanh, không cần simulator)
 *   - dùng lại được ở backend (ví dụ: validate ngày sinh phía server phải
 *     giống hệt phía client — nếu viết hai lần, chúng SẼ lệch nhau)
 *   - biên dịch được cho web nếu sau này có bản web
 */
export * from "./motion.js";
export * from "./backGate.js";
export * from "./swipe.js";
export * from "./birthDate.js";
export * from "./moderation.js";
