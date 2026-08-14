/**
 * Ba tab + kết nối nudge.
 *
 * ─── Vì sao NudgeClient sống ở đây ────────────────────────────────────────
 * Nó phải sống lâu hơn từng màn hình (chuyển tab không được ngắt socket) nhưng
 * ngắn hơn app (đăng xuất phải ngắt). Layout của nhóm tab là đúng một tầng có
 * vòng đời đó. Đặt ở `app/_layout.tsx` thì socket sẽ mở cả lúc còn ở màn đăng
 * nhập, khi chưa có token để mà xác thực.
 *
 * ─── Icon là ký tự, không phải icon font ──────────────────────────────────
 * `@expo/vector-icons` chưa cài trong workspace này. Thay vì kéo thêm một gói
 * chỉ để có ba cái hình, dùng đúng bộ ký tự mà các màn khác đang dùng (♥ ✉ 🔔).
 * Ít phụ thuộc hơn cũng có nghĩa là bản build EAS nhẹ hơn và ít thứ hỏng hơn.
 */
import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Text } from "react-native";

import { bump } from "../../src/live";
import { NudgeClient } from "../../src/nudgeClient";
import { useSession } from "../../src/session";

const WS_URL = process.env["EXPO_PUBLIC_WS_URL"] ?? "";

export default function TabsLayout() {
  const { token, userId } = useSession();

  useEffect(() => {
    // Không có gateway (bản demo) hoặc chưa có token ⇒ không mở socket. Mở rồi
    // để nó đóng ngay chỉ tạo ra vòng lặp reconnect vô nghĩa.
    if (!WS_URL || !token || !userId) return;

    const client = new NudgeClient({
      url: WS_URL,
      token,
      deviceId: userId,
      onNudge: (n) => {
        // Nudge chỉ nói "có cái mới". Việc duy nhất ở đây là đánh dấu chủ đề
        // nào cũ đi; màn hình đang mở sẽ tự fetch lại.
        if (n.kind === "match") {
          bump("matches");
          bump("notifications");
        } else if (n.kind === "message") {
          bump("messages");
          bump("notifications");
        } else {
          bump("notifications");
        }
      },
    });
    client.connect();

    // `close()` đặt cờ stopped rồi mới đóng socket, nên `onclose` KHÔNG lên
    // lịch reconnect. Nếu chỉ gọi `ws.close()` trần, mỗi lần đăng xuất sẽ để
    // lại một client zombie cứ thế reconnect với token đã chết.
    return () => client.close();
  }, [token, userId]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#131418", borderTopColor: "#23262d" },
        tabBarActiveTintColor: "#e0567a",
        tabBarInactiveTintColor: "#6f7681",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Khám phá",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>♥</Text>,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Kết đôi",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>✉</Text>,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Thông báo",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔔</Text>,
        }}
      />
    </Tabs>
  );
}
