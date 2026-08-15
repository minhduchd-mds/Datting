/**
 * Tin nhắn — chỉ những cuộc ĐÃ có lời.
 *
 * ─── Vì sao tách khỏi Kết nối ─────────────────────────────────────────────
 * Bản trước gộp cả hai vào một danh sách, và điều đó làm hỏng cả hai: người
 * mới kết đôi bị chôn dưới các cuộc đang nói dở, còn danh sách tin nhắn thì
 * đầy những dòng "chưa có tin nhắn nào".
 *
 * Chia theo `lastMessage`: chưa ai nói gì thì thuộc về Kết nối (một việc cần
 * LÀM), đã nói rồi thì thuộc về Tin nhắn (một việc cần TIẾP TỤC).
 */
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";

import { api, type MatchSummary } from "../../src/api";
import { ListEnter, PressableScale, Skeleton } from "../../src/components/Feedback";
import { EmptyState, ErrorState } from "../../src/screens/SocialScreens";
import { useRevision } from "../../src/live";
import { C, R as RAD, S, T } from "../../src/theme";

export default function Messages() {
  const rev = useRevision("matches");
  const [items, setItems] = useState<MatchSummary[]>([]);
  const [st, setSt] = useState<"loading" | "ready" | "failed">("loading");

  const load = useCallback(() => {
    api.fetchMatches()
      .then((r) => { setItems(r.filter((m) => m.lastMessage !== null)); setSt("ready"); })
      .catch(() => setSt("failed"));
  }, []);
  useEffect(load, [load, rev]);

  if (st === "failed") return <ErrorState onRetry={load} />;

  return (
    <View style={styles.root}>
      <Text style={styles.h1}>Tin nhắn</Text>
      {st === "loading" ? (
        <View style={{ padding: S.lg, gap: S.md }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={68} radius={16} />)}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có cuộc trò chuyện nào"
          body="Người bạn kết nối sẽ hiện ở tab Kết nối. Gửi lời chào trước — người nhắn trước thường được trả lời."
          actionLabel="Xem kết nối"
          onAction={() => router.push("/connections" as never)}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.matchId}
          contentContainerStyle={{ padding: S.lg, gap: S.sm }}
          renderItem={({ item, index }) => (
            <ListEnter index={Math.min(index, 8)}>
              <PressableScale
                style={styles.row}
                onPress={() => router.push({
                  pathname: "/chat/[matchId]",
                  params: { matchId: item.matchId, name: item.peerName, photo: item.peerPhotoUrl },
                } as never)}
                hapticOnPress="selection"
                accessibilityLabel={`Trò chuyện với ${item.peerName}`}
              >
                <Image source={{ uri: item.peerPhotoUrl }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.peerName}</Text>
                  <Text style={styles.last} numberOfLines={1}>{item.lastMessage}</Text>
                </View>
                {item.unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread}</Text>
                  </View>
                )}
              </PressableScale>
            </ListEnter>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  h1: {
    color: C.text, fontSize: T.largeTitle, fontWeight: "800",
    letterSpacing: -0.6, paddingHorizontal: S.lg, paddingTop: S.huge, marginBottom: S.md,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: RAD.lg, padding: S.md,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.surfaceSunken },
  name: { color: C.text, fontSize: T.callout, fontWeight: "600" },
  last: { color: C.textMuted, fontSize: T.subhead, marginTop: 2 },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.accent,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  badgeText: { color: C.textOn, fontSize: T.caption2, fontWeight: "700" },
});
