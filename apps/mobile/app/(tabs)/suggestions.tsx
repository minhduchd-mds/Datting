/**
 * Đề xuất — tab đầu tiên.
 *
 * ─── Vì sao tách khỏi Khám phá ────────────────────────────────────────────
 * Khám phá là VUỐT: nhịp nhanh, quyết định trong một giây, xem hết thì thôi.
 * Đề xuất là ĐỌC: ít người, mỗi người một lý do cụ thể vì sao được chọn.
 * Gộp hai nhịp đó vào một màn thì cái chậm luôn thua cái nhanh — người dùng
 * vuốt qua luôn phần đáng đọc.
 *
 * Mỗi thẻ nêu ĐIỂM CHUNG THẬT lấy từ `commonPoints`, không phải "gợi ý cho
 * bạn" chung chung. Đó là thứ duy nhất làm màn này khác một deck xếp hạng.
 */
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { api, type DeckCard } from "../../src/api";
import { ListEnter, PressableScale, Skeleton } from "../../src/components/Feedback";
import { EmptyState, ErrorState } from "../../src/screens/SocialScreens";
import { queueSwipe } from "../../src/swipeQueue";
import { C, R as RAD, S, T } from "../../src/theme";

export default function Suggestions() {
  const [items, setItems] = useState<DeckCard[]>([]);
  const [st, setSt] = useState<"loading" | "ready" | "failed">("loading");

  const load = useCallback(() => {
    setSt("loading");
    api.fetchDeck(8)
      .then((r) => { setItems(r); setSt("ready"); })
      .catch(() => setSt("failed"));
  }, []);
  useEffect(load, [load]);

  const like = useCallback((c: DeckCard) => {
    setItems((cur) => cur.filter((x) => x.userId !== c.userId));
    queueSwipe(c.userId, "like");
  }, []);

  if (st === "failed") return <ErrorState onRetry={load} />;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.h1}>Đề xuất</Text>
        <PressableScale
          onPress={() => router.push("/notifications" as never)}
          hapticOnPress="selection"
          accessibilityLabel="Thông báo"
        >
          <Ionicons name="notifications" size={24} color={C.textMuted} />
        </PressableScale>
      </View>
      <Text style={styles.sub}>Vài người hợp gu nhất hôm nay, kèm lý do.</Text>

      {st === "loading" ? (
        <View style={{ padding: S.lg, gap: S.md }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={120} radius={20} />)}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có đề xuất nào"
          body="Quay lại sau — mỗi ngày chúng tôi chọn lại một lượt."
          actionLabel="Tải lại"
          onAction={load}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.userId}
          contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: S.huge }}
          renderItem={({ item, index }) => (
            <ListEnter index={Math.min(index, 8)}>
              <PressableScale
                style={styles.card}
                onPress={() => router.push({
                  pathname: "/profile/[userId]",
                  params: {
                    userId: item.userId,
                    interest: String(item.breakdown.interest),
                    personality: String(item.breakdown.personality),
                    location: String(item.breakdown.location),
                  },
                } as never)}
                hapticOnPress="selection"
                accessibilityLabel={`Xem hồ sơ ${item.name}`}
              >
                <Image source={{ uri: item.photoUrl }} style={styles.photo} />
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}, {item.age}</Text>
                  <Text style={styles.where} numberOfLines={1}>{item.community}</Text>
                  {item.commonPoints[0] && (
                    <View style={styles.reason}>
                      <Ionicons name="sparkles" size={12} color={C.accent} />
                      <Text style={styles.reasonText} numberOfLines={1}>
                        {item.commonPoints[0].value}
                      </Text>
                    </View>
                  )}
                </View>
                <PressableScale
                  style={styles.like}
                  onPress={() => like(item)}
                  hapticOnPress="medium"
                  accessibilityLabel={`Kết nối với ${item.name}`}
                >
                  <Ionicons name="heart" size={20} color={C.textOn} />
                </PressableScale>
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
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: S.lg, paddingTop: S.huge,
  },
  h1: { color: C.text, fontSize: T.largeTitle, fontWeight: "800", letterSpacing: -0.6 },
  sub: { color: C.textMuted, fontSize: T.subhead, paddingHorizontal: S.lg, marginTop: S.xs },
  card: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: RAD.xl, padding: S.md,
  },
  photo: { width: 72, height: 96, borderRadius: RAD.md, backgroundColor: C.surfaceSunken },
  body: { flex: 1, gap: 2 },
  name: { color: C.text, fontSize: T.body, fontWeight: "700" },
  where: { color: C.textMuted, fontSize: T.footnote },
  reason: { flexDirection: "row", alignItems: "center", gap: S.xs, marginTop: S.xs },
  reasonText: { color: C.accent, fontSize: T.footnote, flex: 1 },
  like: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent,
    alignItems: "center", justifyContent: "center",
  },
});
