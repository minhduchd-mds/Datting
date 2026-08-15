/**
 * MÀN BỔ SUNG #6–#9: Hội thoại · Báo cáo/Chặn · Thông báo · Trạng thái lỗi.
 *
 * Ba frame hội thoại trong Figma (`21925:45520`, `45549`, `22139:45691`) đều là
 * ảnh phẳng, không có layer con — tức là chưa được thiết kế. Đây lại chính là
 * màn người dùng ở lại lâu nhất sau khi match.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, Image,
} from "react-native";
import Animated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { REPORT_REASON, type ReportReason } from "@datting/core";
import { ListEnter, PressableScale, Skeleton, Toast } from "../components/Feedback";
import { useMotionConfig } from "../motion/useMotionConfig";
import { haptic } from "../motion/haptics";

/* ===========================================================================
 * MÀN 6 — HỘI THOẠI
 *
 * Bốn quyết định định hình toàn bộ màn này:
 *
 * 1. GỬI LẠC QUAN. Tin nhắn hiện NGAY với trạng thái "đang gửi", không chờ
 *    server. Nếu lỗi → hiện nút gửi lại NGAY TRÊN bong bóng đó, không phải
 *    một toast chung chung. Người dùng phải biết chính xác tin nào chưa đi.
 *
 * 2. "ĐANG GÕ" LÀ TẠM THỜI, KHÔNG BAO GIỜ GHI DB. Nó đi qua pub/sub và chết
 *    sau 3 giây không có sự kiện mới. Lưu nó xuống DB là lãng phí thuần tuý.
 *
 * 3. ĐÃ ĐỌC LÀ CON TRỎ, KHÔNG PHẢI CỜ TỪNG TIN. Một bản ghi
 *    `read_cursor(conversation_id, user_id, last_read_id)` thay vì N bản ghi.
 *
 * 4. BÁO CÁO/CHẶN LUÔN TRONG TẦM VỚI. App Store soi rất kỹ điểm này với dating
 *    app — nút phải nằm ở header hội thoại, không giấu trong 3 lớp menu.
 * =========================================================================== */
export type MessageStatus = "sending" | "sent" | "failed" | "read";

export interface Message {
  id: string;
  body: string;
  fromMe: boolean;
  at: number;
  status: MessageStatus;
}

export function ConversationScreen({
  peerName,
  peerPhotoUrl,
  messages,
  peerTyping,
  loading,
  onSend,
  onRetry,
  onOpenReport,
}: {
  peerName: string;
  peerPhotoUrl: string;
  messages: Message[];
  peerTyping: boolean;
  loading: boolean;
  onSend: (text: string) => void;
  onRetry: (id: string) => void;
  onOpenReport: () => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  const send = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    void haptic.light();
    onSend(t);
    setDraft("");
  }, [draft, onSend]);

  // Gợi ý mở lời — sinh từ điểm chung, chỉ hiện khi hội thoại còn TRỐNG.
  // Hiện suốt sẽ thành rác; hiện đúng lúc thì gỡ được đúng điểm nghẽn lớn nhất
  // của mọi dating app: "match rồi, giờ nói gì?"
  const showIcebreakers = messages.length === 0 && !loading;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.chatHeader}>
        <Image source={{ uri: peerPhotoUrl }} style={styles.chatAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName}>{peerName}</Text>
          {peerTyping && <Text style={styles.typingHint}>đang nhập…</Text>}
        </View>
        {/* Luôn trong tầm với — yêu cầu của App Store với dating app. */}
        <PressableScale onPress={onOpenReport} hapticOnPress="selection" accessibilityLabel="Báo cáo hoặc chặn">
          <Ionicons name="ellipsis-horizontal" size={22} color="#8b949e" />
        </PressableScale>
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={i % 2 ? "55%" : "70%"} height={44} radius={18} />
          ))}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item, index }) => (
            <ListEnter index={Math.min(index, 8)}>
              <Bubble msg={item} onRetry={onRetry} />
            </ListEnter>
          )}
          ListHeaderComponent={peerTyping ? <TypingBubble /> : null}
        />
      )}

      {showIcebreakers && (
        <View style={styles.icebreakers}>
          <Text style={styles.icebreakerLabel}>Gợi ý mở lời từ điểm chung của hai bạn</Text>
          {["Chào bạn! Thấy bạn cũng mê chạy bộ — hay chạy cung nào thế?",
            "Hi! Mình thấy hai đứa cùng làm về dữ liệu, rảnh cà phê trao đổi không?"].map((t, i) => (
            <ListEnter key={t} index={i}>
              <PressableScale style={styles.icebreaker} onPress={() => onSend(t)} hapticOnPress="light">
                <Text style={styles.icebreakerText}>{t}</Text>
              </PressableScale>
            </ListEnter>
          ))}
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Nhắn tin…"
          placeholderTextColor="#484f58"
          style={styles.composerInput}
          multiline
          accessibilityLabel="Soạn tin nhắn"
        />
        <PressableScale
          style={[styles.sendBtn, !draft.trim() && styles.disabled]}
          disabled={!draft.trim()}
          onPress={send}
          hapticOnPress="none"
          accessibilityLabel="Gửi"
        >
          <Text style={styles.sendText}>Gửi</Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg, onRetry }: { msg: Message; onRetry: (id: string) => void }) {
  const mine = msg.fromMe;
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, msg.status === "failed" && styles.bubbleFailed]}>
        <Text style={styles.bubbleText}>{msg.body}</Text>
      </View>
      {mine && (
        <Text style={styles.status}>
          {msg.status === "sending" && "Đang gửi…"}
          {msg.status === "sent" && "Đã gửi"}
          {msg.status === "read" && "Đã xem"}
          {msg.status === "failed" && (
            <Text style={styles.retry} onPress={() => onRetry(msg.id)}>
              Gửi lại
            </Text>
          )}
        </Text>
      )}
    </View>
  );
}

/**
 * Ba chấm "đang gõ".
 * Chi tiết đáng chú ý: ba chấm lệch pha nhau, KHÔNG nhấp nháy đồng loạt.
 * Đồng loạt trông như lỗi render; lệch pha trông như có người ở đầu bên kia.
 */
function TypingBubble() {
  const m = useMotionConfig();
  return (
    <View style={[styles.bubbleRow, styles.rowTheirs]}>
      <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
        {[0, 1, 2].map((i) => (
          <TypingDot key={i} index={i} enabled={!m.reduceMotion} />
        ))}
      </View>
    </View>
  );
}

function TypingDot({ index, enabled }: { index: number; enabled: boolean }) {
  const v = useSharedValue(0);
  React.useEffect(() => {
    if (!enabled) return;
    v.value = withRepeat(
      withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [v, enabled]);
  const style = useAnimatedStyle(() => {
    // Lệch pha 0 / 0.2 / 0.4 chu kỳ
    const shifted = (v.value + index * 0.2) % 1;
    return {
      opacity: enabled ? interpolate(shifted, [0, 0.5, 1], [0.3, 1, 0.3]) : 0.6,
      transform: enabled ? [{ translateY: interpolate(shifted, [0, 0.5, 1], [0, -3, 0]) }] : [],
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

/* ===========================================================================
 * MÀN 7 — BÁO CÁO / CHẶN / GỠ KẾT NỐI
 *
 * Không thương lượng: App Store từ chối dating app không có luồng này rõ ràng.
 *
 * Nguyên tắc quan trọng nhất: HÀNH ĐỘNG PHẢI CÓ HIỆU LỰC NGAY VỀ MẶT HIỂN THỊ,
 * kể cả khi việc xử lý phía server còn đang chạy. Người vừa bị quấy rối không
 * được phải nhìn thấy kẻ quấy rối thêm một giây nào để chờ API trả về.
 * =========================================================================== */
/**
 * Nhãn cho từng mã lý do.
 *
 * Kiểu là `Record<ReportReason, string>` chứ KHÔNG phải mảng tự do: thiếu một
 * mã hoặc bịa thêm một mã đều thành lỗi biên dịch. Đó chính là thứ đã trôi mất
 * một lần — bản trước viết tay số 1..6, trong khi database chỉ biết 1..5, nên
 * mọi báo cáo "Lý do khác" gửi đi mã 6 và rơi vào NaN ở hàng đợi kiểm duyệt.
 */
const REPORT_LABEL: Record<ReportReason, string> = {
  [REPORT_REASON.SPAM]: "Spam hoặc quảng cáo",
  [REPORT_REASON.HARASSMENT]: "Quấy rối, xúc phạm",
  [REPORT_REASON.IMPERSONATION]: "Hồ sơ giả mạo / không phải người thật",
  [REPORT_REASON.BAD_CONTENT]: "Nội dung nhạy cảm, không phù hợp",
  [REPORT_REASON.SCAM]: "Lừa đảo, xin tiền",
  [REPORT_REASON.OTHER]: "Lý do khác",
};

/** Thứ tự HIỂN THỊ — nặng trước, "khác" cuối. Không phải thứ tự mã số. */
export const REPORT_REASONS: readonly { code: ReportReason; label: string }[] = [
  REPORT_REASON.HARASSMENT,
  REPORT_REASON.SCAM,
  REPORT_REASON.BAD_CONTENT,
  REPORT_REASON.IMPERSONATION,
  REPORT_REASON.SPAM,
  REPORT_REASON.OTHER,
].map((code) => ({ code, label: REPORT_LABEL[code] }));

export function ReportBlockSheet({
  peerName,
  onReport,
  onBlock,
  onUnmatch,
  onClose,
}: {
  peerName: string;
  onReport: (code: number, detail: string) => Promise<void>;
  onBlock: () => Promise<void>;
  onUnmatch: () => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<number | null>(null);
  const [detail, setDetail] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>Báo cáo {peerName}</Text>
      <Text style={styles.sub}>
        Báo cáo của bạn được xử lý ẩn danh. {peerName} sẽ không biết ai đã báo cáo.
      </Text>

      {REPORT_REASONS.map((r, i) => (
        <ListEnter key={r.code} index={i}>
          <PressableScale
            style={[styles.reason, reason === r.code && styles.reasonOn]}
            onPress={() => setReason(r.code)}
            hapticOnPress="selection"
            accessibilityLabel={r.label}
          >
            <Text style={[styles.reasonText, reason === r.code && styles.reasonTextOn]}>{r.label}</Text>
          </PressableScale>
        </ListEnter>
      ))}

      {reason === REPORT_REASON.OTHER && (
        <TextInput
          value={detail}
          onChangeText={setDetail}
          placeholder="Mô tả ngắn gọn (không bắt buộc)"
          placeholderTextColor="#484f58"
          style={styles.detailInput}
          multiline
          accessibilityLabel="Mô tả chi tiết"
        />
      )}

      <PressableScale
        style={styles.checkRow}
        onPress={() => setAlsoBlock((v) => !v)}
        hapticOnPress="selection"
        accessibilityLabel="Đồng thời chặn người này"
      >
        <View style={[styles.checkbox, alsoBlock && styles.checkboxOn]} />
        <Text style={styles.checkLabel}>Đồng thời chặn người này</Text>
      </PressableScale>

      <PressableScale
        style={[styles.danger, reason === null && styles.disabled]}
        disabled={reason === null}
        hapticOnPress="none"
        accessibilityLabel="Gửi báo cáo"
        onPress={async () => {
          if (reason === null) return;
          void haptic.success();
          // Ẩn NGAY trên UI; API chạy nền. Không bắt nạn nhân chờ mạng.
          onClose();
          try {
            await onReport(reason, detail);
            if (alsoBlock) await onBlock();
          } catch {
            setToast("Không gửi được báo cáo. Chúng tôi sẽ thử lại tự động.");
          }
        }}
      >
        <Text style={styles.dangerText}>Gửi báo cáo</Text>
      </PressableScale>

      <PressableScale style={styles.ghostRow} onPress={() => void onUnmatch()} hapticOnPress="light" accessibilityLabel="Huỷ kết nối">
        <Text style={styles.ghostText}>Huỷ kết nối (không báo cáo)</Text>
      </PressableScale>
      <PressableScale style={styles.ghostRow} onPress={onClose} hapticOnPress="selection" accessibilityLabel="Đóng">
        <Text style={styles.ghostText}>Đóng</Text>
      </PressableScale>

      <Toast kind="error" message={toast ?? ""} visible={!!toast} onDismiss={() => setToast(null)} />
    </View>
  );
}

/* ===========================================================================
 * MÀN 8 — THÔNG BÁO (icon `alarm 1` trong Figma có, nhưng chưa có màn)
 * =========================================================================== */
export interface NotificationItem {
  id: string;
  kind: "match" | "message" | "intro" | "pair" | "system";
  title: string;
  body: string;
  at: number;
  read: boolean;
}

/**
 * Icon cho từng loại thông báo — MỘT bộ (Ionicons), không phải ký tự Unicode.
 *
 * Bản trước trộn `♥ ✉ ⓘ` (ký tự đơn sắc, ăn theo `color`) với `👥 ✨` (emoji
 * MÀU, không ăn theo `color`). Trong cùng một danh sách dọc, hai loại đó không
 * bao giờ cân nhau về nét lẫn về màu — và không có cách nào chỉnh, vì chúng
 * không cùng một bộ chữ.
 *
 * `Record<kind, name>` chứ không phải object tự do: thêm một `kind` mới mà quên
 * icon là lỗi biên dịch, không phải một ô trống lúc chạy.
 */
const KIND_ICON: Record<
  NotificationItem["kind"],
  React.ComponentProps<typeof Ionicons>["name"]
> = {
  match: "heart",
  message: "chatbubble",
  intro: "people",
  pair: "sparkles",
  system: "information-circle",
};

export function NotificationsScreen({
  items,
  onOpen,
  onMarkAllRead,
}: {
  items: NotificationItem[];
  onOpen: (n: NotificationItem) => void;
  onMarkAllRead: () => void;
}) {
  const unread = useMemo(() => items.filter((i) => !i.read).length, [items]);

  if (items.length === 0) {
    return <EmptyState title="Chưa có thông báo nào" body="Khi có người kết nối hoặc nhắn tin, bạn sẽ thấy ở đây." />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.notifHeader}>
        <Text style={styles.h1}>Thông báo</Text>
        {unread > 0 && (
          <PressableScale onPress={onMarkAllRead} hapticOnPress="selection" accessibilityLabel="Đánh dấu đã đọc tất cả">
            <Text style={styles.markRead}>Đánh dấu đã đọc</Text>
          </PressableScale>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item, index }) => (
          <ListEnter index={index}>
            <PressableScale
              style={[styles.notif, !item.read && styles.notifUnread]}
              onPress={() => onOpen(item)}
              hapticOnPress="light"
              accessibilityLabel={`${item.title}. ${item.body}`}
            >
              <Ionicons name={KIND_ICON[item.kind]} size={20} color="#e0567a" style={styles.notifIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.notifTitle}>{item.title}</Text>
                <Text style={styles.notifBody}>{item.body}</Text>
              </View>
              {!item.read && <View style={styles.unreadDot} />}
            </PressableScale>
          </ListEnter>
        )}
      />
    </View>
  );
}

/* ===========================================================================
 * MÀN 9 — TRẠNG THÁI: rỗng · mất mạng · hết lượt · lỗi hệ thống
 *
 * Quy tắc của mọi trạng thái lỗi: NÓI CHUYỆN GÌ ĐANG XẢY RA, và CHO MỘT VIỆC
 * ĐỂ LÀM. "Đã có lỗi xảy ra" mà không có nút nào là đẩy người dùng vào ngõ cụt.
 * =========================================================================== */
export function EmptyState({
  title, body, actionLabel, onAction,
}: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.stateRoot}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      {actionLabel && onAction && (
        <PressableScale style={styles.primary} onPress={onAction} hapticOnPress="light" accessibilityLabel={actionLabel}>
          <Text style={styles.primaryText}>{actionLabel}</Text>
        </PressableScale>
      )}
    </View>
  );
}

export function OfflineState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="Không có kết nối mạng"
      body="Những lượt vuốt của bạn đã được lưu và sẽ tự gửi khi có mạng trở lại."
      actionLabel="Thử lại"
      onAction={onRetry}
    />
  );
}

/**
 * Hết lượt vuốt.
 * Đồng hồ đếm ngược PHẢI chạy thật — hiển thị "còn 3 giờ" tĩnh khiến người dùng
 * cảm thấy bị lừa. Và luôn cho một lối thoát (hoàn thiện hồ sơ / nâng cấp).
 */
export function RateLimitState({
  resetAt, onImproveProfile,
}: { resetAt: number; onImproveProfile: () => void }) {
  const [now, setNow] = useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, resetAt - now);
  const h = Math.floor(left / 3_600_000);
  const mi = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);

  return (
    <View style={styles.stateRoot}>
      <Text style={styles.stateTitle}>Bạn đã dùng hết lượt hôm nay</Text>
      <Text style={styles.countdown}>
        {String(h).padStart(2, "0")}:{String(mi).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </Text>
      <Text style={styles.stateBody}>
        Trong lúc chờ, hoàn thiện hồ sơ sẽ giúp bạn xuất hiện với nhiều người phù hợp hơn.
      </Text>
      <PressableScale style={styles.primary} onPress={onImproveProfile} hapticOnPress="light" accessibilityLabel="Hoàn thiện hồ sơ">
        <Text style={styles.primaryText}>Hoàn thiện hồ sơ</Text>
      </PressableScale>
    </View>
  );
}

export function ErrorState({ onRetry, correlationId }: { onRetry: () => void; correlationId?: string }) {
  return (
    <View style={styles.stateRoot}>
      <Text style={styles.stateTitle}>Có gì đó không ổn</Text>
      <Text style={styles.stateBody}>
        Chúng tôi đã ghi nhận sự cố và đang xử lý. Bạn có thể thử lại ngay.
      </Text>
      <PressableScale style={styles.primary} onPress={onRetry} hapticOnPress="light" accessibilityLabel="Thử lại">
        <Text style={styles.primaryText}>Thử lại</Text>
      </PressableScale>
      {/* Mã tham chiếu giúp bộ phận hỗ trợ tìm đúng trace trong OpenTelemetry. */}
      {correlationId && <Text style={styles.corr}>Mã tham chiếu: {correlationId}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d1117" },
  h1: { color: "#e6edf3", fontSize: 22, fontWeight: "700" },
  sub: { color: "#8b949e", fontSize: 13, lineHeight: 20, marginTop: 6 },

  chatHeader: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 32, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#21262d",
  },
  chatAvatar: { width: 38, height: 38, borderRadius: 19 },
  chatName: { color: "#e6edf3", fontSize: 16, fontWeight: "600" },
  typingHint: { color: "#34d399", fontSize: 12 },
  moreBtn: { color: "#8b949e", fontSize: 24 },

  bubbleRow: { maxWidth: "82%" },
  rowMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  rowTheirs: { alignSelf: "flex-start" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: "#f43f5e", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "#21262d", borderBottomLeftRadius: 4 },
  bubbleFailed: { backgroundColor: "#7f1d2b" },
  bubbleText: { color: "#fff", fontSize: 15, lineHeight: 21 },
  status: { color: "#6e7681", fontSize: 11, marginTop: 3 },
  retry: { color: "#f43f5e", fontWeight: "700", textDecorationLine: "underline" },
  typing: { flexDirection: "row", gap: 5, alignItems: "center", paddingVertical: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#8b949e" },

  icebreakers: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  icebreakerLabel: { color: "#8b949e", fontSize: 12, marginBottom: 4 },
  icebreaker: { backgroundColor: "#161b22", borderWidth: 1, borderColor: "#30363d", borderRadius: 14, padding: 12 },
  icebreakerText: { color: "#c9d1d9", fontSize: 14, lineHeight: 20 },

  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 12,
    borderTopWidth: 1, borderTopColor: "#21262d",
  },
  composerInput: {
    flex: 1, maxHeight: 120, backgroundColor: "#161b22", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, color: "#e6edf3", fontSize: 15,
  },
  sendBtn: { backgroundColor: "#f43f5e", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11 },
  sendText: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.4 },

  sheet: { backgroundColor: "#0d1117", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#30363d", alignSelf: "center", marginBottom: 18 },
  sheetTitle: { color: "#e6edf3", fontSize: 19, fontWeight: "700" },
  reason: { borderWidth: 1, borderColor: "#30363d", borderRadius: 12, padding: 14, marginTop: 8 },
  reasonOn: { borderColor: "#f43f5e", backgroundColor: "rgba(244,63,94,.1)" },
  reasonText: { color: "#c9d1d9", fontSize: 14 },
  reasonTextOn: { color: "#fff", fontWeight: "600" },
  detailInput: {
    backgroundColor: "#161b22", borderRadius: 12, borderWidth: 1, borderColor: "#30363d",
    color: "#e6edf3", padding: 12, marginTop: 10, height: 80, textAlignVertical: "top",
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: "#30363d" },
  checkboxOn: { backgroundColor: "#f43f5e", borderColor: "#f43f5e" },
  checkLabel: { color: "#c9d1d9", fontSize: 14 },
  danger: { backgroundColor: "#f43f5e", borderRadius: 999, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  dangerText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  ghostRow: { paddingVertical: 13, alignItems: "center" },
  ghostText: { color: "#8b949e", fontSize: 14 },

  notifHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: Platform.OS === "ios" ? 60 : 36, paddingBottom: 12,
  },
  markRead: { color: "#38bdf8", fontSize: 13 },
  notif: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  notifUnread: { backgroundColor: "#12171f" },
  notifIcon: { fontSize: 18, width: 26, textAlign: "center", color: "#f43f5e" },
  notifTitle: { color: "#e6edf3", fontSize: 14, fontWeight: "600" },
  notifBody: { color: "#8b949e", fontSize: 13, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#f43f5e" },

  stateRoot: { flex: 1, backgroundColor: "#0d1117", alignItems: "center", justifyContent: "center", padding: 32 },
  stateTitle: { color: "#e6edf3", fontSize: 19, fontWeight: "700", textAlign: "center" },
  stateBody: { color: "#8b949e", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 },
  countdown: { color: "#f43f5e", fontSize: 34, fontWeight: "800", marginTop: 16, fontVariant: ["tabular-nums"] },
  primary: { backgroundColor: "#f43f5e", borderRadius: 999, paddingHorizontal: 28, paddingVertical: 14, marginTop: 22 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  corr: { color: "#484f58", fontSize: 11, marginTop: 18, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
});

