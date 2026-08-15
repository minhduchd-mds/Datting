import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View, type ImageStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, type LikesYouItem } from "../src/api";
import { PressableScale, Skeleton } from "../src/components/Feedback";
import { bump } from "../src/live";
import { socialStore } from "../src/socialStore";
import { queueSwipe } from "../src/swipeQueue";
import { theme } from "../src/theme";

export default function LikesYou() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LikesYouItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.fetchLikesYou());
      setFailed(false);
    } catch {
      setFailed(true);
      setItems([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const likeBack = async (item: LikesYouItem) => {
    if (busyId) return;
    setBusyId(item.userId);
    socialStore.rememberLike({
      peerUserId: item.userId,
      kind: item.likedTarget.kind,
      label: item.likedTarget.label,
      at: Date.now(),
    });
    try {
      const result = await queueSwipe(item.userId, "like");
      if (result?.matched) {
        bump("matches");
        bump("notifications");
        router.replace({
          pathname: "/chat/[matchId]",
          params: {
            matchId: result.pairKey,
            name: item.name,
            photo: item.photoUrl,
            peerUserId: item.userId,
            commonPoints: JSON.stringify(item.commonPoints),
          },
        } as never);
        return;
      }
      setItems((cur) => cur?.filter((x) => x.userId !== item.userId) ?? []);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <PressableScale style={styles.backBtn} onPress={() => router.back()} hapticOnPress="selection" accessibilityLabel="Quay lại">
          <Text style={styles.back}>‹</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>LIKES YOU</Text>
          <Text style={styles.title}>Ai đã để ý tới bạn</Text>
        </View>
      </View>

      {items === null ? (
        <View style={styles.loading}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} width="48%" height={250} radius={24} />)}
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={styles.subtitle}>Xem họ đã thích điều gì trước khi quyết định. Datting không ép bạn phản hồi chỉ vì người kia đã thích trước.</Text>

          {failed && (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Chưa tải được Likes You</Text>
              <Text style={styles.infoBody}>Profile/social service có thể chưa bật endpoint này. Các phần còn lại của ứng dụng vẫn hoạt động bình thường.</Text>
              <PressableScale style={styles.retry} onPress={() => void load()} hapticOnPress="selection"><Text style={styles.retryText}>Thử lại</Text></PressableScale>
            </View>
          )}

          {!failed && items.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>♡</Text>
              <Text style={styles.emptyTitle}>Chưa có lượt thích mới</Text>
              <Text style={styles.emptyBody}>Tập trung làm hồ sơ rõ nét và thật. Khi có lượt thích, màn này sẽ cho biết họ chú ý tới ảnh, prompt hay toàn bộ hồ sơ.</Text>
              <PressableScale style={styles.discoverBtn} onPress={() => router.replace("/(tabs)/discover" as never)} hapticOnPress="light">
                <Text style={styles.discoverText}>Quay lại Khám phá</Text>
              </PressableScale>
            </View>
          )}

          <View style={styles.grid}>
            {items.map((item) => (
              <View key={item.userId} style={styles.card}>
                <View style={styles.photoWrap}>
                  <Image source={{ uri: item.photoUrl }} style={styles.photo as ImageStyle} />
                  <View style={styles.scrim} />
                  <View style={styles.percent}><Text style={styles.percentText}>✦ {item.matchPercent}%</Text></View>
                  <View style={styles.nameWrap}>
                    <Text style={styles.name}>{item.name}, {item.age}</Text>
                    <Text style={styles.area} numberOfLines={1}>{item.community}</Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.likedLabel}>HỌ ĐÃ THÍCH</Text>
                  <Text style={styles.likedValue} numberOfLines={3}>
                    {item.likedTarget.kind === "prompt" ? `“${item.likedTarget.label}”` : item.likedTarget.kind === "photo" ? "Một ảnh trong hồ sơ của bạn" : "Hồ sơ của bạn"}
                  </Text>
                  <View style={styles.actions}>
                    <PressableScale style={styles.viewBtn} onPress={() => router.push(profileRoute(item) as never)} hapticOnPress="selection">
                      <Text style={styles.viewText}>Xem</Text>
                    </PressableScale>
                    <PressableScale
                      style={styles.likeBtn}
                      onPress={() => void likeBack(item)}
                      disabled={busyId === item.userId}
                      hapticOnPress="medium"
                      accessibilityLabel={`Thích lại ${item.name}`}
                    >
                      <Text style={styles.likeText}>{busyId === item.userId ? "…" : "♥"}</Text>
                    </PressableScale>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function profileRoute(item: LikesYouItem) {
  return {
    pathname: "/profile/[userId]",
    params: {
      userId: item.userId,
      name: item.name,
      age: String(item.age),
      community: item.community,
      photo: item.photoUrl,
      topics: JSON.stringify(item.topics),
      prompts: JSON.stringify(item.prompts),
      matchPercent: String(item.matchPercent ?? 0),
      commonPoints: JSON.stringify(item.commonPoints),
    },
  } as const;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  topbar: { minHeight: 84, paddingHorizontal: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  back: { color: theme.color.text, fontSize: 30, lineHeight: 31 },
  eyebrow: { color: theme.color.primary, fontSize: 9, fontWeight: "900", letterSpacing: 1.7 },
  title: { color: theme.color.text, fontSize: 22, fontWeight: "900", marginTop: 3 },
  content: { padding: 16 },
  subtitle: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, marginHorizontal: 4, marginBottom: 18 },
  loading: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "48.5%", borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  photoWrap: { height: 210, position: "relative", backgroundColor: theme.color.surfaceSoft },
  photo: { ...StyleSheet.absoluteFill },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.12)" },
  percent: { position: "absolute", top: 10, right: 10, paddingHorizontal: 9, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: "rgba(11,11,13,0.68)" },
  percentText: { color: theme.color.white, fontSize: 10, fontWeight: "800" },
  nameWrap: { position: "absolute", left: 12, right: 12, bottom: 12 },
  name: { color: theme.color.white, fontSize: 16, fontWeight: "900" },
  area: { color: "rgba(255,255,255,0.8)", fontSize: 10, marginTop: 2 },
  cardBody: { padding: 12 },
  likedLabel: { color: theme.color.primary, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  likedValue: { color: theme.color.text, fontSize: 11, lineHeight: 16, minHeight: 50, marginTop: 6 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  viewBtn: { flex: 1, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceSoft, borderWidth: 1, borderColor: theme.color.border },
  viewText: { color: theme.color.text, fontSize: 11, fontWeight: "800" },
  likeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
  likeText: { color: theme.color.white, fontSize: 16 },
  infoCard: { padding: 16, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, marginBottom: 16 },
  infoTitle: { color: theme.color.text, fontSize: 14, fontWeight: "800" },
  infoBody: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  retry: { alignSelf: "flex-start", paddingHorizontal: 13, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.primarySoft, marginTop: 12 },
  retryText: { color: theme.color.primary, fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", padding: 28, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, marginBottom: 16 },
  emptyIcon: { color: theme.color.primary, fontSize: 36 },
  emptyTitle: { color: theme.color.text, fontSize: 17, fontWeight: "900", marginTop: 10 },
  emptyBody: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 6 },
  discoverBtn: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: theme.color.primary, alignItems: "center", justifyContent: "center", marginTop: 16 },
  discoverText: { color: theme.color.white, fontSize: 12, fontWeight: "800" },
});
