/**
 * Màn vuốt.
 *
 * ─── Vuốt là LẠC QUAN, và không thể khác ──────────────────────────────────
 * `SwipeDeck` gọi `onSwipe` ngay khi thẻ bay đi, không chờ mạng. Nếu chờ, thẻ
 * sẽ khựng lại giữa chừng trên 4G Việt Nam và cả nhịp vuốt sụp đổ.
 *
 * Hệ quả: một lượt vuốt có thể THẤT BẠI sau khi UI đã coi như xong. Không được
 * nuốt lỗi đó — màn Offline của app đang hứa nguyên văn "những lượt vuốt của
 * bạn đã được lưu và sẽ tự gửi khi có mạng trở lại". Lời hứa đó phải có code
 * đứng sau: xem `src/swipeQueue.ts`.
 *
 * ─── Vì sao deck nạp trước, không nạp theo thẻ ────────────────────────────
 * SwipeDeck bắn `onNeedMore` khi còn 8 thẻ. Nạp cả lô mới lúc đó, chứ không nạp
 * từng thẻ một: một lượt gọi 20 thẻ rẻ hơn nhiều so với 20 lượt gọi, và người
 * dùng vuốt nhanh hơn mạng trả lời.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api, type DeckCard } from "../../src/api";
import { Toast } from "../../src/components/Feedback";
import { MatchCelebration } from "../../src/components/MatchCelebration";
import { SwipeDeck, type Card, type SwipeAction } from "../../src/components/SwipeDeck";
import { bump } from "../../src/live";
import { EmptyState, ErrorState } from "../../src/screens/SocialScreens";
import { flushSwipes, queueSwipe } from "../../src/swipeQueue";
import { useBackToExit } from "../../src/useBackToExit";

const PAGE = 20;

interface Celebration {
  card: DeckCard;
  matchId: string;
}

export default function Deck() {
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  // Chống nạp chồng: `onNeedMore` có thể bắn nhiều lần trước khi lô đầu về.
  const loadingMore = useRef(false);

  // Back ở đây KHÔNG có gì để quay lại: app/index.tsx dùng `<Redirect>` (tức
  // `replace`), nên cây điều hướng sâu đúng 1 và Android sẽ đóng app. Cổng ở
  // @datting/core biến lần bấm đầu thành một lời cảnh báo.
  const [exitHint, setExitHint] = useState(false);
  useBackToExit(useCallback(() => setExitHint(true), []));

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
    // Mở lại app là lúc hợp lý nhất để đẩy các lượt vuốt còn kẹt trong hàng đợi.
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

  if (failed && cards.length === 0) {
    return <ErrorState onRetry={() => void load(false)} />;
  }

  return (
    <View style={styles.root}>
      <SwipeDeck
        cards={cards}
        loading={loading}
        onSwipe={onSwipe}
        onNeedMore={() => void load(true)}
        onEmpty={() => (
          <EmptyState
            title="Hết người phù hợp quanh đây"
            body="Mở rộng khoảng cách tìm kiếm hoặc quay lại sau — mỗi ngày đều có người mới tham gia."
            actionLabel="Tải lại"
            onAction={() => void load(false)}
          />
        )}
      />

      <Toast
        kind="info"
        message="Nhấn lần nữa để thoát"
        visible={exitHint}
        onDismiss={() => setExitHint(false)}
      />

      {celebration && (
        <View style={StyleSheet.absoluteFill}>
          <MatchCelebration
            // Ảnh của chính mình chưa có endpoint hồ sơ nên tạm để trống; component
            // vẫn dựng đúng bố cục, chỉ thiếu một nửa ảnh. Thà thiếu ảnh còn hơn
            // gán bừa ảnh người khác vào chỗ "bạn".
            mePhotoUrl=""
            themPhotoUrl={celebration.card.photoUrl}
            themName={celebration.card.name}
            matchPercent={celebration.card.matchPercent ?? 0}
            breakdown={celebration.card.breakdown}
            commonPoints={celebration.card.commonPoints}
            onViewProfile={() => {
              const { matchId, card } = celebration;
              setCelebration(null);
              router.push({
                pathname: "/chat/[matchId]",
                params: { matchId, name: card.name, photo: card.photoUrl },
              } as never);
            }}
            onClose={() => setCelebration(null)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d0d10" },
});
