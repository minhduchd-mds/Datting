import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { resolveMotionConfig, type ResolvedMotion } from "@datting/core";

/**
 * Hook đọc thiết lập "Giảm chuyển động" (Reduce Motion) của hệ thống.
 *
 * Đây KHÔNG PHẢI tuỳ chọn: với người bị rối loạn tiền đình, animation
 * parallax/scale/xoay gây chóng mặt và buồn nôn thật sự. iOS và Android đều có
 * công tắc hệ thống; app phải nghe. Logic điều chỉnh nằm ở `resolveMotionConfig`
 * trong tokens.ts (thuần tuý, có test).
 */
export type MotionConfig = ResolvedMotion;

export function useMotionConfig(): MotionConfig {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return resolveMotionConfig(reduce);
}
