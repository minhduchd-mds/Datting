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
import { AppState, Modal, StyleSheet, View } from "react-native";

import { api, ApiError, type DeckCard } from "../../src/api";
import { Toast } from "../../src/components/Feedback";
import { MatchCelebration } from "../../src/components/MatchCelebration";
import { SwipeDeck, type Card, type SwipeAction } from "../../src/components/SwipeDeck";
import { bump } from "../../src/live";
import {
  EmptyState, ErrorState, OfflineState, RateLimitState, ReportBlockSheet,
} from "../../src/screens/SocialScreens";
import { flushSwipes, queueSwipe, undoLast } from "../../src/swipeQueue";
import { UndoBar } from "../../src/components/UndoBar";

const PAGE = 20;

/**
 * Ba kiểu hỏng, ba màn khác nhau. Gộp làm một cờ `failed` như trước là bảo
 * người mất mạng đi "Thử lại" (vô ích) và bảo người hết lượt rằng có sự cố (sai).
 */
type Failure =
  | { kind: "none" }
  | { kind: "offline" }
  | { kind: "rate-limit"; resetAt: number }
  | { kind: "error" };

/**
 * Mốc hết hạn hạn mức, đọc từ thân phản hồi 429 (`{ "reset_at": <epoch ms> }`).
 *
 * Chưa endpoint nào trả 429, nên nhánh dự phòng là nhánh sẽ chạy trước: lùi về
 * nửa đêm, vì hạn mức là theo NGÀY. Đồng hồ sai vài phút vẫn hơn một màn "hết
 * lượt" không nói được bao giờ hết.
 */
function resetAtFrom(body: string): number {
  try {
    const r = (JSON.parse(body) as { reset_at?: number }).reset_at;
    if (typeof r === "number" && Number.isFinite(r)) return r;
  } catch {
    /* thân không phải JSON — dùng mốc dự phòng */
  }
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

interface Celebration {
  card: DeckCard;
  matchId: string;
}

export default function Deck() {
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [index, setIndex] = useState(0);
  const [reporting, setReporting] = useState<DeckCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<Failure>({ kind: "none" });
  const [undoable, setUndoable] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  // Chống nạp chồng: `onNeedMore` có thể bắn nhiều lần trước khi lô đầu về.
  const loadingMore = useRef(false);

  const load = useCallback(async (append: boolean) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    if (!append) setLoading(true);
    try {
      const next = await api.fetchDeck(PAGE);
      setCards((cur) => (append ? [...cur, ...next] : next));
      // Deck MỚI thì con trỏ phải về 0. Không reset là lỗi cũ: "Tải lại" nạp
      // được 20 thẻ nhưng index vẫn ở 20 nên màn rỗng hiện lại y nguyên.
      if (!append) setIndex(0);
      setFailure({ kind: "none" });
    } catch (e) {
      // 429 là câu trả lời HỢP LỆ của server, không phải sự cố. Không có
      // response nào cả (fetch ném TypeError) thì gần như chắc chắn là mạng.
      if (e instanceof ApiError && e.status === 429) {
        setFailure({ kind: "rate-limit", resetAt: resetAtFrom(e.body) });
      } else if (e instanceof ApiError) {
        setFailure({ kind: "error" });
      } else {
        setFailure({ kind: "offline" });
      }
    } finally {
      setLoading(false);
      loadingMore.current = false;
    }
  }, []);

  useEffect(() => {
    void load(false);
    // Mở lại app là lúc hợp lý nhất để đẩy các lượt vuốt còn kẹt trong hàng đợi.
    void flushSwipes();

    // ...và cũng là mốc "có thể mạng đã về" rẻ nhất mà không thêm thư viện:
    // người mất mạng gần như luôn rời app rồi quay lại. netinfo chính xác hơn
    // nhưng là NATIVE MODULE — apps/mobile đã dính hai lần lỗi npm lồng bản thứ
    // hai của native module.
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") void flushSwipes();
    });
    return () => sub.remove();
  }, [load]);

  const onSwipe = useCallback((card: Card, action: SwipeAction) => {
    const full = cards.find((c) => c.userId === card.userId);
    setUndoable(true);
    queueSwipe(card.userId, action, (result) => {
      if (!result?.matched || !full) return;
      // Có match thì hoàn tác hết nghĩa lý — `canUndo` cũng sẽ từ chối, nhưng
      // để thanh hoàn tác nằm dưới màn ăn mừng là mời người dùng bấm một nút
      // chắc chắn thất bại.
      setUndoable(false);
      setCelebration({ card: full, matchId: result.pairKey });
      bump("matches");
      bump("notifications");
    });
  }, [cards]);

  const onUndo = useCallback(() => {
    setUndoable(false);
    void undoLast().then((v) => {
      if (v.ok) {
        // Lùi con trỏ, không dựng lại mảng: thẻ chưa bao giờ rời khỏi `cards`.
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      setUndoError(
        v.reason === "matched"
          ? "Hai bạn đã kết đôi rồi — dùng Huỷ kết nối nếu muốn gỡ."
          : "Không hoàn tác được lượt vuốt này nữa.",
      );
    });
  }, []);

  if (cards.length === 0) {
    if (failure.kind === "offline") return <OfflineState onRetry={() => void load(false)} />;
    if (failure.kind === "rate-limit") {
      return (
        <RateLimitState
          resetAt={failure.resetAt}
          // Chưa có màn "sửa hồ sơ" riêng; onboarding là chỗ duy nhất sửa được
          // hồ sơ hôm nay.
          onImproveProfile={() => router.push("/(onboarding)/profile" as never)}
        />
      );
    }
    if (failure.kind === "error") return <ErrorState onRetry={() => void load(false)} />;
  }

  return (
    <View style={styles.root}>
      <SwipeDeck
        cards={cards}
        index={index}
        onIndexChange={setIndex}
        loading={loading}
        onSwipe={onSwipe}
        onNeedMore={() => void load(true)}
        onOpenProfile={(card) => {
          // Truyền breakdown qua params: "Vì sao hợp nhau" chỉ tồn tại trong
          // ngữ cảnh một deck. Mở bằng deep link thì không có, và màn hồ sơ tự
          // ẩn phần đó thay vì bịa số.
          const full = cards.find((c) => c.userId === card.userId);
          router.push({
            pathname: "/profile/[userId]",
            params: {
              userId: card.userId,
              ...(full
                ? {
                    interest: String(full.breakdown.interest),
                    personality: String(full.breakdown.personality),
                    location: String(full.breakdown.location),
                  }
                : {}),
            },
          } as never);
        }}
        onReport={(card) =>
          setReporting(cards.find((c) => c.userId === card.userId) ?? null)
        }
        onEmpty={() => (
          <EmptyState
            title="Hết người phù hợp quanh đây"
            body="Mở rộng khoảng cách tìm kiếm hoặc quay lại sau — mỗi ngày đều có người mới tham gia."
            actionLabel="Tải lại"
            onAction={() => void load(false)}
          />
        )}
      />

      <UndoBar
        visible={undoable && celebration === null}
        onUndo={onUndo}
        onExpire={() => setUndoable(false)}
      />

      <Modal
        visible={reporting !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setReporting(null)}
      >
        <View style={styles.sheetBackdrop}>
          {reporting && (
            <ReportBlockSheet
              peerName={reporting.name}
              onReport={async (code, detail) => {
                await api.report(reporting.userId, code, detail);
              }}
              onBlock={async () => {
                const id = reporting.userId;
                setReporting(null);
                // Bỏ khỏi deck NGAY, không chờ mạng. Cùng nguyên tắc với màn
                // chat: người vừa bị quấy rối không phải nhìn thêm giây nào.
                setCards((cur) => cur.filter((c) => c.userId !== id));
                await api.block(id);
              }}
              // Chưa match thì không có gì để huỷ ghép — nút này chỉ đóng sheet.
              // Vẫn phải truyền vì sheet dùng chung với màn chat.
              onUnmatch={async () => setReporting(null)}
              onClose={() => setReporting(null)}
            />
          )}
        </View>
      </Modal>

      <Toast
        kind="error"
        message={undoError ?? ""}
        visible={undoError !== null}
        onDismiss={() => setUndoError(null)}
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
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#000a" },
});
