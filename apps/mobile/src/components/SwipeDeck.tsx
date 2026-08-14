/**
 * SwipeDeck — thẻ vuốt cho màn "Trang chủ" trong Figma.
 *
 * Stack: React Native 0.86 (New Architecture, Hermes V1) + Expo SDK 57
 *        react-native-reanimated 4.x + react-native-gesture-handler
 *
 * Bốn quyết định kỹ thuật đáng chú ý:
 *
 * 1. TOÀN BỘ cử chỉ chạy trên UI thread (worklet). Không có một lần đi qua
 *    JS bridge nào trong lúc kéo thẻ — đây là điều kiện để đạt 60/120fps.
 *    Reanimated 4 đã tách worklets thành package riêng (react-native-worklets),
 *    đó là cạm bẫy nâng cấp chính khi lên từ Reanimated 3.
 *
 * 2. LẠC QUAN (optimistic): thẻ bay đi NGAY, request đi sau. Nếu request lỗi,
 *    ta không hoàn tác thẻ (trải nghiệm tệ) mà đưa vào hàng đợi gửi lại — swipe
 *    là append-only nên gửi lại an toàn.
 *
 * 3. PREFETCH: nạp lô mới khi còn ≤ 8 thẻ, không đợi hết deck. Người dùng
 *    không bao giờ nhìn thấy spinner giữa hai lượt vuốt.
 *
 * 4. MỌI CON SỐ HIỆU ỨNG ĐẾN TỪ @datting/core. Không có `withTiming(300)` hardcode
 *    ở đây — thời lượng, lò xo, độ xoay, độ mờ của tem đều là hàm đã được test.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Dimensions, StyleSheet, Text, View, Image } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { cardRotation, stampOpacity, flingDuration } from "@datting/core";
import { useMotionConfig } from "../motion/useMotionConfig";
import { createThresholdHaptic, haptic } from "../motion/haptics";
import { PressableScale, SwipeCardSkeleton } from "./Feedback";

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_W * 0.28;
const PREFETCH_WHEN_REMAINING = 8;
const FLING_VELOCITY = 800;

export interface Card {
  userId: string;
  name: string;
  age: number;
  /** Khu vực hiển thị trên thẻ ("Cầu Giấy · cách 3 km"). KHÔNG bao giờ là địa chỉ. */
  community: string;
  photoUrl: string;
  topics: string[];
  /** Điểm phù hợp tổng, hiển thị badge (Figma: 80%). */
  matchPercent?: number;
}

export type SwipeAction = "like" | "pass" | "superlike";

interface Props {
  cards: Card[];
  loading?: boolean;
  onSwipe: (card: Card, action: SwipeAction) => void;
  onNeedMore: () => void;
  onEmpty?: () => React.ReactNode;
}

export function SwipeDeck({ cards, loading, onSwipe, onNeedMore, onEmpty }: Props) {
  const m = useMotionConfig();
  const [index, setIndex] = useState(0);
  const prefetched = useRef(false);
  // Cổng chống rung liên tiếp: thẻ dao động quanh ngưỡng gọi hàm này mỗi frame.
  const thresholdHaptic = useMemo(() => createThresholdHaptic(250), []);

  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const advance = useCallback(
    (action: SwipeAction) => {
      const card = cards[index];
      if (!card) return;
      onSwipe(card, action); // lạc quan: gọi ngay, không chờ mạng
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
    [cards, index, onSwipe, onNeedMore, x, y, thresholdHaptic],
  );

  const feedbackCross = useCallback(
    (crossed: boolean) => {
      thresholdHaptic.update(crossed, Date.now());
    },
    [thresholdHaptic],
  );

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
      // Rung nhẹ ĐÚNG MỘT LẦN khi vượt ngưỡng — báo "thả ra là xong".
      runOnJS(feedbackCross)(Math.abs(e.translationX) > SWIPE_THRESHOLD);
    })
    .onEnd((e) => {
      const flung = Math.abs(e.velocityX) > FLING_VELOCITY;
      const goRight = x.value > SWIPE_THRESHOLD || (flung && e.velocityX > 0);
      const goLeft = x.value < -SWIPE_THRESHOLD || (flung && e.velocityX < 0);

      if (goRight || goLeft) {
        const target = (goRight ? 1 : -1) * SCREEN_W * 1.5;
        // Vuốt càng mạnh, thẻ bay càng nhanh — hàm này đã được test.
        const duration = flingDuration(e.velocityX, target - x.value);
        x.value = withTiming(target, { duration }, () => {
          runOnJS(advance)(goRight ? "like" : "pass");
        });
      } else {
        // Quay về bằng LÒ XO, không phải timing: ngón tay vừa buông ra, chuyển
        // động phải mang theo vận tốc đó.
        x.value = withSpring(0, m.spring("card"));
        y.value = withSpring(0, m.spring("card"));
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: m.allowTransform
      ? [
          { translateX: x.value },
          { translateY: y.value },
          { rotate: `${cardRotation(x.value, SCREEN_W)}deg` },
        ]
      : [{ translateX: x.value }],
  }));

  // Thẻ dưới lớn dần lên khi thẻ trên bị kéo đi — tạo cảm giác chồng thẻ thật.
  const behindStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.abs(x.value) / SWIPE_THRESHOLD);
    if (!m.allowTransform) return { opacity: 0.85 };
    return { transform: [{ scale: 0.94 + 0.06 * p }], opacity: 0.8 + 0.2 * p };
  });

  const likeStyle = useAnimatedStyle(() => ({
    opacity: stampOpacity(x.value, SWIPE_THRESHOLD, 1),
  }));
  const passStyle = useAnimatedStyle(() => ({
    opacity: stampOpacity(x.value, SWIPE_THRESHOLD, -1),
  }));

  if (loading) return <SwipeCardSkeleton />;

  const top = cards[index];
  const behind = cards[index + 1];

  if (!top) {
    return (
      <View style={styles.empty}>
        {onEmpty?.() ?? (
          <Text style={styles.emptyText}>Chưa có gợi ý mới. Quay lại sau nhé!</Text>
        )}
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
          accessibilityActions={[
            { name: "activate", label: "Xem hồ sơ" },
            { name: "magicTap", label: "Kết nối" },
          ]}
        >
          <CardFace card={top} />
          <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]}>
            <Text style={styles.stampText}>KẾT NỐI</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.stampPass, passStyle]}>
            <Text style={styles.stampText}>BỎ QUA</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Nút bấm là BẮT BUỘC, không phải tuỳ chọn: người dùng dùng một tay,
          người bị hạn chế vận động, và VoiceOver đều không vuốt được. */}
      <View style={styles.actions}>
        <ActionButton icon="✕" label="Bỏ qua" onPress={() => { void haptic.light(); advance("pass"); }} />
        <ActionButton icon="♥" label="Kết nối" primary onPress={() => { void haptic.medium(); advance("like"); }} />
      </View>

      <Text style={styles.hint}>Vuốt trái để bỏ qua, vuốt phải để kết nối</Text>
    </View>
  );
}

/**
 * Nút tròn có ICON. `label` không vẽ ra màn hình — nó là nhãn trợ năng.
 *
 * ─── Vì sao icon vẫn phải có `label` ──────────────────────────────────────
 * TalkBack/VoiceOver đọc ký tự chứ không đọc ý nghĩa: `✕` thành "dấu nhân",
 * `♥` thành "trái tim đen". Người dùng màn hình đọc sẽ nghe "dấu nhân, nút" và
 * không biết nó bỏ qua hồ sơ. `accessibilityLabel` ghi đè phần đọc đó bằng
 * đúng việc mà nút làm. Bỏ nhãn đi là bỏ luôn nhóm người dùng này.
 *
 * ─── Vì sao ký tự chứ không icon font ────────────────────────────────────
 * Cùng lý do với thanh tab (xem app/(tabs)/_layout.tsx): `@expo/vector-icons`
 * chưa có trong workspace, kéo về chỉ để lấy hai cái hình là thêm phụ thuộc và
 * thêm cân nặng cho bản build.
 *
 * ─── Vì sao hai nút KHÔNG bằng nhau ──────────────────────────────────────
 * 68 với 60: thao tác chính phải to hơn thao tác phụ thì tay mới tìm đúng nút
 * khi không nhìn. Cả hai đều vượt sàn chạm 44pt (Apple HIG) / 48dp (Material).
 *
 * `onPress` nằm ở KHỐI, không ở `<Text>` — đặt ở `<Text>` thì vùng chạm co lại
 * đúng bằng khung chữ và cả viên nút tròn trở thành vùng chết.
 */
function ActionButton({
  icon, label, onPress, primary,
}: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <PressableScale
      style={[styles.actionBtn, primary ? styles.actionBtnPrimary : styles.actionBtnGhost]}
      onPress={onPress}
      hapticOnPress={primary ? "light" : "selection"}
      accessibilityLabel={label}
    >
      <Text style={[styles.actionIcon, primary && styles.actionIconPrimary]}>
        {icon}
      </Text>
    </PressableScale>
  );
}

function CardFace({ card }: { card: Card }) {
  return (
    <>
      <Image source={{ uri: card.photoUrl }} style={styles.photo} resizeMode="cover" />
      {card.matchPercent !== undefined && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{card.matchPercent}%</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name}>
          {card.name} {card.age}
        </Text>
        <Text style={styles.community}>{card.community}</Text>
        <View style={styles.topics}>
          {card.topics.slice(0, 4).map((t) => (
            <View key={t} style={styles.topic}>
              <Text style={styles.topicText}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    position: "absolute",
    top: 24,
    width: SCREEN_W - 32,
    height: "72%",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  behind: { zIndex: -1 },
  // RN 0.86 bỏ `absoluteFillObject` khỏi type; `absoluteFill` giờ là object
  // thuần nên trải ra được y hệt.
  photo: { ...StyleSheet.absoluteFill },
  info: { position: "absolute", left: 20, right: 20, bottom: 24 },
  name: { color: "#fff", fontSize: 24, fontWeight: "700" },
  community: { color: "rgba(255,255,255,.85)", fontSize: 14, marginTop: 2 },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  topic: {
    backgroundColor: "rgba(255,255,255,.18)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  topicText: { color: "#fff", fontSize: 12 },
  badge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,.55)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: { color: "#fff", fontWeight: "700" },
  stamp: {
    position: "absolute",
    top: 40,
    borderWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stampLike: { left: 24, borderColor: "#34d399", transform: [{ rotate: "-14deg" }] },
  stampPass: { right: 24, borderColor: "#f43f5e", transform: [{ rotate: "14deg" }] },
  stampText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  actions: {
    position: "absolute",
    bottom: 52,
    flexDirection: "row",
    gap: 20,
    // Hai nút khác cỡ (60 và 68) nên phải căn theo TÂM. Để mặc định
    // `stretch` thì nút nhỏ bị kéo cao bằng nút lớn và mất hình tròn.
    alignItems: "center",
  },
  actionBtn: { alignItems: "center", justifyContent: "center" },
  actionBtnGhost: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 1, borderColor: "#30363d", backgroundColor: "#161b22",
  },
  actionBtnPrimary: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: "#f43f5e",
  },
  // `includeFontPadding: false` (Android) bỏ khoảng đệm mà font để dành cho dấu
  // phụ tiếng Việt. Không tắt thì ký tự bị đẩy lệch lên trong nút tròn — thấy rõ
  // ở `♥` vì nó không có phần chữ nào chạm đường cơ sở để mắt lấy làm mốc.
  actionIcon: {
    color: "#8b949e", fontSize: 24, lineHeight: 28,
    includeFontPadding: false, textAlign: "center",
  },
  actionIconPrimary: { color: "#fff", fontSize: 30, lineHeight: 34 },
  hint: { position: "absolute", bottom: 20, color: "#8b949e", fontSize: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#8b949e" },
});
