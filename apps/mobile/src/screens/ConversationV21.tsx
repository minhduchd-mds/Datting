import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ListEnter, PressableScale, Skeleton } from "../components/Feedback";
import { haptic } from "../motion/haptics";
import { theme } from "../theme";
import type { Message } from "./SocialScreens";

export function ConversationV21({
  peerName,
  peerPhotoUrl,
  messages,
  loading,
  starters,
  startersLoading,
  onSend,
  onRetry,
  onOpenReport,
  onOpenDatePlan,
}: {
  peerName: string;
  peerPhotoUrl: string;
  messages: Message[];
  loading: boolean;
  starters: string[];
  startersLoading: boolean;
  onSend: (text: string) => void;
  onRetry: (id: string) => void;
  onOpenReport: () => void;
  onOpenDatePlan: () => void;
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

  const pickStarter = (text: string) => {
    // Không tự gửi: đưa vào composer để người dùng đọc/sửa trước.
    setDraft(text);
    void haptic.selection();
  };

  const showAssist = !loading && messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <Image source={{ uri: peerPhotoUrl }} style={styles.avatar} />
        <View style={styles.headerBody}>
          <Text style={styles.name}>{peerName}</Text>
          <Text style={styles.status}>Đã kết nối · bắt đầu tự nhiên</Text>
        </View>
        <PressableScale style={styles.planBtn} onPress={onOpenDatePlan} hapticOnPress="selection" accessibilityLabel="Lên kế hoạch hẹn">
          <Text style={styles.planIcon}>⌁</Text>
          <Text style={styles.planText}>Hẹn</Text>
        </PressableScale>
        <PressableScale style={styles.moreBtn} onPress={onOpenReport} hapticOnPress="selection" accessibilityLabel="Báo cáo hoặc chặn">
          <Text style={styles.more}>⋯</Text>
        </PressableScale>
      </View>

      {showAssist && (
        <View style={styles.assist}>
          <View style={styles.assistHead}>
            <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.assistTitle}>Gợi ý mở lời</Text>
              <Text style={styles.assistSub}>Dựa trên tín hiệu thật trong hồ sơ. Chạm để đưa vào ô soạn — Datting không tự gửi thay bạn.</Text>
            </View>
          </View>

          {startersLoading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.starterList}>
              {[0, 1].map((i) => <Skeleton key={i} width={250} height={78} radius={18} />)}
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.starterList}>
              {starters.map((starter, index) => (
                <ListEnter key={`${index}:${starter}`} index={index}>
                  <PressableScale style={styles.starterCard} onPress={() => pickStarter(starter)} hapticOnPress="selection" accessibilityLabel={`Dùng gợi ý ${starter}`}>
                    <Text style={styles.starterText} numberOfLines={4}>{starter}</Text>
                    <Text style={styles.useText}>Dùng gợi ý →</Text>
                  </PressableScale>
                </ListEnter>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.loading}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ alignItems: i % 2 ? "flex-start" : "flex-end" }}>
              <Skeleton width={i % 2 ? "55%" : "70%"} height={44} radius={18} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.messages, showAssist && styles.messagesEmpty]}
          renderItem={({ item, index }) => (
            <ListEnter index={Math.min(index, 8)}>
              <Bubble msg={item} onRetry={onRetry} />
            </ListEnter>
          )}
          ListEmptyComponent={showAssist ? <View style={{ height: 8 }} /> : null}
          onContentSizeChange={() => {
            if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
          }}
        />
      )}

      <View style={styles.composerWrap}>
        {draft.trim().length > 0 && showAssist && (
          <View style={styles.draftHint}>
            <Text style={styles.draftHintText}>Gợi ý đã được đưa vào ô soạn. Bạn có thể sửa bất kỳ chữ nào trước khi gửi.</Text>
          </View>
        )}
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Nhắn tin…"
            placeholderTextColor={theme.color.textSoft}
            style={styles.input}
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
            <Text style={styles.sendText}>↑</Text>
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg, onRetry }: { msg: Message; onRetry: (id: string) => void }) {
  const mine = msg.fromMe;
  return (
    <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirRow]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs, msg.status === "failed" && styles.failed]}>
        <Text style={styles.bubbleText}>{msg.body}</Text>
      </View>
      {mine && (
        <Text style={styles.messageStatus}>
          {msg.status === "sending" && "Đang gửi…"}
          {msg.status === "sent" && "Đã gửi"}
          {msg.status === "read" && "Đã xem"}
          {msg.status === "failed" && <Text style={styles.retry} onPress={() => onRetry(msg.id)}>Gửi lại</Text>}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  header: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.background },
  avatar: { width: 46, height: 46, borderRadius: 18, backgroundColor: theme.color.surface },
  headerBody: { flex: 1 },
  name: { color: theme.color.text, fontSize: 16, fontWeight: "900" },
  status: { color: theme.color.textSoft, fontSize: 10, marginTop: 3 },
  planBtn: { minWidth: 54, height: 38, paddingHorizontal: 10, borderRadius: 19, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: theme.color.primarySoft, borderWidth: 1, borderColor: "rgba(240,98,116,0.26)" },
  planIcon: { color: theme.color.primary, fontSize: 15 },
  planText: { color: theme.color.primary, fontSize: 10, fontWeight: "800" },
  moreBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  more: { color: theme.color.textMuted, fontSize: 20, lineHeight: 20 },
  assist: { paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  assistHead: { paddingHorizontal: 16, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  aiBadge: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
  aiBadgeText: { color: theme.color.white, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  assistTitle: { color: theme.color.text, fontSize: 13, fontWeight: "900" },
  assistSub: { color: theme.color.textMuted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  starterList: { paddingHorizontal: 16, paddingTop: 12, gap: 9 },
  starterCard: { width: 260, minHeight: 82, padding: 13, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  starterText: { color: theme.color.text, fontSize: 12, lineHeight: 18 },
  useText: { color: theme.color.primary, fontSize: 10, fontWeight: "800", marginTop: 8 },
  loading: { flex: 1, padding: 16, gap: 12 },
  messages: { padding: 16, gap: 10, flexGrow: 1, justifyContent: "flex-end" },
  messagesEmpty: { flexGrow: 0 },
  bubbleRow: { maxWidth: "84%", marginBottom: 3 },
  mineRow: { alignSelf: "flex-end", alignItems: "flex-end" },
  theirRow: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 19 },
  mine: { backgroundColor: theme.color.primary, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, borderBottomLeftRadius: 6 },
  failed: { borderWidth: 1, borderColor: theme.color.danger },
  bubbleText: { color: theme.color.white, fontSize: 14, lineHeight: 20 },
  messageStatus: { color: theme.color.textSoft, fontSize: 9, marginTop: 4 },
  retry: { color: theme.color.danger, fontWeight: "800" },
  composerWrap: { borderTopWidth: 1, borderTopColor: theme.color.border, backgroundColor: theme.color.background },
  draftHint: { paddingHorizontal: 16, paddingTop: 7 },
  draftHintText: { color: theme.color.textSoft, fontSize: 9, lineHeight: 13 },
  composer: { padding: 10, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: { flex: 1, maxHeight: 120, minHeight: 46, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 23, color: theme.color.text, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, fontSize: 14 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
  sendText: { color: theme.color.white, fontSize: 22, fontWeight: "900", lineHeight: 24 },
  disabled: { opacity: 0.35 },
});
