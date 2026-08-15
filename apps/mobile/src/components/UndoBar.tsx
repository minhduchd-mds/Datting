/**
 * Thanh "Hoàn tác" có vạch đếm ngược.
 *
 * ─── Vì sao vạch chứ không con số ─────────────────────────────────────────
 * "Còn 3 giây" bắt người dùng đọc, hiểu, rồi mới quyết định — mà cả ba việc đó
 * đều tốn đúng cái thứ đang cạn. Một vạch ngắn dần thì nhìn là biết, không cần
 * đọc, và tự nói luôn "sắp hết".
 *
 * ─── Vì sao animate `scaleX` chứ không `width` ────────────────────────────
 * `width` là thuộc tính bố cục: đổi nó là Yoga tính lại cây layout mỗi frame.
 * `scaleX` chạy thẳng trên UI thread. Cùng hình ảnh, khác hẳn giá — và đây là
 * thứ chạy SONG SONG với cử chỉ vuốt thẻ, nên nó không được giành CPU.
 */
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { UNDO_WINDOW_MS } from "@datting/core";

import { useMotionConfig } from "../motion/useMotionConfig";
import { PressableScale } from "./Feedback";
import { C } from "../theme";

export function UndoBar({
  visible,
  onUndo,
  onExpire,
}: {
  visible: boolean;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const m = useMotionConfig();
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!visible) return;
    progress.value = 1;
    progress.value = withTiming(
      0,
      { duration: UNDO_WINDOW_MS, easing: Easing.linear },
      (done) => {
        // `done === false` nghĩa là animation bị cắt giữa chừng (đã bấm hoàn
        // tác, hoặc vuốt tiếp). Gọi onExpire lúc đó là báo hết giờ cho một việc
        // đã xong.
        if (done) runOnJS(onExpire)();
      },
    );
  }, [visible, progress, onExpire]);

  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  if (!visible) return null;

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <PressableScale
        style={styles.btn}
        onPress={onUndo}
        hapticOnPress="light"
        accessibilityLabel="Hoàn tác lượt vuốt vừa rồi"
      >
        <Ionicons name="arrow-undo" size={16} color={C.text} />
        <Text style={styles.label}>Hoàn tác</Text>
      </PressableScale>
      {/* Vạch ẩn hẳn khi bật "giảm chuyển động": một thanh co lại đều đặn ở rìa
          tầm nhìn là đúng loại chuyển động mà thiết lập đó tồn tại để tắt. Nút
          vẫn còn, chỉ mất phần trang trí. */}
      {!m.reduceMotion && <Animated.View style={[styles.progress, barStyle]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    // Nằm TRÊN hàng nút (bottom 52, cao 68) để ngón cái không chạm nhầm
    // "Hoàn tác" khi đang định bấm "Kết nối".
    bottom: 132,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  btn: { paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  label: { color: C.text, fontSize: 15, fontWeight: "600" },
  progress: {
    height: 2,
    backgroundColor: C.accentSoft,
    // `scaleX` co về TÂM theo mặc định; đặt gốc về mép trái để vạch rút từ
    // phải sang trái như người ta chờ đợi.
    transformOrigin: "left",
  },
});
