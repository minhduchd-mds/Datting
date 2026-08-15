/**
 * Hội thoại V2.1.
 *
 * Gửi tin vẫn optimistic; AI starter chỉ tạo bản nháp, KHÔNG tự gửi. Date plan
 * là local-first ở V2.1 và tách khỏi message transport để không làm bẩn contract
 * realtime hiện tại.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Modal, View } from "react-native";

import { api, type CommonPoint } from "../../src/api";
import { bump } from "../../src/live";
import { ConversationV21 } from "../../src/screens/ConversationV21";
import { ReportBlockSheet, type Message } from "../../src/screens/SocialScreens";
import { currentSession } from "../../src/session";
import { socialStore } from "../../src/socialStore";

function parsePoints(raw?: string): CommonPoint[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CommonPoint =>
        typeof x === "object" && x !== null &&
        typeof (x as { label?: unknown }).label === "string" &&
        typeof (x as { value?: unknown }).value === "string",
    );
  } catch {
    return [];
  }
}

export default function Chat() {
  const { matchId, name, photo, peerUserId: peerFromRoute, commonPoints: rawPoints } = useLocalSearchParams<{
    matchId: string;
    name?: string;
    photo?: string;
    peerUserId?: string;
    commonPoints?: string;
  }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [starters, setStarters] = useState<string[]>([]);
  const [startersLoading, setStartersLoading] = useState(true);

  const me = currentSession().userId ?? "";
  const [a, b] = matchId.split(":");
  const peerUserId = peerFromRoute ?? ((me && a === me ? b : a) ?? "");
  const peerName = name ?? "Người ấy";
  const commonPoints = useMemo(() => parsePoints(rawPoints), [rawPoints]);

  useEffect(() => {
    let alive = true;
    api
      .fetchMessages(matchId)
      .then((m) => alive && setMessages(m))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [matchId]);

  useEffect(() => {
    let alive = true;
    setStartersLoading(true);
    const likeContext = peerUserId ? socialStore.likeFor(peerUserId) : null;
    api
      .conversationStarters({
        matchId,
        peerName,
        commonPoints,
        likeContext: likeContext ? { kind: likeContext.kind, label: likeContext.label } : null,
      })
      .then((items) => alive && setStarters(items))
      .catch(() => {
        if (alive) setStarters([`Chào ${peerName}! Tuần này có điều gì làm bạn thấy vui nhất?`]);
      })
      .finally(() => alive && setStartersLoading(false));
    return () => { alive = false; };
  }, [matchId, peerName, peerUserId, commonPoints]);

  const deliver = useCallback(
    (tempId: string, body: string) => {
      api
        .sendMessage(matchId, body)
        .then((sent) =>
          setMessages((cur) => cur.map((m) => (m.id === tempId ? sent : m))),
        )
        .catch(() =>
          setMessages((cur) => cur.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m))),
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

  return (
    <View style={{ flex: 1 }}>
      <ConversationV21
        peerName={peerName}
        peerPhotoUrl={photo ?? ""}
        messages={messages}
        loading={loading}
        starters={starters}
        startersLoading={startersLoading}
        onSend={send}
        onRetry={retry}
        onOpenReport={() => setSheet(true)}
        onOpenDatePlan={() => router.push({ pathname: "/date-plan/[matchId]", params: { matchId, name: peerName } } as never)}
      />

      <Modal visible={sheet} animationType="slide" transparent onRequestClose={() => setSheet(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#000a" }}>
          <ReportBlockSheet
            peerName={peerName}
            onReport={async (code, detail) => { await api.report(peerUserId, code, detail); }}
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
