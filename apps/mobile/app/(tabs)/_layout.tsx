/**
 * Primary navigation V2.
 *
 * Thông báo không còn chiếm một tab chính: nó là event stream, không phải một
 * đích công việc cấp 1. Màn vẫn tồn tại và được mở từ chuông ở Discover/Profile.
 * Bốn tab phản ánh đúng vòng đời người dùng: khám phá → kết nối → trò chuyện →
 * quản lý bản thân.
 */
import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Text } from "react-native";

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
        tabBarStyle: {
          backgroundColor: theme.color.glass,
          borderTopColor: theme.color.border,
          borderTopWidth: 1,
          height: 72,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textSoft,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: "Khám phá",
          tabBarIcon: ({ color }) => <TabGlyph glyph="◇" color={color} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Kết nối",
          tabBarIcon: ({ color }) => <TabGlyph glyph="♥" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Hồ sơ",
          tabBarIcon: ({ color }) => <TabGlyph glyph="●" color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

function TabGlyph({ glyph, color }: { glyph: string; color: string }) {
  return (
    <Text
      style={{
        color,
        fontSize: glyph === "♥" ? 21 : 19,
        lineHeight: 23,
        includeFontPadding: false,
        textAlign: "center",
      }}
    >
      {glyph}
    </Text>
  );
}
