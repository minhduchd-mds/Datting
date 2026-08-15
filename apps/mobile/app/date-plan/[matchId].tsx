import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "../../src/components/Feedback";
import { socialStore } from "../../src/socialStore";
import { theme } from "../../src/theme";

const ACTIVITIES = ["Cà phê", "Ăn tối", "Đi bộ", "Triển lãm", "Xem phim", "Tự chọn"] as const;
const TIMES = ["Sáng", "Trưa", "Chiều", "Tối"] as const;

export default function DatePlanScreen() {
  const insets = useSafeAreaInsets();
  const { matchId, name } = useLocalSearchParams<{ matchId: string; name?: string }>();
  const saved = socialStore.datePlan(matchId);

  const [activity, setActivity] = useState(saved?.activity ?? "Cà phê");
  const [dateLabel, setDateLabel] = useState(saved?.dateLabel ?? "");
  const [timeLabel, setTimeLabel] = useState(saved?.timeLabel ?? "Tối");
  const [area, setArea] = useState(saved?.area ?? "");
  const [publicPlace, setPublicPlace] = useState(saved?.publicPlace ?? true);
  const [sharePlanWithFriend, setSharePlanWithFriend] = useState(saved?.sharePlanWithFriend ?? true);

  const canSave = Boolean(activity.trim() && dateLabel.trim() && timeLabel.trim() && area.trim());

  const save = () => {
    if (!canSave) return;
    const now = Date.now();
    socialStore.saveDatePlan({
      matchId,
      peerName: name ?? "Người ấy",
      activity: activity.trim(),
      dateLabel: dateLabel.trim(),
      timeLabel: timeLabel.trim(),
      area: area.trim(),
      publicPlace,
      sharePlanWithFriend,
      createdAt: saved?.createdAt ?? now,
      updatedAt: now,
    });
    router.back();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <PressableScale style={styles.backBtn} onPress={() => router.back()} hapticOnPress="selection" accessibilityLabel="Quay lại">
          <Text style={styles.back}>‹</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DATE PLAN</Text>
          <Text style={styles.title}>Hẹn gặp {name ?? "người ấy"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Một kế hoạch rõ ràng, ít áp lực</Text>
          <Text style={styles.introBody}>Datting chỉ lưu bản nháp này trên thiết bị ở V2.1. App không tự gửi địa điểm hay thời gian cho đối phương.</Text>
        </View>

        <Section title="Hai bạn muốn làm gì?">
          <View style={styles.chips}>
            {ACTIVITIES.map((x) => (
              <PressableScale key={x} style={[styles.chip, activity === x && styles.chipOn]} onPress={() => setActivity(x)} hapticOnPress="selection">
                <Text style={[styles.chipText, activity === x && styles.chipTextOn]}>{x}</Text>
              </PressableScale>
            ))}
          </View>
          {activity === "Tự chọn" && (
            <TextInput value={activity === "Tự chọn" ? "" : activity} onChangeText={setActivity} placeholder="Nhập hoạt động" placeholderTextColor={theme.color.textSoft} style={styles.input} />
          )}
        </Section>

        <Section title="Khi nào?">
          <TextInput
            value={dateLabel}
            onChangeText={setDateLabel}
            placeholder="Ví dụ: Thứ Bảy 22/08"
            placeholderTextColor={theme.color.textSoft}
            style={styles.input}
            accessibilityLabel="Ngày hẹn"
          />
          <View style={styles.chips}>
            {TIMES.map((x) => (
              <PressableScale key={x} style={[styles.chip, timeLabel === x && styles.chipOn]} onPress={() => setTimeLabel(x)} hapticOnPress="selection">
                <Text style={[styles.chipText, timeLabel === x && styles.chipTextOn]}>{x}</Text>
              </PressableScale>
            ))}
          </View>
        </Section>

        <Section title="Khu vực">
          <TextInput
            value={area}
            onChangeText={setArea}
            placeholder="Ví dụ: Cầu Giấy · nơi công cộng"
            placeholderTextColor={theme.color.textSoft}
            style={styles.input}
            accessibilityLabel="Khu vực hẹn"
          />
          <Text style={styles.hint}>Chỉ cần khu vực. Không cần lưu địa chỉ nhà hoặc vị trí riêng tư trong kế hoạch.</Text>
        </Section>

        <Section title="Safety check">
          <SafetyToggle
            title="Ưu tiên nơi công cộng"
            body="Quán, trung tâm thương mại, công viên hoặc địa điểm có người xung quanh."
            value={publicPlace}
            onPress={() => setPublicPlace((v) => !v)}
          />
          <SafetyToggle
            title="Chia sẻ kế hoạch với người tin cậy"
            body="Đây là checklist nhắc việc; Datting V2.1 không tự gửi dữ liệu cho bên thứ ba."
            value={sharePlanWithFriend}
            onPress={() => setSharePlanWithFriend((v) => !v)}
          />
        </Section>

        {saved && (
          <PressableScale style={styles.deleteBtn} onPress={() => { socialStore.clearDatePlan(matchId); router.back(); }} hapticOnPress="light">
            <Text style={styles.deleteText}>Xoá kế hoạch hiện tại</Text>
          </PressableScale>
        )}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <PressableScale style={[styles.saveBtn, !canSave && styles.disabled]} disabled={!canSave} onPress={save} hapticOnPress="success" accessibilityLabel="Lưu kế hoạch hẹn">
          <Text style={styles.saveText}>{saved ? "Cập nhật kế hoạch" : "Lưu kế hoạch"}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function SafetyToggle({ title, body, value, onPress }: { title: string; body: string; value: boolean; onPress: () => void }) {
  return (
    <PressableScale style={styles.safetyRow} onPress={onPress} hapticOnPress="selection" accessibilityLabel={title}>
      <View style={[styles.check, value && styles.checkOn]}><Text style={styles.checkText}>{value ? "✓" : ""}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.safetyTitle}>{title}</Text>
        <Text style={styles.safetyBody}>{body}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  topbar: { minHeight: 84, paddingHorizontal: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  back: { color: theme.color.text, fontSize: 30, lineHeight: 31 },
  eyebrow: { color: theme.color.primary, fontSize: 9, fontWeight: "900", letterSpacing: 1.7 },
  title: { color: theme.color.text, fontSize: 21, fontWeight: "900", marginTop: 3 },
  content: { padding: 20, gap: 24 },
  intro: { padding: 18, borderRadius: theme.radius.lg, backgroundColor: theme.color.primarySoft, borderWidth: 1, borderColor: "rgba(240,98,116,0.24)" },
  introTitle: { color: theme.color.text, fontSize: 16, fontWeight: "900" },
  introBody: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  section: { gap: 12 },
  sectionTitle: { color: theme.color.text, fontSize: 17, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 13, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  chipOn: { backgroundColor: theme.color.primarySoft, borderColor: "rgba(240,98,116,0.4)" },
  chipText: { color: theme.color.textMuted, fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: theme.color.primary },
  input: { minHeight: 52, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, color: theme.color.text, paddingHorizontal: 14, fontSize: 14 },
  hint: { color: theme.color.textSoft, fontSize: 11, lineHeight: 16 },
  safetyRow: { flexDirection: "row", gap: 12, padding: 14, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  check: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.color.borderStrong, backgroundColor: theme.color.surfaceSoft },
  checkOn: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  checkText: { color: theme.color.white, fontSize: 12, fontWeight: "900" },
  safetyTitle: { color: theme.color.text, fontSize: 13, fontWeight: "800" },
  safetyBody: { color: theme.color.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  deleteBtn: { alignSelf: "center", paddingHorizontal: 16, paddingVertical: 10 },
  deleteText: { color: theme.color.danger, fontSize: 12, fontWeight: "700" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: "rgba(11,11,13,0.96)", borderTopWidth: 1, borderTopColor: theme.color.border },
  saveBtn: { height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.primary },
  saveText: { color: theme.color.white, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.42 },
});
