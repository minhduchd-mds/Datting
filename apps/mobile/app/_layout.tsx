/**
 * Layout gốc. Mọi màn hình đều nằm dưới đây.
 *
 * `GestureHandlerRootView` phải bọc NGOÀI CÙNG và phải có `flex: 1`. Thiếu nó
 * thì cử chỉ vuốt thẻ im lặng không hoạt động trên Android — không lỗi, không
 * cảnh báo, chỉ là thẻ không nhúc nhích. Đây là lỗi hay mất nhiều giờ nhất khi
 * dựng dating app.
 *
 * KHÔNG chặn render để chờ đọc phiên: MMKV đọc đồng bộ (xem src/session.ts),
 * nên `stageOf()` đã có giá trị đúng ngay ở frame đầu tiên. Không có màn splash
 * giả, không có cú nhảy màn.
 */
import { Stack } from "expo-router";
import { StatusBar, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BackToExitGuard } from "../src/BackToExitGuard";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0d0d10" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0d0d10" },
            // Cử chỉ vuốt-để-quay-lại của iOS TẮT ở tầng gốc: các nhóm (auth),
            // (onboarding) là luồng một chiều. Cho vuốt ngược ở đó tạo ra trạng
            // thái nửa vời — quay về màn nhập SĐT khi đã có token chẳng hạn.
            // Bật lại theo từng màn cần (xem chat/[matchId].tsx).
            gestureEnabled: false,
          }}
        >
          {/* CHỈ khai báo màn cần đặt tuỳ chọn riêng. Expo Router tự đăng ký
              mọi file trong app/ — khai thêm "cho đủ" không những thừa mà còn
              SAI: nhóm không có `_layout.tsx` (ở đây là `(auth)` và
              `(onboarding)`) không tạo navigator, các file con được nâng thẳng
              lên Stack này dưới tên có kèm đoạn nhóm — `"(auth)/sign-in"`, chứ
              không phải `"(auth)"`. Nên `<Stack.Screen name="(auth)" />` trỏ
              vào một route KHÔNG tồn tại: nó không báo lỗi, chỉ lặng lẽ dựng
              lên một cái tên mà điều hướng có thể rơi vào. */}
          <Stack.Screen name="chat/[matchId]" options={{ gestureEnabled: true }} />
          {/* Cùng lý do với màn chat: đây là màn ĐỌC, quay lại không làm mất
              trạng thái nào. Các nhóm (auth)/(onboarding) vẫn tắt cử chỉ. */}
          <Stack.Screen name="profile/[userId]" options={{ gestureEnabled: true }} />
        </Stack>

        {/* Ngoài Stack nên nó sống suốt vòng đời app và phủ MỌI màn —
            kể cả (auth) và (onboarding), nơi bản vá trước bỏ sót. */}
        <BackToExitGuard />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d0d10" },
});
