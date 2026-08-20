/**
 * @datting/ui-web — token và primitive dùng chung cho HAI app web.
 *
 * Ranh giới với `@datting/core`: core KHÔNG được import react (nhờ vậy nó chạy
 * bằng `node --test` và dùng lại được ở backend). Package này thì được — nó chỉ
 * phục vụ web. Đừng chuyển thứ gì có react vào core.
 */
export * from "./tokens.js";
export * from "./css.js";
export * from "./useHotkeys.js";
