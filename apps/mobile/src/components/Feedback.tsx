/**
 * Bộ nguyên thuỷ phản hồi — những thứ nhỏ tạo nên cảm giác "app xịn".
 *
 * PressableScale · Skeleton · Toast · StepProgress · Shimmer
 *
 * Triết lý: người dùng không nhận ra những component này khi chúng hoạt động
 * đúng. Họ chỉ nhận ra khi chúng thiếu — app cảm thấy "rẻ tiền" mà không nói
 * được vì sao. Đó chính là vì sao chúng phải nằm trong hệ thống, không phải
 * được viết lại ở mỗi màn.
 */
import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle, type StyleProp } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { EASING, staggerDelay } from "@datting/core";
import { useMotionConfig } from "../motion/useMotionConfig";
import { haptic } from "../motion/haptics";

const bezier = (c: readonly [number, number, number, number]) =>
  Easing.bezier(c[0], c[1], c[2], c[3]);

/** Đủ mờ để đọc ra "chưa bấm được", chưa mờ tới mức không đọc nổi chữ. */
const DISABLED_OPACITY = 0.4;

/**
 * `Pressable` và ô hoạt hoạ phải là MỘT nút, không phải hai nút lồng nhau.
 *
 * Bản trước là `<Pressable>` (không style) bọc `<Animated.View style={style}>`.
 * Nhìn thì vô hại — lớp ngoài chỉ để bắt chạm — nhưng nó vẫn là một nút BỐ CỤC
 * thật, và trong Yoga thì `%` luôn tính theo CHA TRỰC TIẾP. Nên mọi `width: "x%"`
 * người gọi truyền vào bị tính HAI LẦN:
 *
 *     lưới ảnh rộng   1272px
 *     Pressable ngoài   31% của 1272 = 394px   ← vùng chạm
 *     Animated.View     31% của  394 = 122px   ← thứ mắt nhìn thấy
 *
 * Ô ảnh đáng lẽ ~112dp thành 35dp, chữ trong ô vỡ dòng, và vùng chạm rộng gấp
 * ba lần hình vẽ — bấm vào khoảng trống cạnh ô 2 lại mở ô 1. Không có lỗi nào
 * được in ra, `tsc` xanh, và nó chỉ lộ ra khi đo `uiautomator dump`.
 *
 * Gộp làm một nút thì `style` của người gọi rơi đúng vào phần tử duy nhất:
 * hình vẽ, vùng chạm và gốc toạ độ của `scale` trùng khít nhau.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ------------------------------------------------------------------ Pressable
 * Nút thu nhỏ khi nhấn. Chi tiết quan trọng: dùng SPRING chứ không TIMING —
 * ngón tay đang chạm vào nó, nên nó phải có vật lý. Và scale chỉ 0.96, không
 * phải 0.9: quá nhiều làm nút trông như bị hỏng.
 */
export function PressableScale({
  onPress,
  children,
  style,
  hapticOnPress = "selection",
  disabled,
  accessibilityLabel,
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hapticOnPress?: "none" | "selection" | "light" | "medium";
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const m = useMotionConfig();
  const scale = useSharedValue(1);

  // Độ mờ khi bị khoá PHẢI tính trong worklet này, không thể để người gọi truyền
  // qua `style`. Lý do: `animStyle` đứng SAU `style` trong mảng ở dưới, nên mọi
  // `opacity` người gọi đặt đều bị nó ghi đè. Trước đây nó ghi đè bằng hằng số 1
  // ⇒ nút đang `disabled` vẫn hiện rực rỡ y như nút bấm được. Người dùng bấm,
  // không có gì xảy ra, và không có gì giải thích vì sao.
  const dim = useSharedValue(disabled ? DISABLED_OPACITY : 1);
  useEffect(() => {
    dim.value = withTiming(disabled ? DISABLED_OPACITY : 1, { duration: 120 });
  }, [disabled, dim]);

  const animStyle = useAnimatedStyle(() => ({
    transform: m.allowTransform ? [{ scale: scale.value }] : [],
    opacity: m.allowTransform ? dim.value : dim.value * (scale.value < 1 ? 0.7 : 1),
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPressIn={() => {
        scale.value = withSpring(0.96, m.spring("press"));
      }}
      onPressOut={() => {
        scale.value = withSpring(1, m.spring("press"));
      }}
      onPress={() => {
        if (hapticOnPress !== "none") void haptic[hapticOnPress]();
        onPress();
      }}
      style={[style, animStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

/* ------------------------------------------------------------------- Skeleton
 * KHÔNG dùng spinner cho nội dung có hình dạng biết trước.
 *
 * Spinner nói "đang chờ, không biết bao lâu, không biết cái gì". Skeleton nói
 * "nội dung sẽ trông thế này, ở đúng chỗ này". Kết quả: cảm giác nhanh hơn dù
 * thời gian thật y hệt, và không có cú nhảy layout khi dữ liệu về.
 *
 * Với "giảm chuyển động": bỏ shimmer, giữ khối xám tĩnh.
 */
export function Skeleton({
  width,
  height,
  radius = 8,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const m = useMotionConfig();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (m.reduceMotion) return;
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(shimmer);
  }, [shimmer, m.reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: m.reduceMotion ? 0.35 : interpolate(shimmer.value, [0, 1], [0.25, 0.5]),
  }));

  return (
    <Animated.View
      accessibilityLabel="Đang tải"
      style={[{ width, height, borderRadius: radius, backgroundColor: "#8b949e" }, animStyle, style]}
    />
  );
}

/** Skeleton dựng sẵn theo hình dạng thẻ swipe — dùng khi nạp deck lần đầu. */
export function SwipeCardSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <Skeleton width="100%" height={420} radius={24} />
      <View style={{ marginTop: 14, gap: 8 }}>
        <Skeleton width="55%" height={22} />
        <Skeleton width="40%" height={14} />
        <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={70} height={26} radius={999} />
          ))}
        </View>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------------- Toast
 * Thông báo tạm thời. Ba luật:
 *   1. Không bao giờ chặn thao tác (không phải modal).
 *   2. Lỗi thì phải có nút thử lại — toast báo lỗi mà không cho hành động là
 *      chuyển gánh nặng sang người dùng.
 *   3. Tự biến mất, nhưng lỗi thì lâu hơn thành công (người dùng cần đọc kỹ hơn).
 */
export type ToastKind = "success" | "error" | "info";

export function Toast({
  kind,
  message,
  actionLabel,
  onAction,
  onDismiss,
  visible,
}: {
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  visible: boolean;
}) {
  const m = useMotionConfig();
  const v = useSharedValue(0);
  // React 19 bắt buộc `useRef` phải có giá trị khởi tạo — bản trước cho phép
  // gọi rỗng và ngầm hiểu là `undefined`.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      v.value = withSpring(1, m.spring("sheet"));
      if (kind === "error") void haptic.error();
      const ms = kind === "error" ? 6000 : 3200;
      timer.current = setTimeout(onDismiss, ms);
    } else {
      v.value = withTiming(0, { duration: m.duration("fast"), easing: bezier(EASING.exit) });
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [visible, kind, v, m, onDismiss]);

  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: m.allowTransform ? [{ translateY: interpolate(v.value, [0, 1], [60, 0]) }] : [],
  }));

  const color = kind === "error" ? "#f43f5e" : kind === "success" ? "#34d399" : "#38bdf8";

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      accessibilityLiveRegion="polite"
      style={[styles.toast, { borderLeftColor: color }, style]}
    >
      <Text style={styles.toastText}>{message}</Text>
      {actionLabel && onAction && (
        <PressableScale onPress={onAction} hapticOnPress="light">
          <Text style={[styles.toastAction, { color }]}>{actionLabel}</Text>
        </PressableScale>
      )}
    </Animated.View>
  );
}

/* --------------------------------------------------------------- StepProgress
 * Chỉ báo bước cho onboarding (Figma: Step-1 → Step-4).
 * Bước đang làm rộng hơn các bước khác — người dùng biết mình đang ở đâu mà
 * không cần đọc số.
 */
export function StepProgress({ total, current }: { total: number; current: number }) {
  const m = useMotionConfig();
  return (
    <View style={styles.steps} accessibilityLabel={`Bước ${current + 1} trên ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <StepDot key={i} active={i === current} done={i < current} duration={m.duration("base")} />
      ))}
    </View>
  );
}

function StepDot({ active, done, duration }: { active: boolean; done: boolean; duration: number }) {
  const w = useSharedValue(active ? 28 : 8);
  useEffect(() => {
    w.value = withTiming(active ? 28 : 8, { duration, easing: bezier(EASING.standard) });
  }, [active, w, duration]);
  const style = useAnimatedStyle(() => ({ width: w.value }));
  return (
    <Animated.View
      style={[styles.stepDot, { backgroundColor: active || done ? "#f43f5e" : "#30363d" }, style]}
    />
  );
}

/* ----------------------------------------------------------- ListEnter
 * Bọc các phần tử danh sách để chúng hiện so le. Dùng `staggerDelay` — bão hoà
 * ở 240ms, nên phần tử thứ 30 KHÔNG phải chờ 1,5 giây.
 */
export function ListEnter({ index, children }: { index: number; children: React.ReactNode }) {
  const m = useMotionConfig();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      staggerDelay(index),
      withTiming(1, { duration: m.duration("base"), easing: bezier(EASING.enter) }),
    );
  }, [v, index, m]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: m.allowTransform ? [{ translateY: interpolate(v.value, [0, 1], [14, 0]) }] : [],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------- Shake
 * Rung ngang khi nhập sai (OTP, mật khẩu). Dùng RẤT tiết chế — chỉ cho lỗi
 * người dùng có thể sửa ngay tại chỗ.
 */
export function useShake() {
  const m = useMotionConfig();
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: m.allowTransform ? [{ translateX: x.value }] : [],
  }));
  const shake = () => {
    void haptic.error();
    if (!m.allowTransform) return;
    x.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  };
  return { style, shake };
}

const styles = StyleSheet.create({
  skeletonCard: { paddingHorizontal: 16 },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#161b22",
    borderRadius: 12,
    borderLeftWidth: 3,
    padding: 14,
  },
  toastText: { color: "#e6edf3", fontSize: 14, flex: 1 },
  toastAction: { fontSize: 14, fontWeight: "700" },
  steps: { flexDirection: "row", gap: 6, alignItems: "center" },
  stepDot: { height: 8, borderRadius: 4 },
});

