/**
 * Layout gốc. Gesture root + SafeArea là bất biến hạ tầng; các màn chi tiết
 * V2/V2.1 bật back gesture độc lập với auth/onboarding.
 */
import { Stack } from "expo-router";
import { StatusBar, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { theme } from "../src/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={theme.color.background} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.color.background },
            gestureEnabled: false,
          }}
        >
          <Stack.Screen name="chat/[matchId]" options={{ gestureEnabled: true }} />
          <Stack.Screen name="profile/[userId]" options={{ gestureEnabled: true }} />
          <Stack.Screen name="profile/edit" options={{ gestureEnabled: true }} />
          <Stack.Screen name="likes-you" options={{ gestureEnabled: true }} />
          <Stack.Screen name="date-plan/[matchId]" options={{ gestureEnabled: true }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
});
