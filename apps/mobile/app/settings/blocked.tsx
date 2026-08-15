/**
 * Danh sách đã chặn.
 *
 * Chặn được nhưng không gỡ được là một cái bẫy MỘT CHIỀU: người dùng chặn nhầm
 * — hoặc đổi ý — thì không còn đường nào lùi, và họ cũng không xem lại được
 * mình đã chặn ai. Đó là kiểu thiếu sót chỉ lộ ra sau vài tháng dùng.
 *
 * Gỡ chặn KHÔNG hỏi lại: nó là thao tác hoàn tác được và không gây hại. Hỏi lại
 * ở mọi thao tác làm người dùng bấm "Đồng ý" theo phản xạ, và khi tới thao tác
 * thật sự nguy hiểm thì hộp thoại đã mất hết trọng lượng.
 */
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { api, type BlockedUser } from "../../src/api";
import { ListEnter, PressableScale, Skeleton } from "../../src/components/Feedback";
import { EmptyState, ErrorState } from "../../src/screens/SocialScreens";
import { C, R as RAD, S, T } from "../../src/theme";

export default function Blocked() {
  const [items, setItems] = useState<BlockedUser[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  const load = useCallback(() => {
    setState("loading");
    api
      .fetchBlocked()
      .then((r) => { setItems(r); setState("ready"); })
      .catch(() => setState("failed"));
  }, []);

  useEffect(load, [load]);

  const unblock = useCallback((u: BlockedUser) => {
    // Bỏ khỏi danh sách NGAY, gọi API sau. Cùng nguyên tắc lạc quan với vuốt
    // thẻ: thao tác này an toàn và hoàn tác được, không đáng bắt chờ mạng.
    setItems((cur) => cur.filter((x) => x.userId !== u.userId));
    void api.unblock(u.userId).catch(() => setItems((cur) => [...cur, u]));
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <PressableScale onPress={() => router.back()} hapticOnPress="selection" accessibilityLabel="Quay lại">
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </PressableScale>
        <Text style={styles.navTitle}>Danh sách đã chặn</Text>
      </View>

      {state === "failed" ? (
        <ErrorState onRetry={load} />
      ) : state === "loading" ? (
        <View style={{ padding: S.lg, gap: S.md }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={64} radius={16} />)}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          title="Bạn chưa chặn ai"
          body="Người bị chặn sẽ không thấy hồ sơ của bạn và không nhắn tin được. Bạn có thể gỡ chặn bất cứ lúc nào."
          actionLabel="Quay lại"
          onAction={() => router.back()}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => u.userId}
          contentContainerStyle={{ padding: S.lg, gap: S.sm }}
          renderItem={({ item, index }) => (
            <ListEnter index={Math.min(index, 8)}>
              <View style={styles.row}>
                <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.when}>
                    Chặn ngày {new Date(item.blockedAt).toLocaleDateString("vi-VN")}
                  </Text>
                </View>
                <PressableScale
                  style={styles.unblock}
                  onPress={() => unblock(item)}
                  hapticOnPress="light"
                  accessibilityLabel={`Gỡ chặn ${item.name}`}
                >
                  <Text style={styles.unblockText}>Gỡ chặn</Text>
                </PressableScale>
              </View>
            </ListEnter>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  nav: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    paddingHorizontal: S.lg, paddingTop: S.huge, paddingBottom: S.md,
    borderBottomWidth: 1, borderBottomColor: C.borderSoft,
  },
  navTitle: { color: C.text, fontSize: T.body, fontWeight: "600" },
  row: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: RAD.lg, padding: S.md,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceSunken },
  name: { color: C.text, fontSize: T.callout, fontWeight: "600" },
  when: { color: C.textMuted, fontSize: T.footnote, marginTop: 2 },
  unblock: {
    paddingHorizontal: S.md, paddingVertical: S.sm,
    borderRadius: RAD.md, borderWidth: 1, borderColor: C.border,
  },
  unblockText: { color: C.text, fontSize: T.subhead, fontWeight: "600" },
});
