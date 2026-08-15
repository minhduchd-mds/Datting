/**
 * Match Celebration V2.
 *
 * Giữ choreography/haptic của bản cũ nhưng bỏ cảm giác dashboard. Khoảnh khắc
 * match chỉ trả lời ba câu: "chuyện gì vừa xảy ra", "vì sao có ý nghĩa" và
 * "tôi nên làm gì tiếp". Breakdown vẫn còn, nhưng lùi xuống thành tín hiệu phụ.
 */
import React, { useEffect } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { EASING } from "@datting/core";

import { haptic } from "../motion/haptics";
import { useMotionConfig } from "../motion/useMotionConfig";
import { theme } from "../theme";

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
  onMessage: () => void;
  onViewProfile: () => void;
  onClose: () => void;
}

const bezier = (c: readonly [number, number, number, number]) => Easing.bezier(c[0], c[1], c[2], c[3]);

export function MatchCelebration({
  mePhotoUrl,
  themPhotoUrl,
  themName,
  matchPercent,
  breakdown,
  commonPoints,
  onMessage,
  onViewProfile,
  onClose,
}: MatchCelebrationProps) {
  const m = useMotionConfig();
  const backdrop = useSharedValue(0);
  const leftX = useSharedValue(-150);
  const rightX = useSharedValue(150);
  const heart = useSharedValue(0);
  const content = useSharedValue(0);
  const cta = useSharedValue(0);

  useEffect(() => {
    void haptic.success();
    backdrop.value = withTiming(1, { duration: m.duration("base"), easing: bezier(EASING.enter) });

    if (m.allowTransform) {
      leftX.value = withDelay(80, withSpring(0, m.spring("celebrate")));
      rightX.value = withDelay(80, withSpring(0, m.spring("celebrate")));
      heart.value = withDelay(
        320,
        withSequence(withSpring(1.12, m.spring("celebrate")), withSpring(1, m.spring("card"))),
      );
    } else {
      leftX.value = 0;
      rightX.value = 0;
      heart.value = withDelay(320, withTiming(1, { duration: m.duration("fast") }));
    }

    content.value = withDelay(520, withTiming(1, { duration: m.duration("base") }));
    cta.value = withDelay(860, withTiming(1, { duration: m.duration("base") }));
  }, [backdrop, leftX, rightX, heart, content, cta, m]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(leftX.value, [-150, 0], [0, 1]),
    transform: m.allowTransform ? [{ translateX: leftX.value }] : [],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rightX.value, [150, 0], [0, 1]),
    transform: m.allowTransform ? [{ translateX: rightX.value }] : [],
  }));
  const heartStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, heart.value),
    transform: [{ scale: heart.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: content.value,
    transform: m.allowTransform ? [{ translateY: interpolate(content.value, [0, 1], [16, 0]) }] : [],
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: cta.value,
    transform: m.allowTransform ? [{ translateY: interpolate(cta.value, [0, 1], [18, 0]) }] : [],
  }));

  return (
    <Animated.View style={[styles.root, backdropStyle]}>
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Đóng" hitSlop={12}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>

      <Text style={styles.eyebrow}>KẾT NỐI MỚI</Text>
      <Text style={styles.title}>Hai bạn đã chọn nhau</Text>
      <Text style={styles.subtitle}>Một kết nối tốt bắt đầu từ một lý do thật để nói chuyện.</Text>

      <View style={styles.photos}>
        <Animated.View style={leftStyle}>
          {mePhotoUrl ? <Image source={{ uri: mePhotoUrl }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarFallbackText}>Bạn</Text></View>}
        </Animated.View>
        <Animated.View style={[styles.score, heartStyle]}>
          <Text style={styles.scoreIcon}>♥</Text>
          <Text style={styles.percent}>{matchPercent}%</Text>
        </Animated.View>
        <Animated.View style={rightStyle}>
          <Image source={{ uri: themPhotoUrl }} style={styles.avatar} />
        </Animated.View>
      </View>

      <Text style={styles.name}>{themName}</Text>

      <Animated.View style={contentStyle}>
        <View style={styles.signalRow}>
          <Signal label="Sở thích" value={breakdown.interest} />
          <Signal label="Tính cách" value={breakdown.personality} />
          <Signal label="Khoảng cách" value={breakdown.location} />
        </View>

        <Text style={styles.commonTitle}>Điểm chung để bắt đầu</Text>
        <View style={styles.commonList}>
          {commonPoints.slice(0, 3).map((point) => (
            <View key={`${point.label}:${point.value}`} style={styles.point}>
              <View style={styles.pointDot} />
              <View style={styles.pointBody}>
                <Text style={styles.pointLabel}>{point.label}</Text>
                <Text style={styles.pointValue}>{point.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[styles.actions, ctaStyle]}>
        <Pressable style={styles.primary} onPress={onMessage} accessibilityRole="button">
          <Text style={styles.primaryText}>Nhắn lời chào</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={onViewProfile} accessibilityRole="button">
          <Text style={styles.secondaryText}>Xem hồ sơ</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function Signal({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.signal}>
      <Text style={styles.signalValue}>{value}%</Text>
      <Text style={styles.signalLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background, paddingHorizontal: 22, paddingTop: 66, overflow: "hidden" },
  glowOne: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(240,98,116,0.12)", top: -80, left: -100 },
  glowTwo: { position: "absolute", width: 240, height: 240, borderRadius: 120, backgroundColor: "rgba(185,167,255,0.08)", bottom: 80, right: -120 },
  close: { position: "absolute", top: 54, right: 20, zIndex: 10, width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  closeText: { color: theme.color.textMuted, fontSize: 30, lineHeight: 32 },
  eyebrow: { color: theme.color.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  title: { color: theme.color.text, fontSize: 28, lineHeight: 34, fontWeight: "900", textAlign: "center", marginTop: 8 },
  subtitle: { color: theme.color.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, paddingHorizontal: 24 },
  photos: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 30, gap: 8 },
  avatar: { width: 94, height: 94, borderRadius: 34, borderWidth: 2, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surface },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarFallbackText: { color: theme.color.textMuted, fontSize: 13, fontWeight: "800" },
  score: { width: 78, height: 78, borderRadius: 39, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary, borderWidth: 4, borderColor: theme.color.background },
  scoreIcon: { color: theme.color.white, fontSize: 13, lineHeight: 14 },
  percent: { color: theme.color.white, fontSize: 20, fontWeight: "900", marginTop: 1 },
  name: { color: theme.color.text, fontSize: 18, fontWeight: "800", textAlign: "center", marginTop: 14 },
  signalRow: { flexDirection: "row", gap: 8, marginTop: 22 },
  signal: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  signalValue: { color: theme.color.text, fontSize: 15, fontWeight: "800" },
  signalLabel: { color: theme.color.textSoft, fontSize: 10, marginTop: 3 },
  commonTitle: { color: theme.color.text, fontSize: 15, fontWeight: "800", marginTop: 20, marginBottom: 8 },
  commonList: { gap: 8 },
  point: { flexDirection: "row", alignItems: "center", gap: 11, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  pointDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.coral },
  pointBody: { flex: 1 },
  pointLabel: { color: theme.color.textSoft, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  pointValue: { color: theme.color.text, fontSize: 13, fontWeight: "700", marginTop: 3 },
  actions: { marginTop: "auto", paddingBottom: 30, gap: 10 },
  primary: { minHeight: 54, borderRadius: theme.radius.pill, backgroundColor: theme.color.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: theme.color.white, fontSize: 15, fontWeight: "900" },
  secondary: { minHeight: 48, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: theme.color.textMuted, fontSize: 14, fontWeight: "700" },
});
