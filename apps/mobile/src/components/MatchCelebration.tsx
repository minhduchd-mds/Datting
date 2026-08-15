/**
 * MatchCelebration — màn "It's a Match" (Figma `22135:44745`).
 *
 * Đây là khoảnh khắc quan trọng nhất của toàn bộ sản phẩm. Mọi thứ khác trong
 * app đều phục vụ cho 2 giây này. Vì thế nó là chỗ DUY NHẤT được phép dùng
 * `SPRING.celebrate` (nảy rõ) và `DURATION.celebration`.
 *
 * Trình tự dàn dựng (chủ ý, không ngẫu nhiên):
 *
 *   0ms    nền tối dần + haptic success        ← xác nhận "có chuyện xảy ra"
 *   80ms   hai avatar bay vào từ hai bên       ← kể chuyện: hai người gặp nhau
 *   340ms  trái tim + vòng % nảy lên           ← phần thưởng
 *   520ms  ba thanh breakdown chạy số          ← LÝ DO (đây là điểm khác biệt)
 *   700ms+ "điểm chung nổi bật" hiện so le     ← bằng chứng cụ thể
 *   1100ms nút CTA trượt lên                   ← chỉ mời hành động SAU khi đã kể xong
 *
 * Nút CTA xuất hiện CUỐI CÙNG là có lý do: nếu hiện ngay từ đầu, người dùng bấm
 * luôn và không bao giờ đọc phần giải thích — thứ tạo ra niềm tin vào thuật toán.
 */
import React, { useEffect } from "react";
import { StyleSheet, Text, View, Image, Pressable } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  interpolate,
  type SharedValue,
} from "react-native-reanimated";
import { DURATION, EASING, SPRING, staggerDelay } from "@datting/core";
import { useMotionConfig } from "../motion/useMotionConfig";
import { haptic } from "../motion/haptics";
import { C } from "../theme";

export interface CommonPoint {
  label: string;
  value: string;
}

export interface MatchCelebrationProps {
  mePhotoUrl: string;
  themPhotoUrl: string;
  themName: string;
  matchPercent: number;
  breakdown: { interest: number; personality: number; location: number };
  commonPoints: CommonPoint[];
  onViewProfile: () => void;
  onClose: () => void;
}

const bezier = (c: readonly [number, number, number, number]) =>
  Easing.bezier(c[0], c[1], c[2], c[3]);

export function MatchCelebration({
  mePhotoUrl,
  themPhotoUrl,
  themName,
  matchPercent,
  breakdown,
  commonPoints,
  onViewProfile,
  onClose,
}: MatchCelebrationProps) {
  const m = useMotionConfig();

  const backdrop = useSharedValue(0);
  const leftX = useSharedValue(-160);
  const rightX = useSharedValue(160);
  const heart = useSharedValue(0);
  const bars = useSharedValue(0);
  const cta = useSharedValue(0);

  useEffect(() => {
    // Haptic success: khoảnh khắc duy nhất trong app xứng đáng với nó.
    void haptic.success();

    backdrop.value = withTiming(1, {
      duration: m.duration("base"),
      easing: bezier(EASING.enter),
    });

    // Giảm chuyển động: bỏ đường bay ngang, chỉ fade — nhưng GIỮ trình tự thời
    // gian để câu chuyện vẫn được kể đúng nhịp.
    if (m.allowTransform) {
      leftX.value = withDelay(80, withSpring(0, m.spring("celebrate")));
      rightX.value = withDelay(80, withSpring(0, m.spring("celebrate")));
      heart.value = withDelay(
        340,
        withSequence(
          withSpring(1.12, m.spring("celebrate")),
          withSpring(1, { damping: 14, stiffness: 220, mass: 1 }),
        ),
      );
    } else {
      leftX.value = 0;
      rightX.value = 0;
      heart.value = withDelay(340, withTiming(1, { duration: m.duration("fast") }));
    }

    bars.value = withDelay(
      520,
      withTiming(1, { duration: m.duration("celebration"), easing: bezier(EASING.enter) }),
    );
    cta.value = withDelay(
      1100,
      withTiming(1, { duration: m.duration("base"), easing: bezier(EASING.enter) }),
    );
  }, [backdrop, leftX, rightX, heart, bars, cta, m]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(leftX.value, [-160, 0], [0, 1]),
    transform: [{ translateX: leftX.value }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rightX.value, [160, 0], [0, 1]),
    transform: [{ translateX: rightX.value }],
  }));
  const heartStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, heart.value),
    transform: [{ scale: heart.value }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: cta.value,
    transform: [{ translateY: interpolate(cta.value, [0, 1], [24, 0]) }],
  }));

  return (
    <Animated.View style={[styles.root, backdropStyle]}>
      <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Đóng" hitSlop={12}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>

      <Text style={styles.title}>Kết nối yêu thương</Text>

      <View style={styles.photos}>
        <Animated.View style={leftStyle}>
          <Image source={{ uri: mePhotoUrl }} style={styles.avatar} />
        </Animated.View>
        <Animated.View style={[styles.heart, heartStyle]}>
          <Text style={styles.percent}>{matchPercent}%</Text>
          <Text style={styles.percentLabel}>phù hợp</Text>
        </Animated.View>
        <Animated.View style={rightStyle}>
          <Image source={{ uri: themPhotoUrl }} style={styles.avatar} />
        </Animated.View>
      </View>

      <Text style={styles.name}>{themName}</Text>

      <View style={styles.breakdown}>
        <MeterRow label="Sở thích" value={breakdown.interest} progress={bars} index={0} />
        <MeterRow label="Tính cách" value={breakdown.personality} progress={bars} index={1} />
        <MeterRow label="Vị trí" value={breakdown.location} progress={bars} index={2} />
      </View>

      <Text style={styles.commonHeader}>
        Hai bạn có {commonPoints.length} điểm chung nổi bật
      </Text>
      {commonPoints.map((p, i) => (
        <FadeInRow key={p.label} index={i} baseDelay={700} reduceMotion={m.reduceMotion}>
          <View style={styles.point}>
            <Text style={styles.pointLabel}>{p.label}</Text>
            <Text style={styles.pointValue}>{p.value}</Text>
          </View>
        </FadeInRow>
      ))}

      <Animated.View style={ctaStyle}>
        <Pressable style={styles.cta} onPress={onViewProfile} accessibilityRole="button">
          <Text style={styles.ctaText}>Xem hồ sơ chi tiết</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Thanh đo có số chạy theo.
 * Con số PHẢI chạy cùng thanh — nếu số hiện sẵn ở giá trị cuối, thanh chạy trở
 * thành trang trí vô nghĩa và người dùng cảm nhận được sự giả tạo đó.
 */
function MeterRow({
  label,
  value,
  progress,
  index,
}: {
  label: string;
  value: number;
  // Reanimated 4 xuất `SharedValue` như một type ĐỘC LẬP, không còn nằm trong
  // namespace `Animated` như bản 2/3.
  progress: SharedValue<number>;
  index: number;
}) {
  const delayRatio = index * 0.12; // lệch pha giữa 3 thanh, trong cùng một timeline
  const fillStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (progress.value - delayRatio) / (1 - delayRatio)));
    return { width: `${p * value}%` };
  });
  const [shown, setShown] = React.useState(0);
  useEffect(() => {
    // Số chạy trên JS thread — chỉ 3 phần tử, chi phí không đáng kể.
    let raf = 0;
    const start = Date.now();
    const total = DURATION.celebration;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start - index * 100) / total);
      setShown(Math.round(Math.max(0, t) * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, index]);

  return (
    <View style={styles.meterRow} accessibilityLabel={`${label} ${value} phần trăm`}>
      <Text style={styles.meterLabel}>{label}</Text>
      <View style={styles.meterTrack}>
        <Animated.View style={[styles.meterFill, fillStyle]} />
      </View>
      <Text style={styles.meterValue}>{shown}%</Text>
    </View>
  );
}

/** Hàng hiện dần so le — dùng `staggerDelay` (bão hoà, không nhân tuyến tính). */
function FadeInRow({
  index,
  baseDelay,
  reduceMotion,
  children,
}: {
  index: number;
  baseDelay: number;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      baseDelay + staggerDelay(index, 60, 300),
      withTiming(1, { duration: reduceMotion ? DURATION.fast : DURATION.base }),
    );
  }, [v, index, baseDelay, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: reduceMotion ? [] : [{ translateY: interpolate(v.value, [0, 1], [12, 0]) }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, paddingTop: 64 },
  close: { position: "absolute", top: 56, right: 20, zIndex: 10 },
  closeText: { color: C.textMuted, fontSize: 28, lineHeight: 28 },
  title: { color: C.accent, fontSize: 15, fontWeight: "700", textAlign: "center", letterSpacing: 1 },
  photos: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 28, gap: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: C.accent },
  heart: { alignItems: "center", justifyContent: "center", width: 84, height: 84, borderRadius: 42, backgroundColor: C.accent },
  percent: { color: C.textOn, fontSize: 22, fontWeight: "800" },
  percentLabel: { color: "rgba(255,255,255,.8)", fontSize: 11 },
  name: { color: C.text, fontSize: 20, fontWeight: "700", textAlign: "center", marginTop: 16 },
  breakdown: { marginTop: 24, gap: 8 },
  meterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meterLabel: { color: C.textMuted, fontSize: 13, width: 76 },
  meterTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: C.borderSoft, overflow: "hidden" },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: C.success },
  meterValue: { color: C.text, fontSize: 13, width: 42, textAlign: "right" },
  commonHeader: { color: C.text, fontSize: 15, fontWeight: "600", marginTop: 24, marginBottom: 8 },
  point: { backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 8 },
  pointLabel: { color: C.textMuted, fontSize: 12 },
  pointValue: { color: C.text, fontSize: 15, marginTop: 2 },
  cta: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 16, alignItems: "center", marginTop: 20 },
  ctaText: { color: C.textOn, fontSize: 16, fontWeight: "700" },
});
