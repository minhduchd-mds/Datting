/**
 * MOTION TOKENS — hệ thống hiệu ứng.
 *
 * Nguyên tắc: hiệu ứng là một hệ THỐNG, không phải một tập hợp con số rải rác
 * trong từng component. Mọi thời lượng, đường cong, và cấu hình lò xo đều đến
 * từ file này. Nếu bạn thấy một `withTiming(300)` hardcode ở đâu đó trong
 * codebase, đó là bug — nó sẽ trôi khỏi phần còn lại của app trong 3 tháng.
 *
 * Ba quy tắc bất di bất dịch:
 *
 * 1. CỬ CHỈ DÙNG LÒ XO, KHÔNG DÙNG THỜI GIAN. Bất cứ thứ gì ngón tay đang
 *    chạm vào phải phản hồi bằng spring — vì spring có vận tốc, và người dùng
 *    cảm nhận được vận tốc. `withTiming` cho chuyển động do ngón tay điều khiển
 *    luôn cho cảm giác "cao su", chết.
 *
 * 2. VÀO NHANH, RA CHẬM HƠN. Phần tử xuất hiện phải nhanh (người dùng đang chờ);
 *    phần tử biến mất có thể chậm hơn một chút (người dùng đã chuyển sự chú ý).
 *
 * 3. TÔN TRỌNG "GIẢM CHUYỂN ĐỘNG". Không phải tuỳ chọn. Với một số người,
 *    animation parallax/scale gây chóng mặt thật sự. Xem `useMotionConfig`.
 */

/** Thời lượng (ms). Thang bậc cố định — không được chèn giá trị giữa. */
export const DURATION = {
  /** Phản hồi tức thì: đổi màu, đổi trạng thái nút. */
  instant: 90,
  /** Micro-interaction: nhấn nút, hiện badge. */
  fast: 160,
  /** Mặc định: fade, slide trong màn. */
  base: 240,
  /** Chuyển màn, bottom-sheet. */
  slow: 380,
  /** Chỉ dùng cho khoảnh khắc ăn mừng (màn "It's a Match"). */
  celebration: 900,
} as const;

/**
 * Đường cong Bézier. Tên mô tả CẢM GIÁC, không mô tả con số — để người viết
 * code chọn đúng theo ngữ cảnh chứ không copy số.
 */
export const EASING = {
  /** Vào màn: bắt đầu nhanh, dừng mềm. Dùng cho mọi thứ xuất hiện. */
  enter: [0.16, 1, 0.3, 1] as const,
  /** Ra khỏi màn: bắt đầu mềm, tăng tốc rồi biến mất. */
  exit: [0.7, 0, 0.84, 0] as const,
  /** Chuyển đổi giữa hai trạng thái đều đang hiển thị. */
  standard: [0.4, 0, 0.2, 1] as const,
  /** Nhấn nhá nhẹ, vượt đích một chút rồi về. Dùng RẤT tiết chế. */
  overshoot: [0.34, 1.56, 0.64, 1] as const,
} as const;

/** Cấu hình lò xo cho Reanimated `withSpring`. */
export const SPRING = {
  /** Thẻ swipe quay về vị trí cũ — chắc, không rung. */
  card: { damping: 18, stiffness: 180, mass: 1 },
  /** Nút nhấn — rất nhanh, hơi nảy. */
  press: { damping: 15, stiffness: 400, mass: 0.6 },
  /** Bottom-sheet trượt lên — nặng hơn, cảm giác có khối lượng. */
  sheet: { damping: 22, stiffness: 140, mass: 1.2 },
  /** Ăn mừng — nảy rõ rệt, chỉ dùng cho màn match. */
  celebrate: { damping: 9, stiffness: 120, mass: 0.9 },
} as const;

export type SpringName = keyof typeof SPRING;
export type DurationName = keyof typeof DURATION;

/**
 * Khoảng lệch giữa các phần tử trong một danh sách xuất hiện tuần tự.
 *
 * Cạm bẫy: nhân tuyến tính (`index * 50`) khiến phần tử thứ 20 xuất hiện sau
 * 1 giây — người dùng đã cuộn qua nó rồi. Hàm dưới đây tăng dần rồi BÃO HOÀ.
 */
export function staggerDelay(index: number, step = 40, cap = 240): number {
  if (index < 0) throw new Error("staggerDelay: index không được âm");
  return Math.min(cap, Math.round(step * Math.sqrt(index)));
}

/**
 * Quy đổi vận tốc vuốt (px/s) thành thời lượng bay ra khỏi màn.
 * Vuốt mạnh → bay nhanh. Đây là thứ khiến cử chỉ có cảm giác "thật".
 */
export function flingDuration(velocityPxPerSec: number, distancePx: number): number {
  const v = Math.max(300, Math.abs(velocityPxPerSec));
  const ms = (Math.abs(distancePx) / v) * 1000;
  return Math.round(Math.min(400, Math.max(120, ms)));
}

/**
 * Ánh xạ độ kéo ngang → độ xoay thẻ (độ).
 * Giới hạn ở ±14° — quá nhiều làm mất khả năng đọc mặt người trong ảnh.
 */
export function cardRotation(translateX: number, screenWidth: number, maxDeg = 14): number {
  "worklet";
  if (screenWidth <= 0) return 0;
  const ratio = Math.max(-1, Math.min(1, translateX / screenWidth));
  return ratio * maxDeg;
}

/**
 * Độ mờ của tem "KẾT NỐI" / "BỎ QUA" theo độ kéo.
 * Bắt đầu hiện ở 15% ngưỡng, đầy ở 100% ngưỡng — người dùng thấy phản hồi
 * sớm nhưng không bị nhiễu khi chỉ chạm nhẹ.
 */
export function stampOpacity(translateX: number, threshold: number, direction: 1 | -1): number {
  "worklet";
  if (threshold <= 0) return 0;
  const signed = translateX * direction;
  if (signed <= threshold * 0.15) return 0;
  return Math.min(1, (signed - threshold * 0.15) / (threshold * 0.85));
}

// ---------------------------------------------------------------------------
// Phần THUẦN TUÝ (không phụ thuộc React Native) — được test bằng `npm test`.
// Mọi thứ dưới đây phải chạy được trong Node, đó là lý do file này không import
// bất cứ thứ gì từ react-native.
// ---------------------------------------------------------------------------

export interface ResolvedMotion {
  reduceMotion: boolean;
  allowTransform: boolean;
  duration: (name: DurationName) => number;
  spring: (name: SpringName) => { damping: number; stiffness: number; mass: number };
}

/**
 * Điều chỉnh toàn bộ token theo thiết lập "Giảm chuyển động" của hệ thống.
 *
 * Cách xử lý ĐÚNG không phải tắt sạch animation (giao diện giật cục, người dùng
 * mất ngữ cảnh) mà là: giữ fade, bỏ chuyển động lớn (scale/xoay/parallax),
 * rút ngắn thời lượng, và tắt độ nảy của lò xo.
 */
export function resolveMotionConfig(reduceMotion: boolean): ResolvedMotion {
  return {
    reduceMotion,
    allowTransform: !reduceMotion,
    duration: (name) => (reduceMotion ? Math.min(DURATION[name], DURATION.fast) : DURATION[name]),
    spring: (name) => {
      const s = SPRING[name];
      if (!reduceMotion) return { ...s };
      return { damping: 40, stiffness: Math.max(s.stiffness, 300), mass: 1 };
    },
  };
}

/**
 * Cổng chống rung liên tiếp.
 *
 * Khi thẻ dao động quanh ngưỡng swipe, hàm cập nhật được gọi mỗi frame (60–120
 * lần/giây). Không có cổng này, thiết bị sẽ rung hàng chục lần trong một giây và
 * người dùng sẽ tắt haptics ở cấp hệ thống — mất luôn cả những lần rung quan
 * trọng như "có match".
 *
 * Cơ chế: chỉ bắn khi VỪA vượt ngưỡng (cạnh lên), và phải kéo về dưới ngưỡng
 * mới nạp lại. Cộng thêm khoảng cách tối thiểu giữa hai lần bắn.
 */
export function createThresholdGate(fire: () => void, minIntervalMs = 250) {
  let last = -Infinity;
  let armed = true;
  return {
    update(crossed: boolean, now: number): void {
      if (crossed) {
        if (armed && now - last >= minIntervalMs) {
          last = now;
          armed = false;
          fire();
        }
      } else {
        armed = true;
      }
    },
    reset(): void {
      armed = true;
      last = -Infinity;
    },
  };
}
