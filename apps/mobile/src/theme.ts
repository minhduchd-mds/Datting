/**
 * Bảng màu của app. MỘT nguồn sự thật.
 *
 * ─── Vì sao file này tồn tại ──────────────────────────────────────────────
 * Trước đó màu được viết thẳng vào từng StyleSheet: 34 giá trị hex khác nhau,
 * `#f43f5e` xuất hiện 31 lần. Đổi tông thương hiệu phải sửa tay hàng chục chỗ
 * và chắc chắn sót.
 *
 * ─── Nhưng cái đắt hơn là TRÔI DẠT ────────────────────────────────────────
 * Trong 34 màu đó có bốn màu "chữ xám" gần trùng nhau:
 *
 *     #8b949e   #9aa1ad   #6e7681   #6f7681
 *
 * `#6e7681` và `#6f7681` lệch đúng MỘT đơn vị ở một kênh — mắt không phân biệt
 * được, và không ai cố ý chọn cả hai. Chúng sinh ra từ việc copy giữa các file
 * rồi chỉnh tay. Tương tự với sáu biến thể nền tối và bốn biến thể viền.
 *
 * Nên việc của file này không chỉ là đặt tên cho màu, mà là GOM các màu cùng
 * vai trò về một giá trị. Sau khi gom, giao diện đổi rất nhẹ ở vài chỗ — đó là
 * chủ ý: những khác biệt bị xoá đi vốn không phải quyết định của ai.
 */

export const C = {
  /* ---- nền ---- */
  /** Nền app. Mọi màn đều bắt đầu từ đây. */
  bg: "#0d0d10",
  /** Thẻ, sheet, ô nhập — nổi lên một bậc so với nền. */
  surface: "#161b22",
  /** Nền ảnh trong lúc chờ tải, và thanh tab. */
  surfaceSunken: "#131418",

  /* ---- viền ---- */
  /** Viền rõ: nút phụ, ô nhập. */
  border: "#30363d",
  /** Viền mờ: đường phân cách, chip. Dùng khi viền chỉ để TÁCH chứ không để CHỈ. */
  borderSoft: "#23262d",

  /* ---- chữ ---- */
  /** Chữ chính. */
  text: "#e6edf3",
  /** Chữ phụ: mô tả, nhãn, trạng thái. */
  textMuted: "#8b949e",
  /**
   * Chữ mờ: placeholder, chú thích.
   *
   * `#6e7681` chứ không phải `#484f58` như bản trước. Giá trị cũ cho tương phản
   * **2.34:1** trên nền app — chưa tới một nửa ngưỡng WCAG AA (4.5:1), và thấp
   * hơn cả ngưỡng 3:1 dành cho chữ cỡ lớn.
   *
   * Nó đang là màu placeholder của SÁU ô nhập, kể cả ô số điện thoại ở màn đăng
   * nhập. Placeholder thường là thứ DUY NHẤT nói cho người dùng biết ô này cần
   * nhập gì; đọc không ra nó nghĩa là đứng trước một ô trống không nhãn — ngay ở
   * cửa vào của sản phẩm, và tệ hơn nữa khi dùng ngoài trời nắng.
   *
   * `#7b838f` là giá trị THẤP NHẤT đạt AA trên cả hai nền (5.07:1 và 4.52:1) —
   * đo chứ không ước lượng. Lần đầu tôi chọn `#6e7681` vì tưởng nó đủ; đo ra
   * 4.22:1, vẫn trượt. Vẫn dịu hơn `textMuted` nên thứ bậc chữ không đổi.
   */
  textFaint: "#7b838f",
  /** Chữ trên nền màu đặc (nút chính, ảnh). */
  textOn: "#ffffff",

  /* ---- nhấn ---- */
  /** Màu thương hiệu. Hành động CHÍNH và chỉ hành động chính. */
  accent: "#f43f5e",
  /** Bản dịu hơn: tab đang chọn, vạch tiến trình. */
  accentSoft: "#e0567a",

  /* ---- trạng thái ---- */
  /** Thành công, "đang nhập". */
  success: "#34d399",
  /** Thông tin, super-like. */
  info: "#38bdf8",
  /**
   * Lỗi. Trùng `accent` là CÓ CHỦ Ý: đỏ hồng đã là màu cảnh báo tự nhiên, và
   * thêm một sắc đỏ thứ hai chỉ làm hai thứ cùng hét lên.
   */
  danger: "#f43f5e",

  /* ---- lớp phủ ---- */
  /** Nền mờ sau bottom-sheet. */
  scrim: "#000000aa",
  /** Chữ phụ đặt trên ảnh — luôn phải có dải tối phía dưới mới đọc được. */
  textOnPhoto: "rgba(255,255,255,.75)",
  /** Nền chip đặt trên ảnh. */
  chipOnPhoto: "rgba(255,255,255,.14)",
} as const;

export type ColorToken = keyof typeof C;

/* ===========================================================================
 * THANG CHỮ — theo iOS Human Interface Guidelines
 *
 * Trước đó app dùng 16 cỡ chữ khác nhau, trong đó có ba cỡ liên tiếp 13/14/15
 * và ba cỡ 18/19/20. Chênh 1px ở cỡ thân chữ nằm DƯỚI ngưỡng phân biệt của mắt,
 * nên chúng không tạo ra phân cấp nào — chúng chỉ làm hai màn cạnh nhau hơi
 * khác mà không ai nói được khác chỗ nào.
 *
 * Lấy thẳng thang của Apple thay vì tự chế: nó đã được kiểm chứng ở quy mô lớn,
 * mỗi bậc cách nhau đủ để nhận ra, và có tên gọi mô tả VAI TRÒ chứ không mô tả
 * kích thước — nhờ vậy chọn cỡ trở thành câu hỏi "đây là loại chữ gì" thay vì
 * "bao nhiêu px thì đẹp".
 *
 * ⚠ Đây là thang CỠ, không phải bộ chữ. App không cài `expo-font`, nên trên iOS
 *   nó vẽ bằng SF Pro (đúng chữ của Apple) còn trên Android là Roboto. Nhịp và
 *   thứ bậc giống nhau; hình dáng con chữ thì không.
 * =========================================================================== */
export const T = {
  /** 34 — tiêu đề lớn, mỗi màn nhiều nhất một cái. */
  largeTitle: 34,
  /** 28 — tiêu đề màn. */
  title1: 28,
  /** 22 — tiêu đề khối. */
  title2: 22,
  /** 20 — tiêu đề nhỏ, tên trên thẻ. */
  title3: 20,
  /** 17 — thân chữ và nhãn nút. Cỡ đọc chuẩn của iOS. */
  body: 17,
  /** 16 — thân chữ phụ. */
  callout: 16,
  /** 15 — mô tả, chữ dưới tiêu đề. */
  subhead: 15,
  /** 13 — chú thích, nhãn trạng thái. */
  footnote: 13,
  /** 12 — nhãn tab, chip. */
  caption1: 12,
  /** 11 — nhãn mục viết hoa, chữ nhỏ nhất được phép. */
  caption2: 11,
} as const;

/* ===========================================================================
 * LƯỚI KHOẢNG CÁCH — 4pt
 *
 * Trước đó có 31 giá trị padding/margin/gap khác nhau, gồm cả 3, 5, 7, 9, 11,
 * 13. Số lẻ là dấu vân tay của việc chỉnh tay từng chỗ cho tới khi "trông ổn"
 * thay vì đặt theo lưới.
 *
 * Hệ quả không nằm ở một màn nào cụ thể mà ở nhịp dọc: các màn không khớp nhau,
 * nên chuyển màn thấy hơi giật dù không có gì sai rõ ràng. Nó cũng là thứ tốn
 * thời gian nhất khi thêm màn — không có lưới thì mỗi lần lại phải chỉnh lại
 * từ đầu.
 *
 * 4pt chứ không phải 8pt: 8 quá thô cho khoảng cách trong một dòng (icon với
 * chữ), mà iOS cũng dùng nửa bậc ở đúng những chỗ đó.
 * =========================================================================== */
export const S = {
  /** 2 — chỉ dùng để chỉnh quang học, không phải khoảng cách bố cục. */
  hair: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

/** Bán kính bo. iOS bo mạnh hơn Material — thẻ 20+, nút 12–14. */
export const R = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  card: 28,
  pill: 999,
} as const;
