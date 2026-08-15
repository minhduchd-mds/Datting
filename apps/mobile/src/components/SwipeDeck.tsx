/**
 * SwipeDeck V2 — giữ nguyên bất biến kỹ thuật (UI-thread gesture, optimistic
 * swipe, prefetch, motion tokens) nhưng thay visual language sang Warm Midnight.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Dimensions, Image, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { cardRotation, flingDuration, stampOpacity } from "@datting/core";

import { cardShadow, theme } from "../theme";
import { createThresholdHaptic, haptic } from "../motion/haptics";
import { useMotionConfig } from "../motion/useMotionConfig";
import { PressableScale, SwipeCardSkeleton } from "./Feedback";

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_W * 0.28;
const PREFETCH_WHEN_REMAINING = 8;
const FLING_VELOCITY = 800;

export interface Card {
  userId: string;
  name: string;
  age: number;
  community: string;
  photoUrl: string;
  topics: string[];
  matchPercent?: number;
}

export type SwipeAction = "like" | "pass" | "superlike";

interface Props {
  cards: Card[];
  loading?: boolean;
  onSwipe: (card: Card, action: SwipeAction) => void;
  onNeedMore: () => void;
  onOpenProfile?: (card: Card) => void;
  onEmpty?: () => React.ReactNode;
}

export function SwipeDeck({ cards, loading, onSwipe, onNeedMore, onOpenProfile, onEmpty }: Props) {
  const m = useMotionConfig();
  const [index, setIndex] = useState(0);
  const prefetched = useRef(false);
  const thresholdHaptic = useMemo(() => createThresholdHaptic(250), []);
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const advance = useCallback(
    (action: SwipeAction) => {
      const card = cards[index];
      if (!card) return;
      onSwipe(card, action);
      thresholdHaptic.reset();
      const next = index + 1;
      setIndex(next);
      x.value = 0;
      y.value = 0;
      const remaining = cards.length - next;
      if (remaining <= PREFETCH_WHEN_REMAINING && !prefetched.current) {
        prefetched.current = true;
        onNeedMore();
      }
      if (remaining > PREFETCH_WHEN_REMAINING) prefetched.current = false;
    },
    [cards, index, onSwipe, onNeedMore, thresholdHaptic, x, y],
  );

  const feedbackCross = useCallback(
    (crossed: boolean) => thresholdHaptic.update(crossed, Date.now()),
    [thresholdHaptic],
  );

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
      runOnJS(feedbackCross)(Math.abs(e.translationX) > SWIPE_THRESHOLD);
    })
    .onEnd((e) => {
      const flung = Math.abs(e.velocityX) > FLING_VELOCITY;
      const goRight = x.value > SWIPE_THRESHOLD || (flung && e.velocityX > 0);
      const goLeft = x.value < -SWIPE_THRESHOLD || (flung && e.velocityX < 0);
      if (goRight || goLeft) {
        const target = (goRight ? 1 : -1) * SCREEN_W * 1.5;
        x.value = withTiming(target, { duration: flingDuration(e.velocityX, target - x.value) }, () => {
          runOnJS(advance)(goRight ? "like" : "pass");
        });
      } else {
        x.value = withSpring(0, m.spring("card"));
        y.value = withSpring(0, m.spring("card"));
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: m.allowTransform
      ? [{ translateX: x.value }, { translateY: y.value }, { rotate: `${cardRotation(x.value, SCREEN_W)}deg` }]
      : [{ translateX: x.value }],
  }));

  const behindStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.abs(x.value) / SWIPE_THRESHOLD);
    if (!m.allowTransform) return { opacity: 0.85 };
    return { transform: [{ scale: 0.955 + 0.045 * p }], opacity: 0.72 + 0.28 * p };
  });
  const likeStyle = useAnimatedStyle(() => ({ opacity: stampOpacity(x.value, SWIPE_THRESHOLD, 1) }));
  const passStyle = useAnimatedStyle(() => ({ opacity: stampOpacity(x.value, SWIPE_THRESHOLD, -1) }));

  if (loading) return <SwipeCardSkeleton />;

  const top = cards[index];
  const behind = cards[index + 1];
  if (!top) {
    return (
      <View style={styles.empty}>
        {onEmpty?.() ?? <Text style={styles.emptyText}>Chưa có gợi ý mới. Quay lại sau nhé!</Text>}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {behind && (
        <Animated.View style={[styles.card, styles.behind, behindStyle]}>
          <CardFace card={behind} />
        </Animated.View>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.card, topStyle]}
          accessibilityLabel={`${top.name}, ${top.age} tuổi, ${top.community}`}
        >
          <CardFace card={top} />
          <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]}>
            <Text style={styles.stampLikeText}>KẾT NỐI</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.stampPass, passStyle]}>
            <Text style={styles.stampPassText}>BỎ QUA</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {onOpenProfile && (
        <PressableScale
          style={styles.profileCta}
          onPress={() => onOpenProfile(top)}
          hapticOnPress="selection"
          accessibilityLabel={`Xem hồ sơ đầy đủ của ${top.name}`}
        >
          <Text style={styles.profileCtaText}>Xem hồ sơ đầy đủ</Text>
          <Text style={styles.profileCtaArrow}>⌃</Text>
        </PressableScale>
      )}

      <View style={styles.actions}>
        <ActionButton icon="✕" label="Bỏ qua" onPress={() => { void haptic.light(); advance("pass"); }} />
        <ActionButton icon="♥" label="Kết nối" primary onPress={() => { void haptic.medium(); advance("like"); }} />
      </View>
      <Text style={styles.hint}>Vuốt để quyết định · mở hồ sơ để hiểu thêm</Text>
    </View>
  );
}

function CardFace({ card }: { card: Card }) {
  return (
    <>
      <Image source={{ uri: card.photoUrl }} style={styles.photo} resizeMode="cover" />
      <View style={styles.photoTone} pointerEvents="none" />
      <View style={styles.topLabel}>
        <Text style={styles.topLabelText}>DÀNH CHO BẠN</Text>
      </View>
      {card.matchPercent !== undefined && (
        <View style={styles.badge}>
          <Text style={styles.badgeStar}>✦</Text>
          <Text style={styles.badgeText}>{card.matchPercent}% phù hợp</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name}>{card.name}, {card.age}</Text>
        <Text style={styles.community}>{card.community}</Text>
        <View style={styles.topics}>
          {card.topics.slice(0, 3).map((t) => (
            <View key={t} style={styles.topic}>
              <Text style={styles.topicText}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

function ActionButton({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <PressableScale
      style={[styles.actionBtn, primary ? styles.actionBtnPrimary : styles.actionBtnGhost]}
      onPress={onPress}
      hapticOnPress={primary ? "light" : "selection"}
      accessibilityLabel={label}
    >
      <Text style={[styles.actionIcon, primary && styles.actionIconPrimary]}>{icon}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    ...cardShadow,
    position: "absolute",
    top: 8,
    width: SCREEN_W - 28,
    height: "73%",
    borderRadius: theme.radius.xl,
    overflow: "hidden",
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  behind: { zIndex: -1, top: 18 },
  photo: { ...StyleSheet.absoluteFill },
  photoTone: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.12)" },
  topLabel: { position: "absolute", top: 18, left: 18, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: "rgba(10,10,12,0.54)" },
  topLabelText: { color: "rgba(255,255,255,0.86)", fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  badge: { position: "absolute", top: 18, right: 18, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(10,10,12,0.64)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: theme.radius.pill, paddingHorizontal: 11, paddingVertical: 7 },
  badgeStar: { color: theme.color.coral, fontSize: 12 },
  badgeText: { color: theme.color.white, fontSize: 11, fontWeight: "800" },
  info: { position: "absolute", left: 20, right: 20, bottom: 26 },
  name: { color: theme.color.white, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.5 },
  community: { color: "rgba(255,255,255,0.84)", fontSize: 13, marginTop: 4, fontWeight: "600" },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  topic: { backgroundColor: "rgba(13,13,15,0.56)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: theme.radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  topicText: { color: theme.color.white, fontSize: 11, fontWeight: "650" },
  stamp: { position: "absolute", top: 70, borderWidth: 2, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "rgba(11,11,13,0.46)" },
  stampLike: { left: 24, borderColor: theme.color.success, transform: [{ rotate: "-12deg" }] },
  stampPass: { right: 24, borderColor: theme.color.danger, transform: [{ rotate: "12deg" }] },
  stampLikeText: { color: theme.color.success, fontWeight: "900", fontSize: 17 },
  stampPassText: { color: theme.color.danger, fontWeight: "900", fontSize: 17 },
  profileCta: { position: "absolute", bottom: 124, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 15, paddingVertical: 9, borderRadius: theme.radius.pill, backgroundColor: theme.color.glass, borderWidth: 1, borderColor: theme.color.borderStrong },
  profileCtaText: { color: theme.color.text, fontSize: 12, fontWeight: "750" },
  profileCtaArrow: { color: theme.color.primary, fontSize: 15, fontWeight: "900" },
  actions: { position: "absolute", bottom: 46, flexDirection: "row", gap: 18, alignItems: "center" },
  actionBtn: { alignItems: "center", justifyContent: "center", ...cardShadow },
  actionBtnGhost: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surfaceElevated },
  actionBtnPrimary: { width: 68, height: 68, borderRadius: 34, backgroundColor: theme.color.primary },
  actionIcon: { color: theme.color.textMuted, fontSize: 23, lineHeight: 27, includeFontPadding: false, textAlign: "center" },
  actionIconPrimary: { color: theme.color.white, fontSize: 29, lineHeight: 33 },
  hint: { position: "absolute", bottom: 10, color: theme.color.textSoft, fontSize: 11 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyText: { color: theme.color.textMuted, textAlign: "center" },
});
