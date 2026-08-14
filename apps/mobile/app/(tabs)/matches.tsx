/**
 * Danh sách kết đôi — cửa vào các cuộc trò chuyện.
 *
 * `useRevision("matches")` là dependency của effect tải dữ liệu: khi nudge báo
 * có match mới, số đó tăng và màn hình tự fetch lại. Socket không chở nội dung,
 * đúng như bất biến của hệ thống nudge.
 */
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, Image, RefreshControl, StyleSheet, Text, View } from "react-native";

import { api, type MatchSummary } from "../../src/api";
import { ListEnter, PressableScale, Skeleton } from "../../src/components/Feedback";
import { useRevision } from "../../src/live";
import { EmptyState, ErrorState } from "../../src/screens/SocialScreens";

export default function Matches() {
  const revision = useRevision("matches");
  const [items, setItems] = useState<MatchSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.fetchMatches());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  if (failed && items === null) return <ErrorState onRetry={() => void load()} />;

  if (items === null) {
    return (
      <View style={styles.root}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.row}>
            <Skeleton width={56} height={56} radius={28} />
            <View style={styles.rowBody}>
              <Skeleton width={140} height={14} radius={7} />
              <Skeleton width={200} height={12} radius={6} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Chưa có kết đôi nào"
        body="Kết đôi xảy ra khi cả hai cùng thích nhau. Cứ vuốt tiếp — hồ sơ có ảnh rõ mặt và vài dòng giới thiệu thường được thích nhiều hơn."
        actionLabel="Bắt đầu vuốt"
        onAction={() => router.replace("/(tabs)")}
      />
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={items}
      keyExtractor={(m) => m.matchId}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor="#9aa1ad"
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
      renderItem={({ item, index }) => (
        <ListEnter index={index}>
          <PressableScale
            style={styles.row}
            hapticOnPress="selection"
            accessibilityLabel={`Mở trò chuyện với ${item.peerName}`}
            onPress={() =>
              router.push({
                pathname: "/chat/[matchId]",
                // Tên và ảnh đi kèm để header hiện ngay, không phải chờ một
                // lượt fetch nữa. Đây là gợi ý hiển thị, KHÔNG phải nguồn sự
                // thật — màn chat vẫn suy ra đối phương từ pairKey.
                params: { matchId: item.matchId, name: item.peerName, photo: item.peerPhotoUrl },
              } as never)
            }
          >
            <Image source={{ uri: item.peerPhotoUrl }} style={styles.avatar} />
            <View style={styles.rowBody}>
              <Text style={styles.name}>{item.peerName}</Text>
              <Text style={styles.preview} numberOfLines={1}>
                {/* Chưa nhắn gì thì nói thẳng, đừng để dòng trống — dòng trống
                    trông như lỗi tải. */}
                {item.lastMessage ?? "Hai bạn đã kết đôi. Nói lời chào nhé."}
              </Text>
            </View>
            {item.unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unread > 9 ? "9+" : item.unread}</Text>
              </View>
            )}
          </PressableScale>
        </ListEnter>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d0d10", paddingTop: 56 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#23262d" },
  rowBody: { flex: 1, gap: 6 },
  name: { color: "#f2f3f5", fontSize: 16, fontWeight: "600" },
  preview: { color: "#9aa1ad", fontSize: 13 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: "#e0567a",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
