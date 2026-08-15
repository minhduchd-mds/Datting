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
  /** Chữ mờ: placeholder, chú thích. Không dùng cho thông tin cần đọc. */
  textFaint: "#484f58",
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
