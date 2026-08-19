import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, Modal, ScrollView, StyleSheet, Text, View, type ImageStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../../src/api";
import { PressableScale } from "../../src/components/Feedback";
import { bump } from "../../src/live";
import type { ProfilePrompt } from "../../src/profileStore";
import { ReportBlockSheet } from "../../src/screens/SocialScreens";
import { socialStore, type LikeTargetKind } from "../../src/socialStore";
import { queueSwipe } from "../../src/swipeQueue";
import { theme } from "../../src/theme";

function parseList(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parsePoints(raw?: string): { label: string; value: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is { label: string; value: string } =>
        typeof x === "object" && x !== null &&
        typeof (x as { label?: unknown }).label === "string" &&
        typeof (x as { value?: unknown }).value === "string",
    );
  } catch {
    return [];
  }
}

function parsePrompts(raw?: string): ProfilePrompt[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is ProfilePrompt =>
        typeof x === "object" && x !== null &&
        typeof (x as { id?: unknown }).id === "string" &&
        typeof (x as { question?: unknown }).question === "string" &&
        typeof (x as { answer?: unknown }).answer === "string" &&
        Boolean((x as { answer: string }).answer.trim()),
    ).slice(0, 3);
  } catch {
    return [];
  }
}

export default function ProfileDetail() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    userId: string;
    name?: string;
    age?: string;
    community?: string;
    photo?: string;
    topics?: string;
    prompts?: string;
    matchPercent?: string;
    commonPoints?: string;
  }>();

  const topics = parseList(params.topics);
  const points = parsePoints(params.commonPoints);
  const prompts = parsePrompts(params.prompts);
  const match = Number(params.matchPercent ?? 0);
  const [liking, setLiking] = useState(false);
  const [likedLabel, setLikedLabel] = useState<string | null>(null);
  const [matchedId, setMatchedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  const like = async (kind: LikeTargetKind, label: string) => {
    if (liking || likedLabel) return;
    setLiking(true);
    socialStore.rememberLike({ peerUserId: params.userId, kind, label, at: Date.now() });
    setLikedLabel(label);
    try {
      const result = await queueSwipe(params.userId, "like");
      if (result?.matched) {
        setMatchedId(result.pairKey);
        bump("matches");
        bump("notifications");
      }
    } finally {
      setLiking(false);
    }
  };

  const openChat = () => {
    if (!matchedId) return;
    router.replace({
      pathname: "/chat/[matchId]",
      params: {
        matchId: matchedId,
        name: params.name ?? "Người ấy",
        photo: params.photo ?? "",
        peerUserId: params.userId,
        commonPoints: params.commonPoints ?? "[]",
      },
    } as never);
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 124 }}>
        <View style={styles.hero}>
          {params.photo ? <Image source={{ uri: params.photo }} style={styles.photo as ImageStyle} /> : <View style={styles.photo} />}
          <View style={styles.scrim} />
          <View style={[styles.topbar, { top: insets.top + 8 }]}>
            <PressableScale style={styles.iconBtn} onPress={() => router.back()} hapticOnPress="selection" accessibilityLabel="Quay lại">
              <Text style={styles.iconText}>‹</Text>
            </PressableScale>
            <PressableScale
              style={styles.iconBtn}
              onPress={() => setSheet(true)}
              hapticOnPress="selection"
              accessibilityLabel="Báo cáo hoặc chặn người này"
            >
              <Text style={styles.more}>···</Text>
            </PressableScale>
          </View>

          <PressableScale
            style={[styles.photoLike, likedLabel === "Ảnh đầu tiên" && styles.likedButton]}
            onPress={() => void like("photo", "Ảnh đầu tiên")}
            disabled={Boolean(likedLabel)}
            hapticOnPress="medium"
            accessibilityLabel="Thích ảnh này"
          >
            <Text style={styles.photoLikeIcon}>♥</Text>
            <Text style={styles.photoLikeText}>{likedLabel === "Ảnh đầu tiên" ? "Đã thích ảnh" : "Thích ảnh"}</Text>
          </PressableScale>

          <View style={styles.heroInfo}>
            {match > 0 && (
              <View style={styles.matchPill}>
                <Text style={styles.matchPillText}>✦ {match}% phù hợp</Text>
              </View>
            )}
            <Text style={styles.name}>{params.name ?? "Hồ sơ"}{params.age ? `, ${params.age}` : ""}</Text>
            <Text style={styles.community}>{params.community ?? ""}</Text>
          </View>
        </View>

        <View style={styles.body}>
          {points.length > 0 && (
            <Section title="Vì sao hai bạn được gợi ý">
              <View style={styles.reasonGrid}>
                {points.slice(0, 4).map((p) => (
                  <View key={`${p.label}:${p.value}`} style={styles.reasonCard}>
                    <Text style={styles.reasonLabel}>{p.label}</Text>
                    <Text style={styles.reasonValue}>{p.value}</Text>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {prompts.length > 0 && (
            <Section title="Một chút có chất riêng">
              <View style={styles.promptList}>
                {prompts.map((prompt) => {
                  const selected = likedLabel === prompt.answer;
                  return (
                    <View key={prompt.id} style={styles.promptCard}>
                      <Text style={styles.promptQuestion}>{prompt.question}</Text>
                      <Text style={styles.promptAnswer}>{prompt.answer}</Text>
                      <PressableScale
                        style={[styles.promptLike, selected && styles.promptLikeOn]}
                        onPress={() => void like("prompt", prompt.answer)}
                        disabled={Boolean(likedLabel)}
                        hapticOnPress="medium"
                        accessibilityLabel={`Thích câu trả lời ${prompt.answer}`}
                      >
                        <Text style={[styles.promptLikeText, selected && styles.promptLikeTextOn]}>{selected ? "♥ Đã thích câu này" : "♡ Thích câu này"}</Text>
                      </PressableScale>
                    </View>
                  );
                })}
              </View>
            </Section>
          )}

          {topics.length > 0 && (
            <Section title="Sở thích">
              <View style={styles.topics}>
                {topics.map((topic) => (
                  <View key={topic} style={styles.topic}>
                    <Text style={styles.topicText}>{topic}</Text>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {likedLabel && !matchedId && (
            <View style={styles.sentNote}>
              <Text style={styles.sentTitle}>Đã gửi lượt thích</Text>
              <Text style={styles.sentBody}>Nếu hai bạn cùng chọn nhau, phần bạn thích sẽ được dùng làm ngữ cảnh gợi ý mở lời — không tự gửi tin nhắn thay bạn.</Text>
            </View>
          )}

          <View style={styles.safetyNote}>
            <Text style={styles.safetyTitle}>Gặp gỡ an toàn</Text>
            <Text style={styles.safetyBody}>Datting chỉ hiển thị khu vực và khoảng cách đã làm mờ. Không hiển thị địa chỉ hay lịch sử vị trí.</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {matchedId ? (
          <PressableScale style={styles.matchCta} onPress={openChat} hapticOnPress="medium" accessibilityLabel="Nhắn lời chào">
            <Text style={styles.matchCtaTitle}>Hai bạn đã kết nối ♥</Text>
            <Text style={styles.matchCtaText}>Nhắn lời chào</Text>
          </PressableScale>
        ) : (
          <View style={styles.bottomRow}>
            <PressableScale
              style={styles.backDecision}
              onPress={() => router.back()}
              hapticOnPress="selection"
              accessibilityLabel="Quay lại khám phá"
            >
              <Text style={styles.backDecisionText}>‹</Text>
            </PressableScale>
            <PressableScale
              style={[styles.likeProfile, Boolean(likedLabel) && styles.likeProfileDone]}
              onPress={() => void like("profile", "Hồ sơ")}
              disabled={Boolean(likedLabel) || liking}
              hapticOnPress="medium"
              accessibilityLabel="Thích hồ sơ"
            >
              <Text style={styles.likeProfileText}>{likedLabel ? "Đã gửi lượt thích" : "♥  Thích hồ sơ"}</Text>
            </PressableScale>
          </View>
        )}
      </View>

      {/*
        Sheet an toàn mở từ hồ sơ ứng viên — dùng CHUNG component với màn hội
        thoại, nên luồng báo cáo giống hệt nhau ở hai nơi.

        KHÔNG truyền `onUnmatch`: ở đây chưa chắc đã có kết nối để huỷ. Chặn thì
        `router.back()` NGAY rồi mới gọi API — người vừa báo cáo không phải nhìn
        lại hồ sơ đó thêm một giây nào để chờ mạng.
      */}
      <Modal visible={sheet} animationType="slide" transparent onRequestClose={() => setSheet(false)}>
        <View style={styles.sheetBackdrop}>
          <ReportBlockSheet
            peerName={params.name ?? "người này"}
            onReport={async (code, detail) => {
              await api.report(params.userId, code, detail);
            }}
            onBlock={async () => {
              setSheet(false);
              router.back();
              bump("matches");
              await api.block(params.userId);
            }}
            onClose={() => setSheet(false)}
          />
        </View>
      </Modal>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: theme.color.overlayStrong },
  hero: { height: 560, backgroundColor: theme.color.surface, position: "relative" },
  photo: { ...StyleSheet.absoluteFill },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.16)" },
  topbar: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  iconBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(12,12,14,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  iconText: { color: theme.color.white, fontSize: 34, lineHeight: 34 },
  more: { color: theme.color.white, fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  photoLike: { position: "absolute", right: 18, bottom: 112, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, height: 40, borderRadius: 20, backgroundColor: "rgba(12,12,14,0.68)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  likedButton: { backgroundColor: "rgba(240,98,116,0.86)" },
  photoLikeIcon: { color: theme.color.white, fontSize: 14 },
  photoLikeText: { color: theme.color.white, fontSize: 11, fontWeight: "800" },
  heroInfo: { position: "absolute", left: 20, right: 20, bottom: 24 },
  matchPill: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, backgroundColor: "rgba(12,12,14,0.68)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", marginBottom: 10 },
  matchPillText: { color: theme.color.white, fontSize: 12, fontWeight: "800" },
  name: { color: theme.color.white, fontSize: 31, lineHeight: 36, fontWeight: "900" },
  community: { color: "rgba(255,255,255,0.84)", fontSize: 14, marginTop: 5 },
  body: { padding: 20, gap: 28 },
  section: { gap: 12 },
  sectionTitle: { color: theme.color.text, fontSize: 18, fontWeight: "800" },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  reasonCard: { width: "48.5%", minHeight: 94, padding: 14, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  reasonLabel: { color: theme.color.primary, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  reasonValue: { color: theme.color.text, fontSize: 14, lineHeight: 19, fontWeight: "600", marginTop: 8 },
  promptList: { gap: 12 },
  promptCard: { padding: 18, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  promptQuestion: { color: theme.color.primary, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  promptAnswer: { color: theme.color.text, fontSize: 20, lineHeight: 28, fontWeight: "700", marginTop: 10 },
  promptLike: { alignSelf: "flex-start", marginTop: 16, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.borderStrong },
  promptLikeOn: { backgroundColor: theme.color.primarySoft, borderColor: "rgba(240,98,116,0.42)" },
  promptLikeText: { color: theme.color.textMuted, fontSize: 11, fontWeight: "700" },
  promptLikeTextOn: { color: theme.color.primary },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topic: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: theme.radius.pill, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  topicText: { color: theme.color.text, fontSize: 13, fontWeight: "600" },
  sentNote: { padding: 16, borderRadius: theme.radius.md, backgroundColor: theme.color.primarySoft, borderWidth: 1, borderColor: "rgba(240,98,116,0.24)" },
  sentTitle: { color: theme.color.text, fontSize: 14, fontWeight: "800" },
  sentBody: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  safetyNote: { padding: 16, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  safetyTitle: { color: theme.color.text, fontSize: 14, fontWeight: "800" },
  safetyBody: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: "rgba(11,11,13,0.94)", borderTopWidth: 1, borderTopColor: theme.color.border },
  bottomRow: { flexDirection: "row", gap: 12 },
  backDecision: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.borderStrong },
  backDecisionText: { color: theme.color.text, fontSize: 30, lineHeight: 32 },
  likeProfile: { flex: 1, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
  likeProfileDone: { backgroundColor: theme.color.surfaceElevated, borderWidth: 1, borderColor: theme.color.border },
  likeProfileText: { color: theme.color.white, fontSize: 15, fontWeight: "800" },
  matchCta: { minHeight: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
  matchCtaTitle: { color: theme.color.white, fontSize: 11, fontWeight: "800" },
  matchCtaText: { color: theme.color.white, fontSize: 16, fontWeight: "900", marginTop: 2 },
});
