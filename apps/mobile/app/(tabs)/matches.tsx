/**
 * Kết nối V2.1 — tách match mới khỏi conversation, đồng thời có lối vào
 * Likes You và truyền common points sang chat cho conversation starter.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { FlatList, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, type MatchSummary } from "../../src/api";
import { ListEnter, PressableScale, Skeleton } from "../../src/components/Feedback";
import { useRevision } from "../../src/live";
import { EmptyState, ErrorState } from "../../src/screens/SocialScreens";
import { theme } from "../../src/theme";

export default function Matches() {
  const insets = useSafeAreaInsets();
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

  useEffect(() => { void load(); }, [load, revision]);

  const groups = useMemo(() => {
    const all = items ?? [];
    return {
      fresh: all.filter((m) => !m.lastMessage),
      threads: all.filter((m) => Boolean(m.lastMessage)),
    };
  }, [items]);

  if (failed && items === null) return <ErrorState onRetry={() => void load()} />;

  if (items === null) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 28 }]}>
        <View style={styles.loadingHeader}>
          <Skeleton width={180} height={24} radius={10} />
          <Skeleton width={260} height={13} radius={7} />
        </View>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.row}>
            <Skeleton width={60} height={60} radius={22} />
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
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top + 18 }}>
          <LikesYouEntry />
        </View>
        <View style={{ flex: 1 }}>
          <EmptyState
            title="Chưa có kết nối nào"
            body="Kết nối xảy ra khi cả hai cùng chọn nhau. Bạn vẫn có thể xem ai đã thích mình trước trong Likes You."
            actionLabel="Khám phá ngay"
            onAction={() => router.replace("/(tabs)/discover")}
          />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      data={groups.threads}
      keyExtractor={(m) => m.matchId}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={theme.color.textMuted}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
      ListHeaderComponent={
        <View style={{ paddingTop: insets.top + 20 }}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>KẾT NỐI</Text>
            <Text style={styles.h1}>Những người đã chọn bạn</Text>
            <Text style={styles.subtitle}>Ưu tiên kết nối mới trước, rồi tiếp tục những cuộc trò chuyện đang có nhịp.</Text>
          </View>

          <LikesYouEntry />

          {groups.fresh.length > 0 && (
            <View style={styles.newSection}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Match mới</Text>
                <View style={styles.countPill}><Text style={styles.countText}>{groups.fresh.length}</Text></View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.newList}>
                {groups.fresh.map((item) => (
                  <PressableScale
                    key={item.matchId}
                    style={styles.newCard}
                    onPress={() => openChat(item)}
                    hapticOnPress="selection"
                    accessibilityLabel={`Mở kết nối mới với ${item.peerName}`}
                  >
                    <Image source={{ uri: item.peerPhotoUrl }} style={styles.newAvatar} />
                    <View style={styles.newBadge}><Text style={styles.newBadgeText}>♥</Text></View>
                    <Text style={styles.newName} numberOfLines={1}>{item.peerName}</Text>
                    <Text style={styles.newHint}>Nói lời chào</Text>
                  </PressableScale>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.threadHead}>
            <Text style={styles.sectionTitle}>Tin nhắn</Text>
            <Text style={styles.threadMeta}>{groups.threads.length} cuộc trò chuyện</Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.noThreads}>
          <Text style={styles.noThreadsTitle}>Chưa có cuộc trò chuyện nào</Text>
          <Text style={styles.noThreadsBody}>Mở một match mới và dùng gợi ý mở lời dựa trên điểm chung.</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <ListEnter index={index}>
          <PressableScale
            style={styles.row}
            hapticOnPress="selection"
            accessibilityLabel={`Mở trò chuyện với ${item.peerName}`}
            onPress={() => openChat(item)}
          >
            <Image source={{ uri: item.peerPhotoUrl }} style={styles.avatar} />
            <View style={styles.rowBody}>
              <View style={styles.nameLine}>
                <Text style={styles.name}>{item.peerName}</Text>
                <Text style={styles.time}>{relativeTime(item.lastAt)}</Text>
              </View>
              <Text style={[styles.preview, item.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                {item.lastMessage ?? "Hai bạn vừa kết nối. Nói lời chào nhé."}
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

function LikesYouEntry() {
  return (
    <PressableScale
      style={styles.likesEntry}
      onPress={() => router.push("/likes-you" as never)}
      hapticOnPress="selection"
      accessibilityLabel="Xem ai đã thích bạn"
    >
      <View style={styles.likesIcon}><Text style={styles.likesIconText}>♡</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.likesTitle}>Likes You</Text>
        <Text style={styles.likesBody}>Xem ai đã thích ảnh, prompt hoặc hồ sơ của bạn trước.</Text>
      </View>
      <Text style={styles.likesArrow}>›</Text>
    </PressableScale>
  );
}

function openChat(item: MatchSummary) {
  router.push({
    pathname: "/chat/[matchId]",
    params: {
      matchId: item.matchId,
      name: item.peerName,
      photo: item.peerPhotoUrl,
      peerUserId: item.peerUserId,
      commonPoints: JSON.stringify(item.commonPoints ?? []),
    },
  } as never);
}

function relativeTime(at: number): string {
  const diff = Math.max(0, Date.now() - at);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes}p`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}g`;
  return `${Math.floor(hours / 24)}n`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  loadingHeader: { paddingHorizontal: 20, gap: 10, marginBottom: 20 },
  header: { paddingHorizontal: 20 },
  eyebrow: { color: theme.color.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  h1: { color: theme.color.text, fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 6 },
  subtitle: { color: theme.color.textMuted, fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 330 },
  likesEntry: { marginHorizontal: 20, marginTop: 20, minHeight: 82, padding: 14, borderRadius: theme.radius.lg, backgroundColor: theme.color.primarySoft, borderWidth: 1, borderColor: "rgba(240,98,116,0.26)", flexDirection: "row", alignItems: "center", gap: 12 },
  likesIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
  likesIconText: { color: theme.color.white, fontSize: 24 },
  likesTitle: { color: theme.color.text, fontSize: 14, fontWeight: "900" },
  likesBody: { color: theme.color.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  likesArrow: { color: theme.color.primary, fontSize: 28 },
  newSection: { marginTop: 26 },
  sectionHead: { paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: theme.color.text, fontSize: 17, fontWeight: "800" },
  countPill: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primarySoft },
  countText: { color: theme.color.primary, fontSize: 11, fontWeight: "900" },
  newList: { paddingHorizontal: 20, gap: 12, paddingTop: 14, paddingBottom: 6 },
  newCard: { width: 92, alignItems: "center" },
  newAvatar: { width: 78, height: 96, borderRadius: 27, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  newBadge: { position: "absolute", right: 5, top: 78, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary, borderWidth: 3, borderColor: theme.color.background },
  newBadgeText: { color: theme.color.white, fontSize: 10 },
  newName: { color: theme.color.text, fontSize: 13, fontWeight: "800", marginTop: 9, maxWidth: 90 },
  newHint: { color: theme.color.primary, fontSize: 10, marginTop: 3 },
  threadHead: { paddingHorizontal: 20, marginTop: 28, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  threadMeta: { color: theme.color.textSoft, fontSize: 11 },
  row: { flexDirection: "row", alignItems: "center", gap: 13, marginHorizontal: 12, paddingHorizontal: 10, paddingVertical: 11, borderRadius: theme.radius.md },
  avatar: { width: 60, height: 60, borderRadius: 22, backgroundColor: theme.color.surfaceSoft },
  rowBody: { flex: 1, gap: 6 },
  nameLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  name: { color: theme.color.text, fontSize: 15, fontWeight: "800" },
  time: { color: theme.color.textSoft, fontSize: 10 },
  preview: { color: theme.color.textMuted, fontSize: 12 },
  previewUnread: { color: theme.color.text, fontWeight: "700" },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: theme.color.primary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: theme.color.white, fontSize: 11, fontWeight: "900" },
  noThreads: { margin: 20, padding: 20, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  noThreadsTitle: { color: theme.color.text, fontSize: 15, fontWeight: "800" },
  noThreadsBody: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
});
