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
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[matchId]" options={{ gestureEnabled: true }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d0d10" },
});
