/**
 * Primary navigation V3 — floating editorial tab bar.
 *
 * Giữ BA đích cấp 1 (Khám phá · Kết nối · Hồ sơ), giảm cảm giác navigation mặc
 * định của framework và ưu tiên Discover như hành động chính mà không làm mất
 * khả năng nhận biết tab.
 *
 * `notifications` cố ý đăng ký với `href: null`: nó cần một route để điều hướng
 * tới, nhưng KHÔNG phải một "job to be done" cấp 1 như ba tab kia. Vì vậy đếm số
 * `<Tabs.Screen>` dưới đây sẽ ra bốn, còn số tab người dùng thấy là ba — đừng
 * "sửa" con số trong câu này cho khớp với số thẻ.
 */
import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

import { bump } from "../../src/live";
import { NudgeClient } from "../../src/nudgeClient";
import { useSession } from "../../src/session";
import { theme } from "../../src/theme";

const WS_URL = process.env["EXPO_PUBLIC_WS_URL"] ?? "";

export default function TabsLayout() {
  const { token, userId } = useSession();

  useEffect(() => {
    if (!WS_URL || !token || !userId) return;

    const client = new NudgeClient({
      url: WS_URL,
      token,
      deviceId: userId,
      onNudge: (n) => {
        if (n.kind === "match") {
          bump("matches");
          bump("notifications");
        } else if (n.kind === "message") {
          bump("messages");
          bump("notifications");
          bump("matches");
        } else {
          bump("notifications");
        }
      },
    });
    client.connect();
    return () => client.close();
  }, [token, userId]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 12,
          height: 66,
          paddingTop: 7,
          paddingBottom: 7,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: theme.color.borderStrong,
          borderRadius: 24,
          backgroundColor: theme.color.glass,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.28,
          shadowRadius: 24,
          elevation: 18,
        },
        tabBarItemStyle: {
          borderRadius: 18,
          marginHorizontal: 3,
        },
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textSoft,
        tabBarLabelStyle: {
          fontSize: 10,
          lineHeight: 13,
          fontWeight: "800",
          letterSpacing: 0.15,
        },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: "Khám phá",
          tabBarIcon: ({ color, focused }) => <TabGlyph glyph="◇" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Kết nối",
          tabBarIcon: ({ color, focused }) => <TabGlyph glyph="♥" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Hồ sơ",
          tabBarIcon: ({ color, focused }) => <TabGlyph glyph="●" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

function TabGlyph({ glyph, color, focused }: { glyph: string; color: ColorValue; focused: boolean }) {
  return (
    <Text
      style={{
        color,
        fontSize: glyph === "♥" ? 21 : 19,
        lineHeight: 23,
        includeFontPadding: false,
        textAlign: "center",
        transform: [{ scale: focused ? 1.08 : 1 }],
      }}
    >
      {glyph}
    </Text>
  );
}
