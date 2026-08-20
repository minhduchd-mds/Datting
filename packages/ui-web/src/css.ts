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
import { LAYOUT, RADIUS, SPACE, THEMES, TYPE, type ColorTokens, type ThemeName } from "./tokens.js";

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
  for (const [k, v] of Object.entries(TYPE)) {
    out.push(`--type-${kebab(k)}-size: ${v.size}px;`);
    out.push(`--type-${kebab(k)}-line: ${v.lineHeight};`);
    out.push(`--type-${kebab(k)}-weight: ${v.weight};`);
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
