/**
 * Sinh biến CSS từ token TypeScript.
 *
 * Vì sao sinh ra thay vì viết tay hai lần: viết tay là bảo đảm chúng sẽ lệch
 * nhau. Cùng loại lỗi mà `packages/core/src/moderation.ts` chặn bằng cách khớp
 * hằng số với cột SQL — ở đây khớp CSS với TS.
 *
 * Tên biến GIỮ NGUYÊN như `apps/admin/src/styles.css` đang dùng (`--bg`,
 * `--fg-dim`…) nên console kiểm duyệt chỉ cần đổi chỗ khai báo, không đổi một
 * dòng quy tắc nào.
 */
import { FONT, LAYOUT, RADIUS, SPACE, THEMES, TYPE, type ColorTokens, type ThemeName } from "./tokens.js";

/** camelCase → kebab-case: `fgDim` → `fg-dim`. Dùng cho thang, không cho màu. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

/**
 * Tên biến CSS cho từng token màu — khai TƯỜNG MINH chứ không suy ra máy móc.
 *
 * Lý do rất cụ thể: `apps/admin` đang dùng `--panel-2`, nhưng khoá TS là
 * `panel2` và `kebab("panel2")` cho ra `--panel2` (không có chữ hoa nào để
 * chuyển). Suy ra tự động là sinh sai đúng một biến, và cổng "không đổi pixel
 * nào" hỏng ở chỗ khó thấy nhất. Bảng này là một nguồn sự thật; test canh cho
 * nó không thiếu khoá nào.
 */
export const CSS_COLOR_NAME: Record<keyof ColorTokens, string> = {
  bg: "bg",
  panel: "panel",
  panel2: "panel-2",
  line: "line",
  fg: "fg",
  fgDim: "fg-dim",
  ok: "ok",
  warn: "warn",
  bad: "bad",
  accent: "accent",
  accentText: "accent-text",
};

export function colorVars(colors: ColorTokens): string[] {
  return (Object.keys(colors) as Array<keyof ColorTokens>).map(
    (k) => `--${CSS_COLOR_NAME[k]}: ${colors[k]};`,
  );
}

export function scaleVars(): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(SPACE)) out.push(`--space-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(RADIUS)) out.push(`--radius-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(FONT)) out.push(`--font-${k}: ${v};`);
  for (const [k, v] of Object.entries(TYPE)) {
    out.push(`--type-${kebab(k)}-size: ${v.size}px;`);
    out.push(`--type-${kebab(k)}-line: ${v.lineHeight};`);
    out.push(`--type-${kebab(k)}-weight: ${v.weight};`);
    out.push(`--type-${kebab(k)}-family: var(--font-${v.family});`);
  }
  for (const [k, v] of Object.entries(LAYOUT)) out.push(`--layout-${kebab(k)}: ${v}px;`);
  return out;
}

/**
 * Khối `:root` hoàn chỉnh cho một chế độ.
 *
 * `color-scheme` đi kèm chứ không tách ra: thiếu nó thì thanh cuộn và ô nhập
 * liệu mặc định của trình duyệt vẫn vẽ theo chế độ kia, và đó là thứ trông
 * hỏng nhất trên một giao diện tối.
 */
export function themeCss(theme: ThemeName, selector = ":root"): string {
  const lines = [
    ...colorVars(THEMES[theme]),
    ...scaleVars(),
    `color-scheme: ${theme};`,
  ];
  return `${selector} {\n${lines.map((l) => "  " + l).join("\n")}\n}`;
}


/**
 * Selector cho từng chế độ.
 *
 * Cố ý KHÔNG có nhánh mặc định trên `:root` trần: hai app web đều có chế độ cố
 * định (console tối, app người dùng sáng) và đều đặt `data-theme` tường minh
 * trên thẻ <html>. Quên đặt thì trang mất màu ngay lập tức — thấy được. Có
 * nhánh mặc định thì app quên đặt sẽ âm thầm nhận theme của app kia, và lỗi đó
 * chỉ lộ ra khi ai đó nhìn màn hình.
 */
export const THEME_SELECTOR: Record<ThemeName, string> = {
  dark: ':root[data-theme="dark"]',
  light: ':root[data-theme="light"]',
};

/** Toàn bộ CSS chủ đề, dùng cho bước sinh file. */
export function allThemesCss(): string {
  const banner = [
    "/* SINH TỰ ĐỘNG từ src/tokens.ts — ĐỪNG SỬA TAY.",
    "   Chạy lại: npm run gen:css -w @datting/ui-web",
    "   Test trong package canh cho file này không lệch khỏi token. */",
  ].join("\n");

  const blocks = (Object.keys(THEME_SELECTOR) as ThemeName[]).map((t) =>
    themeCss(t, THEME_SELECTOR[t]),
  );

  return [banner, ...blocks].join("\n\n") + "\n";
}
