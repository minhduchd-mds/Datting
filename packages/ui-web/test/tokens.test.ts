import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DARK,
  LIGHT,
  THEMES,
  TYPE,
  SPACE,
  FONT,
  WCAG_AA_LARGE,
  WCAG_AA_NORMAL,
  contrastRatio,
  parseHex,
  relativeLuminance,
  type ColorTokens,
  type ThemeName,
} from "../src/tokens.js";
import { CSS_COLOR_NAME, THEME_SELECTOR, allThemesCss, colorVars, themeCss } from "../src/css.js";

/* ===========================================================================
 * File CSS sinh ra và file CSS viết tay
 * =========================================================================== */

test("src/theme.css khớp ĐÚNG output của bộ sinh — chưa chạy lại gen:css là fail", () => {
  // File đó được commit vào repo để app import trực tiếp, nhưng nguồn sự thật
  // là tokens.ts. Không có test này thì sửa token xong quên chạy `gen:css` sẽ
  // cho ra một trang vẫn chạy nhưng dùng giá trị cũ — kiểu lỗi im lặng nhất.
  const onDisk = readFileSync(new URL("../../src/theme.css", import.meta.url), "utf8");
  assert.equal(
    onDisk.replace(/\r\n/g, "\n"),
    allThemesCss(),
    "chạy: npm run gen:css -w @datting/ui-web",
  );
});

test("primitives.css KHÔNG chứa một mã màu cứng nào", () => {
  // Cả hai app web dùng chung bộ primitive này với hai bộ token khác nhau. Một
  // mã hex lọt vào là một chỗ trông đúng ở theme này và sai ở theme kia — và nó
  // sẽ không ai thấy cho tới khi mở app còn lại.
  const css = readFileSync(new URL("../../src/primitives.css", import.meta.url), "utf8");
  const hex = css.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
  assert.deepEqual(hex, [], `còn mã màu cứng: ${hex.join(", ")}`);
});

test("mọi lớp dw- trong primitives.css chỉ lấy màu qua var()", () => {
  const css = readFileSync(new URL("../../src/primitives.css", import.meta.url), "utf8");
  // `rgb(0 0 0 / .55)` cho lớp phủ là ngoại lệ có chủ ý: nền mờ phải là đen ở
  // cả hai chế độ, không phải màu của theme.
  const bad = (css.match(/\b(?:rgb|hsl)a?\([^)]*\)/gi) ?? []).filter(
    (m) => !/^rgb\(\s*0\s+0\s+0\s*\//i.test(m),
  );
  assert.deepEqual(bad, [], `màu literal ngoài var(): ${bad.join(", ")}`);
});

test("hai chế độ dùng selector data-theme, KHÔNG có nhánh :root trần", () => {
  // Có nhánh mặc định thì app quên đặt data-theme sẽ âm thầm nhận theme của app
  // kia. Không có thì trang mất màu ngay — hỏng nhìn thấy được, dễ sửa hơn.
  const css = allThemesCss();
  assert.ok(css.includes(THEME_SELECTOR.dark));
  assert.ok(css.includes(THEME_SELECTOR.light));
  assert.ok(!/^:root\s*\{/m.test(css), "có khối :root trần trong theme.css");
});

/* ===========================================================================
 * Tương phản — lý do chính khiến file token này có test
 * =========================================================================== */

const MODES: ThemeName[] = ["dark", "light"];

for (const mode of MODES) {
  const c: ColorTokens = THEMES[mode];

  test(`[${mode}] chữ chính trên nền đạt WCAG AA`, () => {
    const r = contrastRatio(c.fg, c.bg);
    assert.ok(r >= WCAG_AA_NORMAL, `fg ${c.fg} trên bg ${c.bg} chỉ đạt ${r.toFixed(2)}:1`);
  });

  test(`[${mode}] chữ PHỤ cũng phải đạt AA, không được châm chước`, () => {
    // Chữ phụ vẫn là chữ người ta phải đọc: tên file ảnh, số người tố, thời gian
    // chờ. Cho nó tiêu chuẩn thấp hơn là hợp thức hoá một màn khó đọc.
    const r = contrastRatio(c.fgDim, c.bg);
    assert.ok(r >= WCAG_AA_NORMAL, `fgDim ${c.fgDim} trên bg ${c.bg} chỉ đạt ${r.toFixed(2)}:1`);
  });

  test(`[${mode}] accentText dùng được làm CHỮ trên nền`, () => {
    const r = contrastRatio(c.accentText, c.bg);
    assert.ok(r >= WCAG_AA_NORMAL, `accentText ${c.accentText} chỉ đạt ${r.toFixed(2)}:1`);
  });

  test(`[${mode}] accent và ba màu ngữ nghĩa đạt ngưỡng phần tử lớn`, () => {
    for (const key of ["accent", "ok", "warn", "bad"] as const) {
      const r = contrastRatio(c[key], c.bg);
      assert.ok(r >= WCAG_AA_LARGE, `${key} ${c[key]} chỉ đạt ${r.toFixed(2)}:1`);
    }
  });

  test(`[${mode}] chữ đọc được cả trên panel, không chỉ trên bg`, () => {
    // Thẻ và sidebar dùng `panel` chứ không phải `bg`. Kiểm mỗi bg là bỏ sót
    // đúng bề mặt mà người dùng nhìn nhiều nhất.
    assert.ok(contrastRatio(c.fg, c.panel) >= WCAG_AA_NORMAL);
    assert.ok(contrastRatio(c.fgDim, c.panel) >= WCAG_AA_NORMAL);
  });
}

test("màu subtext của Figma (#999999) TRƯỢT AA trên nền sáng — nên ta không dùng", () => {
  // Test này ghi lại một QUYẾT ĐỊNH, không kiểm một hàm. Biến
  // `Color_base_web/subtext_card` trong VTF-6 là #999999; chép thẳng sang là có
  // một màn không đọc được. Nếu ai đó "sửa cho khớp Figma", test này nổ.
  const figmaSubtext = "#999999";
  const r = contrastRatio(figmaSubtext, LIGHT.bg);
  assert.ok(r < WCAG_AA_NORMAL, `#999999 giờ đạt ${r.toFixed(2)}:1 — kiểm lại giả định`);
  assert.notEqual(LIGHT.fgDim, figmaSubtext);
});

/* ===========================================================================
 * Chống trôi giữa TS và CSS
 * =========================================================================== */

test("theme tối khớp TỪNG GIÁ TRỊ với apps/admin/src/styles.css", () => {
  // Cổng của giai đoạn này là "console kiểm duyệt không đổi một pixel nào".
  // Test đọc thẳng file CSS thật chứ không tin vào lời hứa.
  const cssPath = new URL("../../../../apps/admin/src/styles.css", import.meta.url);
  const css = readFileSync(cssPath, "utf8");
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  assert.ok(root, "không tìm thấy khối :root trong styles.css");

  const declared = new Map<string, string>();
  for (const m of root[1]!.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    declared.set(m[1]!, m[2]!.trim());
  }

  for (const key of Object.keys(DARK) as Array<keyof ColorTokens>) {
    const cssName = CSS_COLOR_NAME[key];
    // `accent-text` là token mới, chưa có trong CSS cũ của admin — bỏ qua.
    if (!declared.has(cssName)) continue;
    assert.equal(
      declared.get(cssName),
      DARK[key],
      `--${cssName}: CSS có "${declared.get(cssName)}", TS có "${DARK[key]}"`,
    );
  }

  // Và mọi biến màu CSS đang có phải được TS phủ hết, không sót cái nào.
  const known = new Set(Object.values(CSS_COLOR_NAME));
  for (const name of declared.keys()) {
    assert.ok(known.has(name), `--${name} có trong CSS nhưng không có trong token TS`);
  }
});

test("bảng tên CSS phủ đủ mọi khoá màu", () => {
  for (const key of Object.keys(DARK)) {
    assert.ok(key in CSS_COLOR_NAME, `thiếu tên CSS cho token "${key}"`);
  }
});

test("panel2 phải sinh ra --panel-2, không phải --panel2", () => {
  // Suy tên máy móc bằng kebab-case sẽ cho ra `--panel2` vì không có chữ hoa
  // nào để chuyển. Đó là một biến sai duy nhất, ở chỗ khó thấy nhất.
  assert.equal(CSS_COLOR_NAME.panel2, "panel-2");
  assert.ok(colorVars(DARK).includes("--panel-2: #202329;"));
});

test("mọi khoá màu đều có mặt ở CẢ HAI chế độ", () => {
  // Thiếu một khoá ở một chế độ là lỗi kinh điển của giao diện hai theme: màu
  // chỉ định nghĩa ở nhánh tối sẽ không áp dụng ở nhánh sáng, và trang vẽ chữ
  // của theme này lên nền của theme kia.
  assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort());
});

test("themeCss có color-scheme, thiếu là thanh cuộn vẽ sai chế độ", () => {
  assert.match(themeCss("dark"), /color-scheme:\s*dark;/);
  assert.match(themeCss("light"), /color-scheme:\s*light;/);
});

test("themeCss nhận selector tuỳ ý để gắn theo data-theme", () => {
  assert.ok(themeCss("light", '[data-theme="light"]').startsWith('[data-theme="light"] {'));
});

/* ===========================================================================
 * Thang chữ và khoảng cách
 * =========================================================================== */

test("mỗi bậc chữ gói ĐỦ bốn thuộc tính, không chỉ cỡ", () => {
  // Đây là lỗi apps/mobile/src/theme.ts đang mắc: theme.type chỉ có cỡ chữ, nên
  // mỗi màn tự chọn lại lineHeight và fontWeight rồi trôi dần khỏi nhau.
  for (const [name, step] of Object.entries(TYPE)) {
    assert.equal(typeof step.size, "number", `${name} thiếu size`);
    assert.equal(typeof step.lineHeight, "number", `${name} thiếu lineHeight`);
    assert.equal(typeof step.weight, "number", `${name} thiếu weight`);
    assert.ok("family" in step, `${name} thiếu family`);
  }
});

test("không bậc chữ sans nào nhỏ hơn 14px", () => {
  // Audit 15/08 ghi nhận caption 9-10px ở bản mobile là quá nhỏ. Đừng mang lỗi
  // đó sang web, nơi màn hình còn xa mắt hơn.
  //
  // Mono được phép 13px: cùng cỡ danh nghĩa, chữ đơn cách trông LỚN hơn chữ
  // tỉ lệ, nên 13px mono đọc ngang 14px sans. Đây là ngoại lệ có lý do, không
  // phải châm chước.
  for (const [name, step] of Object.entries(TYPE)) {
    const min = step.family === "mono" ? 13 : 14;
    assert.ok(step.size >= min, `${name} chỉ ${step.size}px (tối thiểu ${min})`);
  }
});

test("KHÔNG nhúng webfont nào — chỉ dùng font hệ thống", () => {
  // Thiết kế VTF-6 dùng FS PF BeauSans Pro (thương mại, repo không có giấy
  // phép webfont) và Roboto. Quyết định 20/08/2026: bỏ cả hai.
  //
  // Test này chặn việc lén đưa font thương mại trở lại. Nếu ai đó thật sự mua
  // giấy phép, sửa test cùng lúc với việc thêm font — đừng sửa riêng một bên.
  const all = Object.values(FONT).join(" ").toLowerCase();
  for (const banned of ["beausans", "roboto", "url(", "@font-face"]) {
    assert.ok(!all.includes(banned), `stack font chứa "${banned}"`);
  }
  for (const [name, step] of Object.entries(TYPE)) {
    assert.ok(step.family in FONT, `${name} trỏ tới họ chữ không tồn tại`);
  }
});

test("stack font khớp apps/admin/src/styles.css, không trôi khỏi nhau", () => {
  const cssPath = new URL("../../../../apps/admin/src/styles.css", import.meta.url);
  const css = readFileSync(cssPath, "utf8");
  // `body { font: 14px/1.5 <stack>; }` — lấy phần stack sau cỡ/chiều cao dòng.
  const m = /font:\s*14px\/1\.5\s+([^;]+);/.exec(css);
  assert.ok(m, "không tìm thấy khai báo font của body trong styles.css");
  assert.equal(m[1]!.trim(), FONT.sans);
});

test("thang khoảng cách nằm trên lưới 4pt", () => {
  for (const [name, v] of Object.entries(SPACE)) {
    assert.equal(v % 4, 0, `${name} = ${v} không chia hết cho 4`);
  }
});

/* ===========================================================================
 * Hàm tính tương phản
 * =========================================================================== */

test("parseHex nhận cả dạng 3 và 6 ký tự", () => {
  assert.deepEqual(parseHex("#fff"), [255, 255, 255]);
  assert.deepEqual(parseHex("#FFFFFF"), [255, 255, 255]);
  assert.deepEqual(parseHex("#101114"), [16, 17, 20]);
});

test("parseHex từ chối rác thay vì đoán", () => {
  assert.throws(() => parseHex("red"));
  assert.throws(() => parseHex("#12"));
  assert.throws(() => parseHex("rgb(0,0,0)"));
});

test("tương phản trắng/đen đúng bằng 21", () => {
  assert.equal(Math.round(contrastRatio("#ffffff", "#000000")), 21);
});

test("tương phản đối xứng và luôn >= 1", () => {
  assert.equal(contrastRatio(DARK.fg, DARK.bg), contrastRatio(DARK.bg, DARK.fg));
  assert.ok(contrastRatio(DARK.fg, DARK.fg) >= 1);
});

test("độ chói nằm đúng hai đầu với đen và trắng", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
});
