/**
 * Hồ sơ đầy đủ.
 *
 * ─── Vì sao là một ROUTE chứ không phải modal trong SwipeDeck ─────────────
 * Nó phải mở được bằng deep link (`datting://profile/1234`) — thông báo và chia
 * sẻ đều cần thế. Và thẻ vuốt đang giữ trạng thái cử chỉ; nhét thêm một lớp
 * hiển thị vào đó là cách chắc chắn nhất để một cú vuốt trên màn hồ sơ đi xuyên
 * xuống thẻ bên dưới.
 *
 * Tên file KHÔNG nằm trong route group và KHÔNG phải `index` — xem ghi chú dài
 * ở `STAGE_ROUTE` (src/session.ts) về hai cái bẫy của Expo Router.
 *
 * ─── Ba quyết định thiết kế ───────────────────────────────────────────────
 *
 * 1. TÊN ĐÈ LÊN ẢNH, ĐÚNG VỊ TRÍ NHƯ TRÊN THẺ VUỐT. Thẻ vừa chạm nở ra thành
 *    màn này; đặt tên ở chỗ khác là bắt mắt đi tìm lại thứ nó vừa đọc xong.
 *
 * 2. "VÌ SAO HỢP NHAU" LÀ PHẦN CHÍNH, KHÔNG PHẢI HUY HIỆU %. Repo này đã tách
 *    rõ: p_match để XẾP HẠNG, breakdown để HIỂN THỊ (xem displayPercent trong
 *    api.ts). Một con số 80% không nói được gì; ba vạch có tên thì nói được.
 *    Phần này TỰ ẨN khi mở bằng deep link, vì lúc đó không có ngữ cảnh deck —
 *    thà thiếu còn hơn bịa ra một con số.
 *
 * 3. HÀNH ĐỘNG NẰM CUỐI MÀN. Người ta quyết định trong lúc đọc; bắt quay lại
 *    deck rồi mới được vuốt là thêm một bước không có lý do gì.
 *
 * Workspace không có `expo-font`, nên cá tính chữ đến từ thang cỡ và giãn chữ:
 * nhãn mục viết hoa giãn rộng, tên cỡ lớn giãn âm.
 */
import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { EASING, staggerDelay } from "@datting/core";

import { api } from "../../src/api";
import type { Card, SwipeAction } from "../../src/components/SwipeDeck";
import { PressableScale, Skeleton } from "../../src/components/Feedback";
import { ErrorState } from "../../src/screens/SocialScreens";
import { haptic } from "../../src/motion/haptics";
import { useMotionConfig } from "../../src/motion/useMotionConfig";
import { queueSwipe } from "../../src/swipeQueue";

const bezier = (c: readonly [number, number, number, number]) =>
  Easing.bezier(c[0], c[1], c[2], c[3]);

export default function Profile() {
  const { userId, interest, personality, location } = useLocalSearchParams<{
    userId: string;
    interest?: string;
    personality?: string;
    location?: string;
  }>();

  const [card, setCard] = useState<Card | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    api
      .fetchProfile(userId)
      .then((c) => {
        if (!alive) return;
        setCard(c);
        // `null` = không còn hiển thị được (bị chặn, đã xoá, ảnh chưa duyệt).
        // Đó là câu trả lời hợp lệ chứ không phải sự cố — nhưng với người dùng
        // thì cả hai đều là "không xem được", nên dùng chung một màn.
        setState(c ? "ready" : "failed");
      })
      .catch(() => alive && setState("failed"));
    return () => {
      alive = false;
    };
  }, [userId]);

  // Vuốt từ màn hồ sơ: ghi nhận rồi quay về deck ngay. Không chờ mạng — cùng
  // nguyên tắc lạc quan với thẻ vuốt.
  const act = useCallback(
    (action: SwipeAction) => {
      void (action === "pass" ? haptic.light() : haptic.medium());
      queueSwipe(userId, action);
      router.back();
    },
    [userId],
  );

  if (state === "failed") {
    return <ErrorState onRetry={() => router.back()} />;
  }

  const scores =
    interest && personality && location
      ? [
          { label: "Sở thích", value: Number(interest) },
          { label: "Tính cách", value: Number(personality) },
          { label: "Khoảng cách", value: Number(location) },
        ]
      : null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {state === "loading" || !card ? (
          <>
            <Skeleton width="100%" height={520} radius={0} />
            <View style={styles.body}>
              <Skeleton width="55%" height={30} />
              <View style={{ height: 10 }} />
              <Skeleton width="40%" height={16} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.hero}>
              <Image source={{ uri: card.photoUrl }} style={styles.photo} resizeMode="cover" />
              {/* Dải tối chồng lên đáy ảnh để chữ trắng đọc được trên MỌI ảnh.
                  Không dùng gradient thật vì workspace không có
                  expo-linear-gradient; ba lớp phủ độ mờ tăng dần cho hiệu quả
                  tương đương mà không thêm phụ thuộc. */}
              <View style={[styles.scrim, styles.scrim1]} />
              <View style={[styles.scrim, styles.scrim2]} />
              <View style={[styles.scrim, styles.scrim3]} />
              <View style={styles.heroText}>
                <Text style={styles.name}>
                  {card.name} <Text style={styles.age}>{card.age}</Text>
                </Text>
                <Text style={styles.community}>{card.community}</Text>
              </View>
            </View>

            <View style={styles.body}>
              {scores && (
                <>
                  <Text style={styles.eyebrow}>Vì sao hợp nhau</Text>
                  {scores.map((s, i) => (
                    <ScoreBar key={s.label} label={s.label} value={s.value} index={i} />
                  ))}
                </>
              )}

              {card.topics.length > 0 && (
                <>
                  <Text style={[styles.eyebrow, styles.eyebrowGap]}>Quan tâm</Text>
                  <View style={styles.topics}>
                    {card.topics.map((t) => (
                      <View key={t} style={styles.topic}>
                        <Text style={styles.topicText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {state === "ready" && card && (
        <View style={styles.actions}>
          <PressableScale
            style={[styles.action, styles.actionGhost]}
            onPress={() => act("pass")}
            hapticOnPress="none"
            accessibilityLabel={`Bỏ qua ${card.name}`}
          >
            <Text style={styles.actionGhostText}>Bỏ qua</Text>
          </PressableScale>
          <PressableScale
            style={[styles.action, styles.actionPrimary]}
            onPress={() => act("like")}
            hapticOnPress="none"
            accessibilityLabel={`Kết nối với ${card.name}`}
          >
            <Text style={styles.actionPrimaryText}>Kết nối</Text>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

/**
 * Một vạch đo trong "Vì sao hợp nhau".
 *
 * Animate `scaleX` chứ không `width`: `width` là thuộc tính bố cục, đổi nó là
 * Yoga tính lại cây layout mỗi frame trên JS thread. Gốc biến đổi đặt về mép
 * trái để vạch mọc từ trái sang, không nở ra từ tâm.
 *
 * Ba vạch vào so le bằng `staggerDelay` của @datting/core.
 */
function ScoreBar({ label, value, index }: { label: string; value: number; index: number }) {
  const m = useMotionConfig();
  const p = useSharedValue(0);
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  useEffect(() => {
    if (m.reduceMotion) {
      p.value = 1;
      return;
    }
    p.value = withDelay(
      staggerDelay(index, 90, 260),
      withTiming(1, { duration: m.duration("slow"), easing: bezier(EASING.enter) }),
    );
  }, [p, index, m]);

  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value * (pct / 100) }] }));

  return (
    <View style={styles.scoreRow} accessibilityLabel={`${label} ${pct} trên 100`}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreTrack}>
        <Animated.View style={[styles.scoreFill, fill]} />
      </View>
      <Text style={styles.scoreValue}>{pct}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d0d10" },
  scroll: { paddingBottom: 120 },

  hero: { height: 520, backgroundColor: "#1a1a1a" },
  photo: { ...StyleSheet.absoluteFill },
  scrim: { position: "absolute", left: 0, right: 0, backgroundColor: "#0d0d10" },
  scrim1: { bottom: 0, height: 200, opacity: 0.35 },
  scrim2: { bottom: 0, height: 120, opacity: 0.45 },
  scrim3: { bottom: 0, height: 56, opacity: 0.55 },
  heroText: { position: "absolute", left: 20, right: 20, bottom: 22 },
  // letterSpacing âm ở cỡ lớn: chữ to mà giãn mặc định thì trông rời rạc.
  name: { color: "#fff", fontSize: 32, fontWeight: "800", letterSpacing: -0.6 },
  age: { fontWeight: "300", color: "rgba(255,255,255,.82)" },
  community: { color: "rgba(255,255,255,.72)", fontSize: 15, marginTop: 4 },

  body: { paddingHorizontal: 20, paddingTop: 24 },
  // Nhãn mục: viết hoa + giãn rộng. Đây là cử chỉ chữ duy nhất mang cá tính khi
  // không có font riêng — dùng đúng một kiểu, không biến tấu.
  eyebrow: {
    color: "#6f7681",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  eyebrowGap: { marginTop: 30 },

  scoreRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  scoreLabel: { color: "#8b949e", fontSize: 13, width: 92 },
  scoreTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#23262d",
    overflow: "hidden",
  },
  scoreFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#f43f5e",
    width: "100%",
    transformOrigin: "left",
  },
  scoreValue: {
    color: "#e6edf3",
    fontSize: 13,
    fontWeight: "700",
    width: 34,
    textAlign: "right",
  },

  topics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topic: {
    backgroundColor: "rgba(255,255,255,.08)",
    borderWidth: 1,
    borderColor: "#23262d",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  topicText: { color: "#e6edf3", fontSize: 13 },

  // Thanh hành động DÍNH ĐÁY, không cuộn theo: quyết định xong ở bất kỳ đoạn
  // nào cũng bấm được ngay, không phải cuộn xuống tìm nút.
  actions: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 28,
    flexDirection: "row",
    gap: 12,
  },
  action: { flex: 1, alignItems: "center", paddingVertical: 15, borderRadius: 14 },
  actionGhost: { borderWidth: 1, borderColor: "#30363d", backgroundColor: "#161b22" },
  actionGhostText: { color: "#e6edf3", fontSize: 15, fontWeight: "600" },
  actionPrimary: { backgroundColor: "#f43f5e" },
  actionPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
