/**
 * Ba tab + kết nối nudge.
 *
 * ─── Vì sao NudgeClient sống ở đây ────────────────────────────────────────
 * Nó phải sống lâu hơn từng màn hình (chuyển tab không được ngắt socket) nhưng
 * ngắn hơn app (đăng xuất phải ngắt). Layout của nhóm tab là đúng một tầng có
 * vòng đời đó. Đặt ở `app/_layout.tsx` thì socket sẽ mở cả lúc còn ở màn đăng
 * nhập, khi chưa có token để mà xác thực.
 *
 * ─── Icon: MỘT bộ, không phải ký tự Unicode ──────────────────────────────
 * Bản trước dùng ký tự (♥ ✉ 🔔) để khỏi thêm phụ thuộc. Cái giá lộ ra khi cầm
 * máy thật: mỗi ký tự do FONT HỆ THỐNG vẽ, nên nét, cỡ quang học và cả màu đều
 * không khớp nhau — `🔔` là emoji MÀU trong khi `♥` là ký tự đơn sắc ăn theo
 * `color`. Không có cách nào chỉnh cho chúng đồng bộ, vì chúng không cùng một
 * bộ chữ.
 *
 * Nay dùng Ionicons cho TOÀN BỘ app. Đặc/rỗng theo trạng thái focus là quy ước
 * mà cả iOS lẫn Material đều dùng, nên nó tự giải thích mà không cần nhãn.
 */
import { useEffect } from "react";
import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { bump } from "../../src/live";
import { NudgeClient } from "../../src/nudgeClient";
import { useSession } from "../../src/session";
import { C } from "../../src/theme";

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
        tabBarStyle: { backgroundColor: C.surfaceSunken, borderTopColor: C.borderSoft },
        tabBarActiveTintColor: C.accentSoft,
        tabBarInactiveTintColor: C.textMuted,
      }}
    >
      {/* Tên file là `discover.tsx`, KHÔNG phải `index.tsx`. Nhóm `(tabs)` bị
          xoá khỏi URL, nên một file `index` ở đây sẽ đòi đường dẫn `/` — đúng
          cái đường dẫn của `app/index.tsx`. Xem `STAGE_ROUTE` trong
          src/session.ts để biết sự trùng lặp đó gãy ở đâu.
          Thứ tự tab do thứ tự khai báo ở đây quyết định, không do tên file. */}
      <Tabs.Screen
        name="discover"
        options={{
          title: "Khám phá",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "flame" : "flame-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Kết đôi",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={23} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Thông báo",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "notifications" : "notifications-outline"} size={23} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
