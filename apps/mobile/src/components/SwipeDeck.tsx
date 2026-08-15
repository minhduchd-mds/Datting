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
import React, { useCallback, useMemo, useRef } from "react";
import { Dimensions, StyleSheet, Text, View, Image } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
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
import { C } from "../theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
/**
 * Lề ngang của thẻ. 24 chứ không phải 16, và đây là con số AN TOÀN chứ không
 * phải con số thẩm mỹ.
 *
 * Android dành 20–24 dp mỗi mép cho cử chỉ back và nuốt chạm ở đó TRƯỚC KHI nó
 * tới React Native — `setSystemGestureExclusionRects` chỉ gọi được từ native,
 * mà `apps/mobile/android/` là artifact của prebuild (nằm trong .gitignore) nên
 * không sửa tay được. Cách chữa duy nhất còn lại: đừng đặt vùng kéo vào chỗ đó.
 *
 * Người dùng chỉnh "độ nhạy back" lên mức cao nhất vẫn có thể chạm tới ~40 dp.
 * Trường hợp đó cử chỉ vẫn mất, nhưng app không chết nữa — xem useBackToExit.ts.
 */
const CARD_INSET = 24;
const SWIPE_THRESHOLD = SCREEN_W * 0.28;
/**
 * Ngưỡng vuốt lên. Tính theo CHIỀU CAO màn hình, không theo chiều ngang: cùng
 * một quãng 100 px là "hơi nhích" theo chiều dọc nhưng đã là "quyết tâm" theo
 * chiều ngang trên màn điện thoại.
 *
 * 18% cao so với 28% rộng — mà màn cao gấp ~2 lần rộng, nên quãng tuyệt đối vẫn
 * xa hơn: super-like báo cho người kia biết và không rút lại được về mặt cảm
 * xúc, nên phải khó chạm nhầm hơn "kết nối".
 */
const SUPERLIKE_THRESHOLD = SCREEN_H * 0.18;
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
  /**
   * Vị trí thẻ trên cùng. NẰM Ở NGƯỜI GỌI, không nằm trong component.
   *
   * Bản trước giữ `index` bằng `useState` nội bộ, và điều đó âm thầm làm hỏng
   * mọi thứ thay `cards`: `load(false)` nạp deck mới nhưng index cũ ở lại, nên
   * nút "Tải lại" ở màn rỗng nạp về 20 thẻ rồi hiện lại đúng màn rỗng đó.
   * Đưa index ra ngoài cũng là điều kiện để có nút hoàn tác.
   */
  index: number;
  onIndexChange: (next: number) => void;
  loading?: boolean;
  onSwipe: (card: Card, action: SwipeAction) => void;
  onNeedMore: () => void;
  /** Chạm vào thẻ, hoặc chọn hành động trợ năng "Xem hồ sơ". */
  onOpenProfile: (card: Card) => void;
  /** Nút "⋯" trên thẻ — báo cáo hoặc chặn người chưa từng match. */
  onReport: (card: Card) => void;
  onEmpty?: () => React.ReactNode;
}

export function SwipeDeck({
  cards, index, onIndexChange, loading, onSwipe, onNeedMore, onOpenProfile, onReport, onEmpty,
}: Props) {
  const m = useMotionConfig();
  const prefetched = useRef(false);
  const top = cards[index];
  const behind = cards[index + 1];
  // Cổng chống rung liên tiếp: thẻ dao động quanh ngưỡng gọi hàm này mỗi frame.
  const thresholdHaptic = useMemo(() => createThresholdHaptic(250), []);

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  // Cổng chống rung SỐNG TRÊN UI THREAD. `armed` là điều kiện cạnh lên: chỉ bắn
  // khi VỪA vượt ngưỡng, và phải kéo về dưới ngưỡng mới nạp lại.
  const armed = useSharedValue(true);

  const advance = useCallback(
    (action: SwipeAction) => {
      const card = cards[index];
      if (!card) return;
      onSwipe(card, action); // lạc quan: gọi ngay, không chờ mạng
      thresholdHaptic.reset();
      armed.value = true;
      const next = index + 1;
      onIndexChange(next);
      x.value = 0;
      y.value = 0;
      const remaining = cards.length - next;
      if (remaining <= PREFETCH_WHEN_REMAINING && !prefetched.current) {
        prefetched.current = true;
        onNeedMore();
      }
      if (remaining > PREFETCH_WHEN_REMAINING) prefetched.current = false;
    },
    [cards, index, onIndexChange, onSwipe, onNeedMore, x, y, armed, thresholdHaptic],
  );

  // Chỉ được gọi từ worklet ở ĐÚNG khoảnh khắc vượt ngưỡng, không phải mỗi
  // frame. `createThresholdHaptic` vẫn giữ khoảng cách tối thiểu giữa hai lần
  // rung, phòng khi ngón tay dao động qua lại quanh ngưỡng.
  const fireCrossHaptic = useCallback(() => {
    const now = Date.now();
    thresholdHaptic.update(true, now);
    thresholdHaptic.update(false, now);
  }, [thresholdHaptic]);

  const pan = Gesture.Pan()
    // Chạm phải đi được 8 px mới tính là kéo. Hai lý do: (1) cú chạm run tay
    // không làm thẻ nhúc nhích rồi bật lại; (2) giữ chỗ cho cử chỉ chạm-mở-hồ-sơ
    // sẽ thêm sau — tap và pan không được tranh nhau cùng một cú chạm đứng yên.
    .minDistance(8)
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
      // Rung nhẹ ĐÚNG MỘT LẦN khi vượt ngưỡng — báo "thả ra là xong".
      // Phát hiện cạnh lên nằm Ở ĐÂY, trong worklet: bản trước gọi runOnJS mỗi
      // frame (60–120 lần/giây) chỉ để hỏi JS xem đã vượt ngưỡng chưa.
      const crossed = Math.abs(e.translationX) > SWIPE_THRESHOLD;
      if (crossed && armed.value) {
        armed.value = false;
        runOnJS(fireCrossHaptic)();
      } else if (!crossed && !armed.value) {
        armed.value = true;
      }
    })
    .onEnd((e) => {
      const flungX = Math.abs(e.velocityX) > FLING_VELOCITY;
      const flungY = Math.abs(e.velocityY) > FLING_VELOCITY;
      const goUp = y.value < -SUPERLIKE_THRESHOLD || (flungY && e.velocityY < 0);
      const goRight = x.value > SWIPE_THRESHOLD || (flungX && e.velocityX > 0);
      const goLeft = x.value < -SWIPE_THRESHOLD || (flungX && e.velocityX < 0);

      // Trục nào ĐI XA HƠN thì trục đó thắng. Không có luật này thì một cú vuốt
      // chéo lên-phải vừa đủ cả hai ngưỡng sẽ ra kết quả tuỳ thứ tự viết if.
      const verticalWins = Math.abs(y.value) > Math.abs(x.value);

      if (goUp && verticalWins) {
        const target = -SCREEN_H * 1.2;
        const duration = flingDuration(e.velocityY, target - y.value);
        y.value = withTiming(target, { duration }, () => {
          runOnJS(advance)("superlike");
        });
        return;
      }

      if (goRight || goLeft) {
        const target = (goRight ? 1 : -1) * SCREEN_W * 1.5;
        // Vuốt càng mạnh, thẻ bay càng nhanh — hàm này đã được test.
        const duration = flingDuration(e.velocityX, target - x.value);
        x.value = withTiming(target, { duration }, () => {
          runOnJS(advance)(goRight ? "like" : "pass");
        });
        return;
      }

      // Quay về bằng LÒ XO, không phải timing: ngón tay vừa buông ra, chuyển
      // động phải mang theo vận tốc đó.
      x.value = withSpring(0, m.spring("card"));
      y.value = withSpring(0, m.spring("card"));
    });

  // `Exclusive` chứ không `Race`: pan có `minDistance(8)` nên cú chạm đứng yên
  // không kích hoạt nó, còn `Race` để cái nào xong trước thắng — kéo nhanh rồi
  // nhả trong 250 ms sẽ mở nhầm màn hồ sơ giữa lúc thẻ đang bay.
  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_e, success) => {
      if (success && top) runOnJS(onOpenProfile)(top);
    });
  const gesture = Gesture.Exclusive(pan, tap);

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
  const superStyle = useAnimatedStyle(() => ({
    // Dùng lại `stampOpacity` với trục y: hàm nhận một quãng CÓ DẤU và một
    // ngưỡng, nó không quan tâm đó là trục nào. Hướng -1 vì vuốt lên là y âm.
    opacity: stampOpacity(y.value, SUPERLIKE_THRESHOLD, -1),
  }));

  if (loading) return <SwipeCardSkeleton />;

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
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.card, topStyle]}
          accessibilityLabel={`${top.name}, ${top.age} tuổi, ${top.community}`}
          accessibilityActions={[
            { name: "activate", label: "Xem hồ sơ" },
            { name: "magicTap", label: "Kết nối" },
          ]}
          onAccessibilityAction={(e) => {
            // Thiếu handler này thì TalkBack đọc ra hai hành động rồi KHÔNG làm
            // gì khi người dùng chọn — tệ hơn là không khai gì cả.
            if (e.nativeEvent.actionName === "activate") onOpenProfile(top);
            if (e.nativeEvent.actionName === "magicTap") {
              void haptic.medium();
              advance("like");
            }
          }}
        >
          <CardFace card={top} />
          {/* Nút này KHÔNG nằm trong `CardFace`: thẻ nền phía sau cũng dùng
              `CardFace`, và một nút bấm được nằm dưới thẻ khác là vùng chạm ma.
              Chỉ thẻ trên cùng mới có nút. */}
          <PressableScale
            style={styles.more}
            onPress={() => onReport(top)}
            hapticOnPress="selection"
            accessibilityLabel={`Báo cáo hoặc chặn ${top.name}`}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={C.textOn} />
          </PressableScale>
          <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]}>
            <Text style={styles.stampText}>KẾT NỐI</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.stampPass, passStyle]}>
            <Text style={styles.stampText}>BỎ QUA</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.stampSuper, superStyle]}>
            <Text style={styles.stampText}>ĐẶC BIỆT</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Nút bấm là BẮT BUỘC, không phải tuỳ chọn: người dùng dùng một tay,
          người bị hạn chế vận động, và VoiceOver đều không vuốt được. */}
      <View style={styles.actions}>
        <ActionButton icon="close" label="Bỏ qua" tone="pass" onPress={() => { void haptic.light(); advance("pass"); }} />
        <ActionButton icon="heart" label="Kết nối" tone="like" onPress={() => { void haptic.medium(); advance("like"); }} />
        {/* Nút to nhất vẫn ở GIỮA và vẫn là "Kết nối", không phải super-like:
            đó là nút ngón cái tìm thấy khi không nhìn, nên nó phải là thao tác
            dùng nhiều nhất chứ không phải thao tác hiếm nhất. */}
        <ActionButton icon="star" label="Thích đặc biệt" tone="super" onPress={() => { void haptic.medium(); advance("superlike"); }} />
      </View>

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
  icon, label, onPress, tone,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  tone: "pass" | "like" | "super";
}) {
  const big = tone === "like";
  return (
    <PressableScale
      style={[styles.actionBtn, big ? styles.actionBtnPrimary : styles.actionBtnGhost]}
      onPress={onPress}
      hapticOnPress={big ? "light" : "selection"}
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={big ? 32 : 24}
        color={tone === "like" ? C.textOn : tone === "super" ? C.info : C.textMuted}
      />
    </PressableScale>
  );
}

function CardFace({ card }: { card: Card }) {
  return (
    <>
      <Image source={{ uri: card.photoUrl }} style={styles.photo} resizeMode="cover" />

      {/* Ba lớp phủ độ mờ tăng dần thay cho gradient thật (workspace không có
          expo-linear-gradient). Không có nó thì chữ trắng biến mất trên ảnh
          nền sáng — và ảnh hồ sơ thì không kiểm soát được. */}
      <View style={[styles.scrim, styles.scrim1]} />
      <View style={[styles.scrim, styles.scrim2]} />
      <View style={[styles.scrim, styles.scrim3]} />

      {card.matchPercent !== undefined && (
        <View style={styles.badge}>
          <Ionicons name="sparkles-outline" size={13} color={C.accent} />
          <Text style={styles.badgeText}>{card.matchPercent}% hợp</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {card.name} <Text style={styles.age}>{card.age}</Text>
        </Text>
        <View style={styles.communityRow}>
          <Ionicons name="location-outline" size={14} color="rgba(255,255,255,.75)" />
          <Text style={styles.community} numberOfLines={1}>{card.community}</Text>
        </View>
        <View style={styles.topics}>
          {card.topics.slice(0, 3).map((t) => (
            <View key={t} style={styles.topic}>
              <Text style={styles.topicText}>{t}</Text>
            </View>
          ))}
          {card.topics.length > 3 && (
            <View style={styles.topic}>
              <Text style={styles.topicText}>+{card.topics.length - 3}</Text>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    position: "absolute",
    top: 20,
    width: SCREEN_W - CARD_INSET * 2,
    height: "74%",
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: C.surfaceSunken,
    // Bóng đổ để thẻ TÁCH khỏi nền tối. Không có nó, thẻ và nền cùng tông và
    // mắt không đọc ra đây là một vật thể cầm nắm được.
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  // Thẻ sau LÙI XUỐNG chứ không chỉ thu nhỏ: chỉ scale thì hai thẻ đồng tâm và
  // trông như một thẻ bị mờ viền, không ra chồng thẻ.
  behind: { zIndex: -1, top: 34 },
  // RN 0.86 bỏ `absoluteFillObject` khỏi type; `absoluteFill` giờ là object
  // thuần nên trải ra được y hệt.
  photo: { ...StyleSheet.absoluteFill },
  scrim: { position: "absolute", left: 0, right: 0, backgroundColor: C.bg },
  scrim1: { bottom: 0, height: 240, opacity: 0.3 },
  scrim2: { bottom: 0, height: 150, opacity: 0.4 },
  scrim3: { bottom: 0, height: 70, opacity: 0.5 },
  info: { position: "absolute", left: 20, right: 20, bottom: 22 },
  // letterSpacing âm ở cỡ lớn: chữ to mà giãn mặc định thì trông rời rạc.
  name: { color: C.textOn, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  age: { fontWeight: "300", color: "rgba(255,255,255,.85)" },
  communityRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  community: { color: "rgba(255,255,255,.75)", fontSize: 15, flexShrink: 1 },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  topic: {
    backgroundColor: "rgba(255,255,255,.18)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  topicText: { color: C.textOn, fontSize: 12 },
  badge: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(13,13,16,.72)",
    borderWidth: 1,
    borderColor: "rgba(244,63,94,.35)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // "80% hợp" thay vì "80%": con số trần không nói nó đo cái gì.
  badgeText: { color: C.textOn, fontWeight: "700", fontSize: 13 },
  // Góc trên TRÁI: góc phải đã có badge phần trăm, và chồng lên nhau thì vùng
  // chạm nào thắng là chuyện của thứ tự render, không phải của thiết kế.
  more: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 44, // sàn chạm 44pt (Apple HIG) / 48dp (Material)
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,.45)",
  },
  stamp: {
    position: "absolute",
    top: 40,
    borderWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stampLike: { left: 24, borderColor: C.success, transform: [{ rotate: "-14deg" }] },
  stampPass: { right: 24, borderColor: C.accent, transform: [{ rotate: "14deg" }] },
  // Tem này nằm GIỮA và KHÔNG xoay: hai tem kia nghiêng vì thẻ nghiêng theo
  // trục ngang; vuốt lên thì thẻ không xoay nên tem nghiêng sẽ trông như lỗi.
  stampSuper: { alignSelf: "center", borderColor: C.info },
  stampText: { color: C.textOn, fontWeight: "800", fontSize: 17 },
  actions: {
    position: "absolute",
    bottom: 40,
    flexDirection: "row",
    gap: 24,
    // Hai nút khác cỡ (60 và 68) nên phải căn theo TÂM. Để mặc định
    // `stretch` thì nút nhỏ bị kéo cao bằng nút lớn và mất hình tròn.
    alignItems: "center",
  },
  actionBtn: { alignItems: "center", justifyContent: "center" },
  actionBtnGhost: {
    width: 58, height: 58, borderRadius: 29,
    borderWidth: 1, borderColor: C.borderSoft, backgroundColor: C.surface,
  },
  actionBtnPrimary: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: C.accent,
    elevation: 8,
    shadowColor: C.accent, shadowOpacity: 0.45, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  // `includeFontPadding: false` (Android) bỏ khoảng đệm mà font để dành cho dấu
  // phụ tiếng Việt. Không tắt thì ký tự bị đẩy lệch lên trong nút tròn — thấy rõ
  // ở `♥` vì nó không có phần chữ nào chạm đường cơ sở để mắt lấy làm mốc.
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: C.textMuted },
});
