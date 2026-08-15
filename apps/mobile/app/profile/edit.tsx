import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "../../src/components/Feedback";
import { profileStore, useLocalProfile, type LocalProfile, type ProfilePrompt } from "../../src/profileStore";
import { theme } from "../../src/theme";

const PROMPT_OPTIONS = [
  "Một ngày lý tưởng của mình là…",
  "Điều nhỏ bé làm mình vui…",
  "Mình có thể nói hàng giờ về…",
  "Cuối tuần thường tìm mình ở…",
  "Một điều mình đánh giá cao ở người khác…",
  "Cách nhanh nhất để rủ mình đi chơi…",
] as const;

const EMPTY: LocalProfile = {
  displayName: "",
  jobTitle: "",
  community: "",
  bio: "",
  interests: [],
  intent: [],
  photos: [],
  prompts: [],
};

export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const stored = useLocalProfile();
  const [draft, setDraft] = useState<LocalProfile>(stored ?? EMPTY);

  useEffect(() => {
    if (stored) setDraft(stored);
  }, [stored]);

  const patch = (p: Partial<LocalProfile>) => setDraft((d) => ({ ...d, ...p }));

  const upsertPrompt = (index: number, p: Partial<ProfilePrompt>) => {
    setDraft((cur) => {
      const next = [...cur.prompts];
      const base = next[index] ?? {
        id: `prompt_${index + 1}`,
        question: PROMPT_OPTIONS[index] ?? PROMPT_OPTIONS[0],
        answer: "",
      };
      next[index] = { ...base, ...p };
      return { ...cur, prompts: next.slice(0, 3) };
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={() => router.back()} hapticOnPress="selection" accessibilityLabel="Quay lại">
          <Text style={styles.back}>‹</Text>
        </PressableScale>
        <Text style={styles.title}>Chỉnh sửa hồ sơ</Text>
        <PressableScale
          onPress={() => {
            profileStore.save({
              ...draft,
              prompts: draft.prompts.filter((p) => p.answer.trim()).slice(0, 3),
            });
            router.back();
          }}
          hapticOnPress="light"
          accessibilityLabel="Lưu hồ sơ"
        >
          <Text style={styles.save}>Lưu</Text>
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Thông tin chính</Text>
        <Field label="Tên hiển thị" value={draft.displayName} onChangeText={(v) => patch({ displayName: v })} placeholder="Tên của bạn" />
        <Field label="Nghề nghiệp" value={draft.jobTitle} onChangeText={(v) => patch({ jobTitle: v })} placeholder="Product Designer" />
        <Field label="Khu vực" value={draft.community} onChangeText={(v) => patch({ community: v })} placeholder="Cầu Giấy, Hà Nội" />
        <Field label="Giới thiệu" value={draft.bio} onChangeText={(v) => patch({ bio: v.slice(0, 500) })} placeholder="Một vài điều khiến bạn là chính bạn…" multiline />

        <Text style={styles.section}>Tín hiệu kết nối</Text>
        <TokenEditor
          label="Sở thích"
          value={draft.interests}
          hint="Ngăn cách bằng dấu phẩy"
          onChange={(items) => patch({ interests: items })}
        />
        <TokenEditor
          label="Ý định hẹn hò"
          value={draft.intent}
          hint="Ví dụ: Hẹn hò nghiêm túc"
          onChange={(items) => patch({ intent: items })}
        />

        <View style={styles.sectionHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.section}>Câu hỏi mở</Text>
            <Text style={styles.sectionHint}>Tối đa 3 câu. Đây là phần người khác có thể “thích” trực tiếp để bắt đầu câu chuyện.</Text>
          </View>
        </View>

        {[0, 1, 2].map((index) => {
          const prompt = draft.prompts[index];
          return (
            <View key={index} style={styles.promptCard}>
              <Text style={styles.promptIndex}>CÂU {index + 1}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptOptions}>
                {PROMPT_OPTIONS.map((question) => (
                  <PressableScale
                    key={question}
                    style={[styles.promptOption, (prompt?.question ?? PROMPT_OPTIONS[index]) === question && styles.promptOptionOn]}
                    onPress={() => upsertPrompt(index, { question })}
                    hapticOnPress="selection"
                    accessibilityLabel={`Chọn câu hỏi ${question}`}
                  >
                    <Text style={[styles.promptOptionText, (prompt?.question ?? PROMPT_OPTIONS[index]) === question && styles.promptOptionTextOn]}>{question}</Text>
                  </PressableScale>
                ))}
              </ScrollView>
              <TextInput
                value={prompt?.answer ?? ""}
                onChangeText={(answer) => upsertPrompt(index, { answer: answer.slice(0, 180) })}
                placeholder="Trả lời ngắn, thật và có chất riêng…"
                placeholderTextColor={theme.color.textSoft}
                multiline
                style={[styles.input, styles.promptAnswer]}
                accessibilityLabel={`Trả lời câu hỏi ${index + 1}`}
              />
              <Text style={styles.counter}>{prompt?.answer.length ?? 0}/180</Text>
            </View>
          );
        })}

        <View style={styles.note}>
          <Text style={styles.noteTitle}>Ảnh hồ sơ</Text>
          <Text style={styles.noteBody}>Bản V2.1 vẫn giữ upload/kiểm duyệt ảnh ở onboarding. “Thích ảnh” dùng ảnh đã duyệt và không làm thay đổi luồng moderation hiện tại.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, multiline, ...props }: { label: string; multiline?: boolean; value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={theme.color.textSoft}
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

function TokenEditor({ label, value, hint, onChange }: { label: string; value: string[]; hint: string; onChange: (v: string[]) => void }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value.join(", ")}
        onChangeText={(text) => onChange(text.split(",").map((x) => x.trim()).filter(Boolean))}
        placeholder={hint}
        placeholderTextColor={theme.color.textSoft}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  topbar: { minHeight: 62, paddingHorizontal: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: theme.color.border },
  back: { color: theme.color.text, fontSize: 34, lineHeight: 34 },
  title: { color: theme.color.text, fontSize: 17, fontWeight: "800" },
  save: { color: theme.color.primary, fontSize: 15, fontWeight: "800" },
  content: { padding: 20, gap: 16 },
  sectionHead: { marginTop: 8 },
  section: { color: theme.color.text, fontSize: 18, fontWeight: "800", marginTop: 8 },
  sectionHint: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  fieldWrap: { gap: 8 },
  label: { color: theme.color.textMuted, fontSize: 12, fontWeight: "700" },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, color: theme.color.text, fontSize: 15 },
  textarea: { minHeight: 120, textAlignVertical: "top", paddingTop: 14 },
  promptCard: { padding: 14, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, gap: 10 },
  promptIndex: { color: theme.color.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  promptOptions: { gap: 8 },
  promptOption: { maxWidth: 220, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceSoft, borderWidth: 1, borderColor: theme.color.border },
  promptOptionOn: { backgroundColor: theme.color.primarySoft, borderColor: "rgba(240,98,116,0.36)" },
  promptOptionText: { color: theme.color.textMuted, fontSize: 11, lineHeight: 16 },
  promptOptionTextOn: { color: theme.color.text },
  promptAnswer: { minHeight: 94, textAlignVertical: "top", paddingTop: 13, lineHeight: 21 },
  counter: { alignSelf: "flex-end", color: theme.color.textSoft, fontSize: 10 },
  note: { padding: 16, borderRadius: theme.radius.md, backgroundColor: theme.color.primarySoft, borderWidth: 1, borderColor: "rgba(240,98,116,0.24)" },
  noteTitle: { color: theme.color.text, fontSize: 14, fontWeight: "800" },
  noteBody: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
});
