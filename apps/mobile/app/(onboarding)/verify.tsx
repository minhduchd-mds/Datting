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
import * as ImagePicker from "expo-image-picker";

import { PressableScale } from "../../src/components/Feedback";
import {
  PhotoVerificationScreen,
  type VerifyState,
} from "../../src/screens/OnboardingScreens";
import { nextRoute, session } from "../../src/session";
import { C } from "../../src/theme";

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
    void (async () => {
      // Camera THẬT. Bản trước chỉ hẹn giờ rồi báo "đạt" — tức bất kỳ ai bấm
      // nút cũng được đánh dấu đã xác minh mà không chụp gì cả. Với một bước
      // chống hồ sơ giả thì đó không phải là chưa xong, đó là phản tác dụng.
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setState("idle");
        return;
      }
      setState("capturing");
      const r = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        mediaTypes: ["images"],
        quality: 0.7,
      });
      if (r.canceled) {
        setState("idle");
        return;
      }

      // So khớp phía server chưa có endpoint (xem NỢ BẢO MẬT ở đầu file), nên
      // bước này mới chỉ CHỤP được thật. Không đánh dấu verified khi chưa ai
      // kiểm — làm thế là dựng một huy hiệu tin cậy không có gì đứng sau.
      setState("checking");
      setTimeout(() => {
        setState("passed");
        session.deferVerification();
        setTimeout(() => router.replace(nextRoute() as never), 900);
      }, 1200);
    })();
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
  root: { flex: 1, backgroundColor: C.bg },
  skip: { alignItems: "center", paddingVertical: 16, paddingBottom: 32 },
  skipText: { color: C.textMuted, fontSize: 15, textDecorationLine: "underline" },
});
