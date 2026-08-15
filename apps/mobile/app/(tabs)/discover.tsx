/**
 * Discover V2.
 *
 * Giữ optimistic swipe + offline queue, bổ sung tầng "hiểu hồ sơ trước khi
 * quyết định" và tách rõ hai CTA sau match: nhắn tin / xem hồ sơ.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, type DeckCard } from "../../src/api";
import { MatchCelebration } from "../../src/components/MatchCelebration";
import { SwipeDeck, type Card, type SwipeAction } from "../../src/components/SwipeDeck";
import { PressableScale } from "../../src/components/Feedback";
import { bump } from "../../src/live";
import { useLocalProfile } from "../../src/profileStore";
import { flushSwipes, queueSwipe } from "../../src/swipeQueue";
import { EmptyState, ErrorState } from "../../src/screens/SocialScreens";
import { theme } from "../../src/theme";

const PAGE = 20;

interface Celebration {
  card: DeckCard;
  matchId: string;
}

export default function Deck() {
  const insets = useSafeAreaInsets();
  const me = useLocalProfile();
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const loadingMore = useRef(false);

  const load = useCallback(async (append: boolean) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    if (!append) setLoading(true);
    try {
      const next = await api.fetchDeck(PAGE);
      setCards((cur) => (append ? [...cur, ...next] : next));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      loadingMore.current = false;
    }
  }, []);

  useEffect(() => {
    void load(false);
    void flushSwipes();
  }, [load]);

  const onSwipe = useCallback((card: Card, action: SwipeAction) => {
    const full = cards.find((c) => c.userId === card.userId);
    void queueSwipe(card.userId, action).then((result) => {
      if (!result?.matched || !full) return;
      setCelebration({ card: full, matchId: result.pairKey });
      bump("matches");
      bump("notifications");
    });
  }, [cards]);

  const openProfile = useCallback((card: Card) => {
    const full = cards.find((c) => c.userId === card.userId);
    if (!full) return;
    router.push(profileRoute(full) as never);
  }, [cards]);

  if (failed && cards.length === 0) return <ErrorState onRetry={() => void load(false)} />;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.brand}>DATTING</Text>
          <View style={styles.modeRow}>
            <Text style={styles.mode}>Dành cho bạn</Text>
            <Text style={styles.caret}>⌄</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <PressableScale style={styles.headerBtn} onPress={() => {}} hapticOnPress="selection" accessibilityLabel="Bộ lọc">
            <Text style={styles.headerIcon}>≋</Text>
          </PressableScale>
          <PressableScale
            style={styles.headerBtn}
            onPress={() => router.push("/(tabs)/notifications" as never)}
            hapticOnPress="selection"
            accessibilityLabel="Thông báo"
          >
            <Text style={styles.headerIcon}>♢</Text>
          </PressableScale>
        </View>
      </View>

      <View style={styles.deckArea}>
        <SwipeDeck
          cards={cards}
          loading={loading}
          onSwipe={onSwipe}
          onNeedMore={() => void load(true)}
          onOpenProfile={openProfile}
          onEmpty={() => (
            <EmptyState
              title="Hết gợi ý phù hợp quanh đây"
              body="Thử mở rộng khoảng cách hoặc quay lại sau. Deck ưu tiên chất lượng thay vì lặp hồ sơ đã xem."
              actionLabel="Tải lại"
              onAction={() => void load(false)}
            />
          )}
        />
      </View>

      {celebration && (
        <View style={StyleSheet.absoluteFill}>
          <MatchCelebration
            mePhotoUrl={me?.photos[0] ?? ""}
            themPhotoUrl={celebration.card.photoUrl}
            themName={celebration.card.name}
            matchPercent={celebration.card.matchPercent ?? 0}
            breakdown={celebration.card.breakdown}
            commonPoints={celebration.card.commonPoints}
            onMessage={() => {
              const { matchId, card } = celebration;
              setCelebration(null);
              router.push({
                pathname: "/chat/[matchId]",
                params: { matchId, name: card.name, photo: card.photoUrl },
              } as never);
            }}
            onViewProfile={() => {
              const card = celebration.card;
              setCelebration(null);
              router.push(profileRoute(card) as never);
            }}
            onClose={() => setCelebration(null)}
          />
        </View>
      )}
    </View>
  );
}

function profileRoute(card: DeckCard) {
  return {
    pathname: "/profile/[userId]",
    params: {
      userId: card.userId,
      name: card.name,
      age: String(card.age),
      community: card.community,
      photo: card.photoUrl,
      topics: JSON.stringify(card.topics),
      matchPercent: String(card.matchPercent ?? 0),
      commonPoints: JSON.stringify(card.commonPoints),
    },
  } as const;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  header: { minHeight: 84, paddingHorizontal: 18, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: theme.color.primary, fontSize: 10, fontWeight: "900", letterSpacing: 2.1 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 4 },
  mode: { color: theme.color.text, fontSize: 22, lineHeight: 27, fontWeight: "900" },
  caret: { color: theme.color.textMuted, fontSize: 16 },
  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  headerIcon: { color: theme.color.text, fontSize: 20, lineHeight: 22, includeFontPadding: false },
  deckArea: { flex: 1 },
});
