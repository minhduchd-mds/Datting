import { router, useLocalSearchParams } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View, type ImageStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "../../src/components/Feedback";
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

export default function ProfileDetail() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    userId: string;
    name?: string;
    age?: string;
    community?: string;
    photo?: string;
    topics?: string;
    matchPercent?: string;
    commonPoints?: string;
  }>();

  const topics = parseList(params.topics);
  const points = parsePoints(params.commonPoints);
  const match = Number(params.matchPercent ?? 0);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={styles.hero}>
          {params.photo ? <Image source={{ uri: params.photo }} style={styles.photo as ImageStyle} /> : <View style={styles.photo} />}
          <View style={styles.scrim} />
          <View style={[styles.topbar, { top: insets.top + 8 }]}>
            <PressableScale style={styles.iconBtn} onPress={() => router.back()} hapticOnPress="selection" accessibilityLabel="Quay lại">
              <Text style={styles.iconText}>‹</Text>
            </PressableScale>
            <PressableScale style={styles.iconBtn} onPress={() => {}} hapticOnPress="selection" accessibilityLabel="Tuỳ chọn hồ sơ">
              <Text style={styles.more}>···</Text>
            </PressableScale>
          </View>

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

          <View style={styles.safetyNote}>
            <Text style={styles.safetyTitle}>Gặp gỡ an toàn</Text>
            <Text style={styles.safetyBody}>Datting chỉ hiển thị khu vực và khoảng cách đã làm mờ. Không hiển thị địa chỉ hay lịch sử vị trí.</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <PressableScale
          style={styles.backDecision}
          onPress={() => router.back()}
          hapticOnPress="selection"
          accessibilityLabel="Quay lại khám phá để quyết định"
        >
          <Text style={styles.backDecisionText}>Quay lại để quyết định</Text>
        </PressableScale>
      </View>
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
  hero: { height: 560, backgroundColor: theme.color.surface, position: "relative" },
  photo: { ...StyleSheet.absoluteFill },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.16)" },
  topbar: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  iconBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(12,12,14,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  iconText: { color: theme.color.white, fontSize: 34, lineHeight: 34 },
  more: { color: theme.color.white, fontSize: 18, fontWeight: "800", letterSpacing: 1 },
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
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topic: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: theme.radius.pill, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  topicText: { color: theme.color.text, fontSize: 13, fontWeight: "600" },
  safetyNote: { padding: 16, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  safetyTitle: { color: theme.color.text, fontSize: 14, fontWeight: "800" },
  safetyBody: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: "rgba(11,11,13,0.94)", borderTopWidth: 1, borderTopColor: theme.color.border },
  backDecision: { height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
  backDecisionText: { color: theme.color.white, fontSize: 15, fontWeight: "800" },
});
