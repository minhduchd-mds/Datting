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

export function Logo({ size = 26, markOnly = false }: LogoProps) {
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
        {/* Thẻ sau: chỉ viền, nghiêng trái — tấm đang chờ tới lượt, giống
            `card--behind` ở màn Đề xuất. */}
        <rect
          x="3.5"
          y="7"
          width="13"
          height="18"
          rx="3.5"
          transform="rotate(-14 10 16)"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        {/*
          Thẻ trước: đặc, nghiêng phải — tấm đang được kéo.

          Viền vẽ bằng MÀU NỀN chứ không phải màu thẻ. Đó là chỗ tách hai hình:
          không có nó, ở cỡ 20px hai tấm dính thành một khối và mất hẳn ý "hai
          tấm". Cách này đúng ở mọi cỡ và mọi theme vì nó bám `--panel`, khác
          với một khuyết tròn đặt tay chỉ đúng ở một cỡ.
        */}
        <rect
          x="14"
          y="7"
          width="13"
          height="18"
          rx="3.5"
          transform="rotate(12 20.5 16)"
          fill="currentColor"
          stroke="var(--panel)"
          strokeWidth="2.4"
          paintOrder="stroke"
        />
      </svg>
      {!markOnly && <span className="logo__word">Datting</span>}
    </span>
  );
}
