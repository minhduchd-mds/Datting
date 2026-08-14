import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { createThresholdGate } from "@datting/core";

/**
 * HAPTICS — rung phản hồi.
 *
 * Quy tắc duy nhất đáng nhớ: **rung là để XÁC NHẬN, không phải để TRANG TRÍ.**
 * Rung mỗi lần cuộn/chạm sẽ khiến người dùng tắt haptics toàn hệ thống — và
 * khi đó bạn mất luôn cả những lần rung thật sự quan trọng.
 *
 * Bảng phân bổ trong app này:
 *   selection  — chọn/bỏ chọn chip sở thích, đổi tab
 *   light      — thẻ vượt ngưỡng swipe (báo "thả ra là xong")
 *   success    — CÓ MATCH. Đây là khoảnh khắc quan trọng nhất của sản phẩm.
 *   warning    — hết lượt swipe, mất mạng
 *   error      — thao tác thất bại
 *
 * KHÔNG rung khi: cuộn, mở màn, nhận tin nhắn (quá thường xuyên), hiển thị toast.
 */

const enabled = Platform.OS === "ios" || Platform.OS === "android";

/** Bọc trong try/catch: haptics thất bại KHÔNG BAO GIỜ được làm hỏng luồng. */
async function safe(fn: () => Promise<void>): Promise<void> {
  if (!enabled) return;
  try {
    await fn();
  } catch {
    /* thiết bị không hỗ trợ / người dùng đã tắt — bỏ qua im lặng */
  }
}

export const haptic = {
  selection: () => safe(() => Haptics.selectionAsync()),
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

/**
 * Chống rung liên tiếp khi thẻ dao động quanh ngưỡng swipe.
 * Logic cổng nằm ở `createThresholdGate` (thuần tuý, có test trong tokens.ts).
 */
export function createThresholdHaptic(minIntervalMs = 250) {
  return createThresholdGate(() => void haptic.light(), minIntervalMs);
}
