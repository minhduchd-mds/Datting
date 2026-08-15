/**
 * Điểm vào. Điều hướng theo trạng thái phiên và chặn cấu hình production sai.
 *
 * Demo chỉ được phép chạy khi EXPO_PUBLIC_APP_MODE=demo được khai báo TƯỜNG MINH.
 * Preview/production mà thiếu API hoặc WebSocket phải dừng bằng lỗi cấu hình rõ
 * ràng thay vì âm thầm rơi sang DemoApi và tạo cảm giác "app đang chạy thật".
 */
import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { STAGE_ROUTE, stageOf, useSession } from "../src/session";
import { theme } from "../src/theme";

const APP_MODE = process.env["EXPO_PUBLIC_APP_MODE"] ?? "production";
const API_BASE = process.env["EXPO_PUBLIC_API_BASE"]?.trim() ?? "";
const WS_URL = process.env["EXPO_PUBLIC_WS_URL"]?.trim() ?? "";

export default function Index() {
  const state = useSession();

  if (APP_MODE !== "demo" && (!API_BASE || !WS_URL)) {
    return (
      <View style={styles.root}>
        <Text style={styles.eyebrow}>DATTING · PRODUCTION CONFIG</Text>
        <Text style={styles.title}>Không thể khởi động bản thật</Text>
        <Text style={styles.body}>
          Build production đang thiếu EXPO_PUBLIC_API_BASE hoặc EXPO_PUBLIC_WS_URL. Datting đã chặn fallback sang dữ liệu demo để tránh phát hành nhầm môi trường.
        </Text>
      </View>
    );
  }

  return <Redirect href={STAGE_ROUTE[stageOf(state)] as never} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: theme.color.background,
  },
  eyebrow: {
    color: theme.color.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  title: {
    color: theme.color.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    marginTop: 10,
  },
  body: {
    color: theme.color.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
});
