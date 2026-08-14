/**
 * Hội thoại.
 *
 * ─── Gửi tin là lạc quan, và trạng thái phải THẬT ─────────────────────────
 * Tin hiện ngay với `status: "sending"`, rồi chuyển "sent" hoặc "failed". Bản
 * tin "failed" ở lại trong luồng kèm nút gửi lại — không tự biến mất. Tin nhắn
 * âm thầm bốc hơi là kiểu lỗi tệ nhất trong một app nhắn tin: người gửi tưởng
 * đã gửi, người nhận không bao giờ thấy, và không ai biết chuyện gì xảy ra.
 *
 * ─── Chặn và huỷ ghép có hiệu lực NGAY ────────────────────────────────────
 * `router.back()` chạy trước khi API trả về. Người vừa bị quấy rối không phải
 * nhìn kẻ quấy rối thêm một giây nào để chờ mạng. Nếu lệnh gọi hỏng, hàng đợi
 * phía server sẽ nhận lại ở lần sau; điều không được phép xảy ra là bắt người
 * dùng chờ.
 *
 * ─── matchId chính là pairKey ─────────────────────────────────────────────
 * Một cặp có đúng một khoá `min:max`, nên hội thoại có đúng một URL. Không thể
 * có hai màn chat cho cùng hai người — đó là bất biến số 1 chảy thẳng ra tới
 * tầng điều hướng.
 */
import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Modal, View } from "react-native";

import { api } from "../../src/api";
import { bump } from "../../src/live";
import {
  ConversationScreen,
  ReportBlockSheet,
  type Message,
} from "../../src/screens/SocialScreens";
import { currentSession } from "../../src/session";

export default function Chat() {
  const { matchId, name, photo } = useLocalSearchParams<{
    matchId: string;
    name?: string;
    photo?: string;
  }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .fetchMessages(matchId)
      .then((m) => alive && setMessages(m))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [matchId]);

  const deliver = useCallback(
    (tempId: string, body: string) => {
      api
        .sendMessage(matchId, body)
        .then((sent) =>
          // Thay bản tạm bằng bản server trả về: id thật, mốc thời gian thật.
          // Giữ id tạm sẽ làm hỏng dedupe khi lần fetch sau kéo về cùng tin đó.
          setMessages((cur) => cur.map((m) => (m.id === tempId ? sent : m))),
        )
        .catch(() =>
          setMessages((cur) =>
            cur.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)),
          ),
        );
    },
    [matchId],
  );

  const send = useCallback(
    (text: string) => {
      const tempId = `tmp_${Date.now()}`;
      setMessages((cur) => [
        ...cur,
        { id: tempId, body: text, fromMe: true, at: Date.now(), status: "sending" },
      ]);
      deliver(tempId, text);
    },
    [deliver],
  );

  const retry = useCallback(
    (id: string) => {
      const failed = messages.find((m) => m.id === id);
      if (!failed) return;
      setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, status: "sending" } : m)));
      deliver(id, failed.body);
    },
    [deliver, messages],
  );

  // Đối phương là phía KIA của pairKey. Suy ra từ khoá thay vì tin vào tham số
  // route: tham số có thể bị sửa, khoá thì không nói dối được.
  const me = currentSession().userId ?? "";
  const [a, b] = matchId.split(":");
  const peerUserId = (me && a === me ? b : a) ?? "";
  const peerName = name ?? "Người ấy";

  return (
    <View style={{ flex: 1 }}>
      <ConversationScreen
        peerName={peerName}
        peerPhotoUrl={photo ?? ""}
        messages={messages}
        peerTyping={false}
        loading={loading}
        onSend={send}
        onRetry={retry}
        onOpenReport={() => setSheet(true)}
      />

      <Modal visible={sheet} animationType="slide" transparent onRequestClose={() => setSheet(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#000a" }}>
          <ReportBlockSheet
            peerName={peerName}
            onReport={async (code, detail) => {
              await api.report(peerUserId, code, detail);
            }}
            onBlock={async () => {
              setSheet(false);
              router.back();
              bump("matches");
              await api.block(peerUserId);
            }}
            onUnmatch={async () => {
              setSheet(false);
              router.back();
              bump("matches");
              await api.unmatch(matchId);
            }}
            onClose={() => setSheet(false)}
          />
        </View>
      </Modal>
    </View>
  );
}
