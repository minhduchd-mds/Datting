/**
 * Nhãn hiệu Datting.
 *
 * ─── Vì sao là HAI TẤM THẺ NGHIÊNG, không phải trái tim ───────────────────
 * Trái tim là mặc định của mọi app hẹn hò, nên nó không nói gì về app NÀY. Hai
 * tấm thẻ nghiêng vào nhau nói đúng hai điều làm nên sản phẩm:
 *   · thẻ nghiêng khi kéo — cử chỉ chính, cùng góc mà `cardRotation()` trong
 *     `packages/core` sinh ra;
 *   · HAI tấm, không phải một — match là đồng thuận hai chiều,
 *     `P(match) = P(A→B) × P(B→A)`. Một tấm thì mới chỉ là một người vuốt.
 *
 * ─── Vì sao chia làm hai phần ─────────────────────────────────────────────
 * Dưới 1200px sidebar co còn 68px. Chữ "Datting" trước đây vẫn để nguyên nên
 * tràn khỏi cột — đúng chỗ lệch nhìn thấy trên màn. Dấu hiệu đứng được một
 * mình, chữ ẩn bằng CSS, nên chỗ hẹp không còn gì để tràn.
 *
 * ─── Vì sao chữ không phải là đường vẽ ────────────────────────────────────
 * Font trong thiết kế là thương mại và repo chưa có giấy phép webfont, nên chữ
 * dùng font hệ thống với nét đậm và giãn chữ âm. Vẽ chữ thành path là cách lách
 * giấy phép bằng hình học — không làm.
 */
export interface LogoProps {
  /** Cỡ dấu hiệu, px. Chữ tự cân theo. */
  size?: number;
  /** Chỉ hiện dấu hiệu. CSS lo phần ẩn theo bề rộng; đây là lối tắt cho nơi khác. */
  markOnly?: boolean;
}

/**
 * 24 chứ không phải 26, và khe 8 trong CSS chứ không phải 9.
 *
 * Sidebar có HAI cột thẳng đứng: rãnh icon và cột chữ. Mục điều hướng đặt icon
 * 20px rồi khe 12px, nên chữ của nó bắt đầu ở +32. Bản trước dùng 26 + 9 = 35,
 * tức chữ "Datting" lệch 3px so với mọi nhãn bên dưới. Ba pixel là thứ không ai
 * chỉ ra được nhưng ai cũng thấy — nó làm cả thanh trông xộc xệch.
 *
 *   24 + 8 = 32 = 20 + 12
 */
const MARK_SIZE = 24;

export function Logo({ size = MARK_SIZE, markOnly = false }: LogoProps) {
  return (
    <span className="logo" role="img" aria-label="Datting">
      <svg
        className="logo__mark"
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        {/*
          Ô nền đặc.

          Bản trước vẽ hai thẻ bằng nét 2.2px trên nền trắng. Hình học đúng, căn
          giữa đúng (đã đo: tâm 34 trong cột 68) — nhưng ở cột thu gọn thì nó gần
          như biến mất: vài nét mảnh không đủ trọng lượng để làm mỏ neo cho cả
          thanh điều hướng. Một ô đặc thì đọc được ở mọi cỡ, và đó cũng là cách
          mọi sidebar thật làm.
        */}
        <rect width="32" height="32" rx="8.5" fill="currentColor" />

        {/* Hai thẻ vẽ bằng MẢNG ĐẶC chứ không phải nét: ở cỡ 26px, mảng giữ
            được hình còn nét thì tan. Thẻ sau mờ hơn để có chiều sâu. */}
        <rect
          x="6.5"
          y="8.5"
          width="11"
          height="15"
          rx="3"
          transform="rotate(-15 12 16)"
          fill="var(--panel)"
          opacity="0.55"
        />
        {/* Thẻ trước có viền vẽ bằng MÀU Ô NỀN — đó là chỗ tách hai hình. Không
            có nó, ở cỡ nhỏ hai tấm dính thành một mảng và mất hẳn ý "hai tấm". */}
        <rect
          x="14"
          y="8"
          width="11.5"
          height="16"
          rx="3"
          transform="rotate(12 19.75 16)"
          fill="var(--panel)"
          stroke="currentColor"
          strokeWidth="2"
          paintOrder="stroke"
        />
      </svg>
      {!markOnly && <span className="logo__word">Datting</span>}
    </span>
  );
}
