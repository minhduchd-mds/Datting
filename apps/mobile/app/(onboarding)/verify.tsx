/**
 * Xác minh ảnh thật (chống hồ sơ giả / ảnh lấy trên mạng).
 *
 * ─── Tư thế PHẢI do server sinh ───────────────────────────────────────────
 * Cả tính bảo mật của bước này nằm ở chỗ kẻ tấn công KHÔNG biết trước tư thế.
 * Nếu client tự chọn, kẻ tấn công sửa client để luôn ra tư thế đã quay sẵn, và
 * toàn bộ bước xác minh trở thành thủ tục trang trí.
 *
 * Danh sách dưới đây là tạm thời cho tới khi có endpoint. Đó là NỢ BẢO MẬT, đã
 * ghi rõ để không ai tưởng nó đã xong.
 *
 * ─── Vì sao có "Để sau" ───────────────────────────────────────────────────
 * Xác minh là bước AN TOÀN, không phải PHÁP LÝ. Cổng tuổi và đồng ý dữ liệu
 * nhạy cảm thì chặn; cái này thì không. Ép selfie ngay lúc đăng ký làm rơi tỉ
 * lệ hoàn tất rất mạnh, và chính màn hình này đang hứa một PHẦN THƯỞNG
 * ("nhận được nhiều lượt thích hơn") — hứa thưởng rồi chặn đường là mâu thuẫn.
 *
 * ─── Ảnh selfie KHÔNG được lưu ────────────────────────────────────────────
 * So khớp xong là xoá. Đây là dữ liệu sinh trắc học: giữ lại tạo ra gánh nặng
 * pháp lý khổng lồ mà không đem lại lợi ích nào sau lần so khớp đầu tiên.
 */
import { useCallback, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { PressableScale } from "../../src/components/Feedback";
import {
  PhotoVerificationScreen,
  type VerifyState,
} from "../../src/screens/OnboardingScreens";
import { nextRoute, session } from "../../src/session";
import { theme } from "../../src/theme";

// NỢ BẢO MẬT: thay bằng GET /v1/verify/challenge khi có service.
const POSES = [
  "Đưa tay phải lên ngang tai",
  "Nghiêng đầu sang trái và mỉm cười",
  "Giơ hai ngón tay trước ngực",
  "Nhìn thẳng, chạm nhẹ vào cằm",
];

export default function Verify() {
  const [pose] = useState(() => POSES[Math.floor(Math.random() * POSES.length)] as string);
  const [state, setState] = useState<VerifyState>("idle");

  const capture = useCallback(() => {
    setState("capturing");
    // Chỗ này sẽ là expo-camera + POST /v1/verify. Bản demo mô phỏng độ trễ
    // thật của một lần so khớp để nhịp UI không bị chỉnh sai về sau.
    setTimeout(() => setState("checking"), 900);
    setTimeout(() => {
      setState("passed");
      session.setVerified(true);
      setTimeout(() => router.replace(nextRoute() as never), 900);
    }, 2400);
  }, []);

  return (
    <View style={styles.root}>
      <PhotoVerificationScreen
        posePrompt={pose}
        state={state}
        onCapture={capture}
        onRetry={() => setState("idle")}
      />
      {state !== "passed" && (
        <PressableScale
          style={styles.skip}
          onPress={() => {
            session.deferVerification();
            router.replace(nextRoute() as never);
          }}
          hapticOnPress="light"
          accessibilityLabel="Để sau"
        >
          <Text style={styles.skipText}>Để sau</Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  skip: { alignItems: "center", paddingVertical: 18, paddingBottom: 34 },
  skipText: { color: theme.color.textMuted, fontSize: theme.type.body, textDecorationLine: "underline" },
});
