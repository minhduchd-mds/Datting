import * as React from "react";

/**
 * Icon.
 *
 * Bộ icon trong Figma VTF-6 là Untitled UI — tên component khớp chính xác:
 * `x-close`, `heart`, `user-02`, `user-plus-02`, `comment`, `bell-slash`,
 * `filter-funnel-01`, `share-06`, `marker-pin-01`, `chevron-right`.
 *
 * Vẽ theo đúng bộ đó thay vì xuất mảnh vector từ Figma: `download_assets` trả về
 * các layer rời với viewBox lẻ (17.75×1, 93×13...) vì icon nằm trong component
 * đã gói, nên ghép lại vừa tốn vừa dễ méo. Cùng bộ icon, hình học chuẩn 24×24,
 * nét 2px — và không phụ thuộc URL tạm của Figma.
 *
 * Mọi icon dùng `currentColor` để nhận màu từ token.
 */
export type IconName =
  | "x-close"
  | "star"
  | "sparkle"
  | "heart"
  | "users"
  | "message"
  | "user"
  | "bell"
  | "filter"
  | "share"
  | "send"
  | "edit"
  | "upload"
  | "trash"
  | "chevron-right"
  | "live"
  | "coin";

const PATHS: Record<IconName, React.ReactNode> = {
  "x-close": <path d="M18 6 6 18M6 6l12 12" />,
  /* Phòng live: chấm giữa + hai cung sóng lan ra. KHÔNG dùng lại `users` —
     mục "Giới thiệu" đã mang hình đó, và hai mục điều hướng cùng một glyph thì
     người dùng phải đọc chữ mới phân biệt được, tức là icon vô dụng. */
  live: (
    <>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
      <path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9" />
      <path d="M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8" opacity="0.45" />
    </>
  ),
  /* Xu: vòng tròn có vành trong. Cố ý KHÔNG vẽ ký hiệu tiền tệ nào — đây là xu
     trong ứng dụng, không phải tiền mặt, và vẽ chữ đ hay $ lên nó là hứa một
     thứ khác. */
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" opacity="0.55" />
    </>
  ),
  star: (
    <path
      d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.4l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95L12 2.5z"
      fill="currentColor"
      strokeLinejoin="round"
    />
  ),
  sparkle: (
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM18.5 15l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z" />
  ),
  heart: (
    <path d="M12 20.25s-7.5-4.4-7.5-9.4a4.35 4.35 0 0 1 7.5-2.95 4.35 4.35 0 0 1 7.5 2.95c0 5-7.5 9.4-7.5 9.4z" />
  ),
  users: (
    <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 20v-1.5a4 4 0 0 0-3-3.87M16 3.63a4 4 0 0 1 0 7.75" />
  ),
  message: (
    <path d="M12 20.5c4.7 0 8.5-3.4 8.5-7.6S16.7 5.3 12 5.3 3.5 8.7 3.5 12.9c0 1.9.8 3.6 2.1 4.9L5 21l3.6-1.4c1 .3 2.2.5 3.4.5z" />
  ),
  user: (
    <path d="M20 21v-1.5a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5V21M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
  ),
  bell: (
    <path d="M10.3 20.5a2 2 0 0 0 3.4 0M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z" />
  ),
  filter: <path d="M6 12h12M3 6h18M10 18h4" />,
  share: <path d="M21 3 10 14M21 3l-7 18-4-8-8-4 19-6z" />,
  // Mũi tên lên, không phải máy bay giấy: `share` đã là máy bay giấy, và mũi
  // tên lên mới là quy ước "gửi" của ứng dụng nhắn tin.
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  edit: <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />,
  // Mũi tên hướng LÊN đi vào khay: phân biệt được với `send` (mũi tên trần) ở
  // cỡ nhỏ, và nói đúng hành động là đưa tệp vào một nơi.
  upload: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  trash: <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
