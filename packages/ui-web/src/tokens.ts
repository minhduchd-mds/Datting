/**
 * Token cho HAI ứng dụng web: console kiểm duyệt (tối) và app người dùng (sáng).
 *
 * ─── "Đồng bộ" nghĩa là gì ở đây ──────────────────────────────────────────
 * KHÔNG phải làm hai app trông giống nhau. Console kiểm duyệt tối là quyết định
 * có lý do được ghi lại: thứ duy nhất đáng sáng trên màn hình là bức ảnh đang
 * xét. Đồng bộ nghĩa là hai app dùng chung một HỆ — cùng tên token, cùng thang
 * chữ, cùng thang khoảng cách — rồi mỗi bên nạp một bộ giá trị.
 *
 * ─── Nguồn của các con số ─────────────────────────────────────────────────
 * Thang chữ, thang khoảng cách và dải trung tính lấy từ Figma VTF-6
 * (`JWwoIxGLmraT4LZ3ymgLrM`). Màu nhấn thì KHÔNG: theo quyết định trong
 * CLAUDE.md, bản web lấy bố cục chứ không lấy thương hiệu doanh nghiệp, nên
 * đỏ Viettel `#E61B35` được thay bằng hệ màu Datting.
 *
 * ─── File này KHÔNG import gì ─────────────────────────────────────────────
 * Giữ được tính thuần tuý thì test chạy được bằng `node --test`, và bộ token
 * dùng lại được ở chỗ khác (ví dụ sinh CSS lúc build). `useHotkeys.ts` cùng
 * package thì có react — đó là ranh giới, đừng trộn.
 */

/* ===========================================================================
 * Phần KHÔNG phụ thuộc chế độ sáng/tối
 * =========================================================================== */

/**
 * Lưới 4pt. Figma dựng trên lưới này nên mọi khoảng cách trong thiết kế đều
 * chia hết cho 4 — giữ nguyên thì đo từ Figma sang code không phải quy đổi.
 */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

/**
 * Họ chữ — font HỆ THỐNG, không nhúng webfont nào.
 *
 * Thiết kế VTF-6 dùng `FS PF BeauSans Pro` cho heading và `Roboto` cho body.
 * Quyết định 20/08/2026: bỏ cả hai, dùng font mặc định của dự án.
 *
 * Ba lý do, xếp theo sức nặng:
 *   1. `FS PF BeauSans Pro` là font THƯƠNG MẠI và repo không có giấy phép
 *      webfont. Nhúng nó là vi phạm, không phải là chi tiết kỹ thuật.
 *   2. `apps/admin` và `apps/mobile` đều đã dùng font hệ thống. Thêm một họ chữ
 *      thứ ba cho web là tạo ra thứ phải đồng bộ về sau.
 *   3. Font hệ thống render ngay, không FOUT, và phủ tiếng Việt đầy đủ trên mọi
 *      nền tảng — thứ mà webfont phải tự lo và hay lo sót.
 *
 * Chuỗi này chép NGUYÊN VĂN từ `apps/admin/src/styles.css`; có test canh cho
 * hai bên không trôi khỏi nhau.
 *
 * Đánh đổi đã biết: bản web sẽ không giống Figma ở mặt chữ. Đó là đánh đổi có
 * chủ ý, không phải thiếu sót — đừng "sửa" bằng cách nhúng lại font thương mại.
 */
export const FONT = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/**
 * Thang chữ đọc thẳng từ biến Figma. Mỗi bậc gói ĐỦ BỐN thuộc tính, không chỉ
 * cỡ chữ — đó chính là lỗi mà `apps/mobile/src/theme.ts` đang mắc (`theme.type`
 * chỉ có cỡ), khiến mỗi màn tự chọn lại `lineHeight` và `fontWeight`.
 *
 * Cỡ, chiều cao dòng và độ đậm giữ nguyên theo thiết kế; chỉ họ chữ là đổi.
 */
export interface TypeStep {
  size: number;
  lineHeight: number;
  weight: number;
  family: keyof typeof FONT;
}

export const TYPE = {
  heading5: { size: 17, lineHeight: 1.3, weight: 600, family: "sans" },
  subheading2: { size: 15, lineHeight: 1.5, weight: 500, family: "sans" },
  textButton: { size: 14, lineHeight: 1.5, weight: 500, family: "sans" },
  body: { size: 14, lineHeight: 1.5, weight: 400, family: "sans" },
  code: { size: 13, lineHeight: 1.5, weight: 400, family: "mono" },
} as const satisfies Record<string, TypeStep>;

export type TypeName = keyof typeof TYPE;

/**
 * Bố cục desktop của thiết kế: 1440 = 240 sidebar + 1200 container.
 * Sidebar có mặt ở CẢ 27 màn nên nó là layout, không phải component.
 */
export const LAYOUT = {
  screenWidth: 1440,
  sidebarWidth: 240,
  containerWidth: 1200,
} as const;

/* ===========================================================================
 * Màu theo chế độ
 * =========================================================================== */

/**
 * Tên token cố ý GIỮ NGUYÊN tên biến CSS mà `apps/admin` đang dùng. Nhờ vậy
 * bước di trú đầu tiên không đổi một pixel nào — đó là cổng của giai đoạn này.
 */
export interface ColorTokens {
  /** Nền trang. */
  bg: string;
  /** Bề mặt nổi lên: thẻ, sidebar, panel. */
  panel: string;
  /** Bề mặt thứ hai: hover, ô đang chọn, nền phím. */
  panel2: string;
  /** Đường kẻ, viền. */
  line: string;
  /** Chữ chính. */
  fg: string;
  /** Chữ phụ. */
  fgDim: string;
  /** Ba màu ngữ nghĩa — TÁCH khỏi accent, không được dùng thay nhau. */
  ok: string;
  warn: string;
  bad: string;
  /** Màu nhấn của bề mặt này. */
  accent: string;
  /** Biến thể đủ tối/sáng để làm CHỮ trên nền `bg` — xem test tương phản. */
  accentText: string;
}

/**
 * Console kiểm duyệt. Giá trị chép NGUYÊN VĂN từ `apps/admin/src/styles.css`
 * để bước di trú là thay chỗ khai báo, không phải thay giao diện.
 */
export const DARK: ColorTokens = {
  bg: "#101114",
  panel: "#191b20",
  panel2: "#202329",
  line: "#2c3038",
  fg: "#e6e8ec",
  fgDim: "#9aa1ad",
  ok: "#3fa96a",
  warn: "#c9902f",
  bad: "#cf4b4b",
  accent: "#5b8def",
  accentText: "#5b8def",
};

/**
 * App người dùng, bản web.
 *
 * Dải trung tính lấy từ Figma. HAI ngoại lệ, cả hai đều có lý do:
 *
 * 1. `accent` KHÔNG phải đỏ Viettel `#E61B35`. Xem quyết định trong CLAUDE.md.
 *    Dùng hồng Datting, chỉnh tối hơn bản mobile (`#FF5E73`) vì nền ở đây là
 *    trắng chứ không phải `#08090C`.
 *
 * 2. `fgDim` KHÔNG phải `#999999` như biến `Color_base_web/subtext_card` của
 *    Figma. Màu đó trên nền sáng chỉ đạt ~2,7:1 — TRƯỢT WCAG AA cho chữ thường.
 *    Test trong package này chặn đúng chỗ đó; đừng chép ngược giá trị Figma về.
 */
export const LIGHT: ColorTokens = {
  bg: "#F7F7F8",
  panel: "#FFFFFF",
  panel2: "#F1F1F2",
  line: "#DCDCDC",
  fg: "#262626",
  fgDim: "#6B6B6B",
  ok: "#1F7A46",
  warn: "#8A5A0B",
  bad: "#C0332C",
  accent: "#E94D64",
  accentText: "#C2334B",
};

export const THEMES = { dark: DARK, light: LIGHT } as const;
export type ThemeName = keyof typeof THEMES;

/* ===========================================================================
 * Tương phản — hàm thuần tuý để test canh được
 * =========================================================================== */

/** `#rgb` hoặc `#rrggbb` → [r,g,b] 0–255. Ném lỗi nếu không phải mã hex. */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Không phải mã màu hex: ${hex}`);
  const h = m[1]!;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Độ chói tương đối theo WCAG 2.1. */
export function relativeLuminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Tỉ số tương phản WCAG, luôn ≥ 1. AA cần 4.5 cho chữ thường, 3.0 cho chữ lớn. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;
