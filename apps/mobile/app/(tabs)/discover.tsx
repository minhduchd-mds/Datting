/**
 * Discover V3 — Editorial Discovery.
 *
 * Giữ optimistic swipe + offline queue, nhưng nâng hierarchy để người dùng hiểu
 * ngay đây là khu vực khám phá người phù hợp chứ không phải một card stack vô danh.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, DISTANCE_PRESETS_KM, type DeckCard } from "../../src/api";
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

  /**
   * `null` = chưa chọn ⇒ dùng `preferences.max_distance_km` đã lưu phía server.
   * Đây là lựa chọn của PHIÊN XEM, cố ý không ghi vào hồ sơ tiêu chí: nới bán
   * kính để xem thử một lúc không có nghĩa là người dùng đã đổi tiêu chí của họ.
   */
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(
    async (append: boolean) => {
      if (loadingMore.current) return;
      loadingMore.current = true;
      if (!append) setLoading(true);
      try {
        const next = await api.fetchDeck(PAGE, maxKm ?? undefined);
        setCards((cur) => (append ? [...cur, ...next] : next));
        setFailed(false);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        loadingMore.current = false;
      }
    },
    [maxKm],
  );

  // `load` đổi tham chiếu khi `maxKm` đổi ⇒ effect chạy lại ⇒ deck tự nạp lại
  // theo bán kính mới. Không cần một effect riêng canh `maxKm`.
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
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>DATTING · DISCOVERY</Text>
          <View style={styles.modeRow}>
            <Text style={styles.mode}>Gặp người hợp gu</Text>
            <Text style={styles.caret}>⌄</Text>
          </View>
          <Text style={styles.subtitle}>Ưu tiên điểm chung, nhịp sống và điều bạn thật sự quan tâm.</Text>
        </View>

        <View style={styles.headerActions}>
          <PressableScale
            style={[styles.headerBtn, maxKm !== null && styles.headerBtnOn]}
            onPress={() => setFilterOpen(true)}
            hapticOnPress="selection"
            accessibilityLabel={maxKm === null ? "Bộ lọc khoảng cách" : `Bộ lọc khoảng cách, đang đặt ${maxKm} km`}
          >
            <Text style={[styles.headerIcon, maxKm !== null && styles.headerIconOn]}>≋</Text>
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

      <View style={styles.discoveryMeta}>
        <View style={styles.metaPill}>
          <View style={[styles.dot, styles.dotPrimary]} />
          <Text style={styles.metaText}>Đề xuất cá nhân hóa</Text>
        </View>
        <View style={styles.metaPill}>
          <View style={[styles.dot, styles.dotSky]} />
          {/* Bộ lọc đang bật phải NHÌN THẤY ĐƯỢC ở đây, không chỉ ở icon. Nếu
              deck thưa đi mà không có gì giải thích, người dùng sẽ tưởng hết người. */}
          <Text style={styles.metaText}>
            {maxKm === null ? "Hồ sơ mới trước" : `Trong ${maxKm} km`}
          </Text>
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
                params: {
                  matchId,
                  name: card.name,
                  photo: card.photoUrl,
                  peerUserId: card.userId,
                  commonPoints: JSON.stringify(card.commonPoints),
                },
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

      <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Khoảng cách</Text>
            <Text style={styles.sheetSub}>
              Chỉ áp dụng cho lần xem này. Tiêu chí đã lưu trong hồ sơ của bạn không thay đổi.
            </Text>

            <View style={styles.presetRow}>
              {DISTANCE_PRESETS_KM.map((km) => {
                const on = maxKm === km;
                return (
                  <PressableScale
                    key={km}
                    style={[styles.preset, on && styles.presetOn]}
                    onPress={() => {
                      setMaxKm(km);
                      setFilterOpen(false);
                    }}
                    hapticOnPress="selection"
                    accessibilityLabel={`Trong ${km} ki-lô-mét`}
                  >
                    <Text style={[styles.presetText, on && styles.presetTextOn]}>{km} km</Text>
                  </PressableScale>
                );
              })}
            </View>

            <PressableScale
              style={styles.sheetGhost}
              onPress={() => {
                setMaxKm(null);
                setFilterOpen(false);
              }}
              hapticOnPress="selection"
              accessibilityLabel="Dùng tiêu chí đã lưu"
            >
              <Text style={styles.sheetGhostText}>Dùng tiêu chí đã lưu</Text>
            </PressableScale>
            <PressableScale
              style={styles.sheetGhost}
              onPress={() => setFilterOpen(false)}
              hapticOnPress="selection"
              accessibilityLabel="Đóng"
            >
              <Text style={styles.sheetGhostText}>Đóng</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function profileRoute(card: DeckCard) {
  return {
    pathname: "/profile/[userId]",
    params: {
      userId: card.userId,
      name: card.name,
      age: String(card.age),
      community: card.community,
      photo: card.photoUrl,
      topics: JSON.stringify(card.topics),
      prompts: JSON.stringify(card.prompts),
      matchPercent: String(card.matchPercent ?? 0),
      commonPoints: JSON.stringify(card.commonPoints),
    },
  } as const;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  header: {
    minHeight: 112,
    paddingHorizontal: 18,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  titleBlock: { flex: 1, paddingRight: 4 },
  eyebrow: {
    color: theme.color.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
  },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 5 },
  mode: {
    color: theme.color.text,
    fontSize: theme.type.h1,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  caret: { color: theme.color.textMuted, fontSize: 16 },
  subtitle: {
    maxWidth: 270,
    color: theme.color.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
    fontWeight: "500",
  },
  headerActions: { flexDirection: "row", gap: 7, paddingTop: 2 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  headerBtnOn: { borderColor: theme.color.primary, backgroundColor: theme.color.primarySoft },
  headerIcon: {
    color: theme.color.text,
    fontSize: 18,
    lineHeight: 21,
    includeFontPadding: false,
  },
  headerIconOn: { color: theme.color.primary },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: theme.color.overlayStrong },
  sheet: {
    backgroundColor: theme.color.surfaceElevated,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderTopWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.xxl,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.borderStrong,
    marginBottom: theme.space.lg,
  },
  sheetTitle: { color: theme.color.text, fontSize: theme.type.h2, fontWeight: "800" },
  sheetSub: { color: theme.color.textMuted, fontSize: theme.type.meta, lineHeight: 19, marginTop: 6 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm, marginTop: theme.space.lg },
  preset: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  presetOn: { borderColor: theme.color.primary, backgroundColor: theme.color.primarySoft },
  presetText: { color: theme.color.textMuted, fontSize: theme.type.body, fontWeight: "600" },
  presetTextOn: { color: theme.color.text },
  sheetGhost: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  sheetGhostText: { color: theme.color.textMuted, fontSize: theme.type.body, fontWeight: "600" },
  discoveryMeta: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotPrimary: { backgroundColor: theme.color.primary },
  dotSky: { backgroundColor: theme.color.sky },
  metaText: { color: theme.color.textMuted, fontSize: 10, fontWeight: "700" },
  deckArea: { flex: 1, paddingBottom: 64 },
});
