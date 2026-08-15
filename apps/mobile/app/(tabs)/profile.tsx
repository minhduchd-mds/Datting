import { router } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View, type ImageStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "../../src/components/Feedback";
import { useLocalProfile } from "../../src/profileStore";
import { useSession } from "../../src/session";
import { theme } from "../../src/theme";

function ageFromBirthDate(value: string | null): number | null {
  if (!value) return null;
  const birth = new Date(`${value}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const profile = useLocalProfile();
  const age = ageFromBirthDate(session.birthDate);

  const completeness = profile
    ? Math.min(
        100,
        25 +
          Math.min(profile.photos.length, 3) * 10 +
          Math.min(profile.interests.length, 3) * 5 +
          (profile.bio.trim() ? 10 : 0) +
          (profile.intent.length > 0 ? 10 : 0) +
          Math.min(profile.prompts.length, 2) * 5 +
          (session.verified ? 5 : 0),
      )
    : 20;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 110 }]}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>HỒ SƠ CỦA BẠN</Text>
          <Text style={styles.h1}>Xuất hiện đúng chất của bạn</Text>
        </View>
        <PressableScale
          style={styles.settingsBtn}
          onPress={() => router.push("/(tabs)/notifications" as never)}
          hapticOnPress="selection"
          accessibilityLabel="Thông báo"
        >
          <Text style={styles.settingsIcon}>♢</Text>
        </PressableScale>
      </View>

      <View style={styles.heroCard}>
        {profile?.photos[0] ? (
          <Image source={{ uri: profile.photos[0] }} style={styles.avatar as ImageStyle} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>+</Text>
          </View>
        )}
        <View style={styles.heroBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile?.displayName || "Hồ sơ của bạn"}{age ? `, ${age}` : ""}</Text>
            {session.verified && <Text style={styles.verified}>✓</Text>}
          </View>
          <Text style={styles.meta}>{profile?.jobTitle || "Thêm nghề nghiệp"}</Text>
          <Text style={styles.meta}>{profile?.community || "Thêm khu vực"}</Text>
        </View>
      </View>

      <View style={styles.scoreCard}>
        <View style={styles.scoreTop}>
          <View>
            <Text style={styles.scoreLabel}>Chất lượng hồ sơ</Text>
            <Text style={styles.scoreHint}>Ảnh rõ, prompt có chất riêng và tín hiệu hẹn hò cụ thể giúp người phù hợp hiểu bạn nhanh hơn.</Text>
          </View>
          <Text style={styles.score}>{completeness}%</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${completeness}%` }]} />
        </View>
      </View>

      <PressableScale
        style={styles.primary}
        onPress={() => router.push("/profile/edit" as never)}
        hapticOnPress="light"
        accessibilityLabel="Chỉnh sửa hồ sơ"
      >
        <Text style={styles.primaryText}>Chỉnh sửa hồ sơ</Text>
      </PressableScale>

      {(profile?.prompts.length ?? 0) > 0 && (
        <View style={styles.promptSection}>
          <View style={styles.promptHead}>
            <Text style={styles.sectionTitle}>Câu hỏi mở của bạn</Text>
            <PressableScale onPress={() => router.push("/profile/edit" as never)} hapticOnPress="selection">
              <Text style={styles.editText}>Sửa</Text>
            </PressableScale>
          </View>
          {profile!.prompts.map((prompt) => (
            <View key={prompt.id} style={styles.promptCard}>
              <Text style={styles.promptQuestion}>{prompt.question}</Text>
              <Text style={styles.promptAnswer}>{prompt.answer}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Tăng sức hút hồ sơ</Text>
      <View style={styles.grid}>
        <Insight title={`${profile?.photos.length ?? 0}/6 ảnh`} body="Ưu tiên ảnh rõ mặt và có bối cảnh đời thật." done={(profile?.photos.length ?? 0) >= 3} />
        <Insight title={`${profile?.interests.length ?? 0} sở thích`} body="Giúp thuật toán giải thích điểm chung tốt hơn." done={(profile?.interests.length ?? 0) >= 3} />
        <Insight title={`${profile?.prompts.length ?? 0}/3 prompt`} body="Cho người khác một điểm cụ thể để bắt đầu câu chuyện." done={(profile?.prompts.length ?? 0) >= 2} />
        <Insight title="Ý định rõ ràng" body="Nói thẳng bạn đang tìm kiểu mối quan hệ nào." done={(profile?.intent.length ?? 0) > 0} />
        <Insight title="Xác minh" body={session.verified ? "Hồ sơ đã xác minh." : "Tăng niềm tin khi bắt đầu kết nối."} done={session.verified} />
      </View>

      <Text style={styles.sectionTitle}>Thiết lập</Text>
      <View style={styles.menu}>
        <MenuRow label="Đối tượng muốn tìm" value={session.wantGenders?.join(", ") || "Chưa chọn"} />
        <MenuRow label="Quyền riêng tư & đồng ý" value="Kiểm soát dữ liệu nhạy cảm" />
        <MenuRow label="An toàn" value="Chặn, báo cáo, xác minh" />
        <MenuRow label="Tài khoản" value="Đăng xuất, xoá tài khoản" last />
      </View>
    </ScrollView>
  );
}

function Insight({ title, body, done }: { title: string; body: string; done: boolean }) {
  return (
    <View style={styles.insight}>
      <View style={[styles.dot, done && styles.dotDone]} />
      <Text style={styles.insightTitle}>{title}</Text>
      <Text style={styles.insightBody}>{body}</Text>
    </View>
  );
}

function MenuRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.menuRow, last && styles.menuRowLast]}>
      <View style={styles.menuBody}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text style={styles.menuValue}>{value}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  content: { paddingHorizontal: theme.space.lg, gap: theme.space.lg },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  eyebrow: { color: theme.color.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  h1: { color: theme.color.text, fontSize: 27, lineHeight: 33, fontWeight: "800", marginTop: 4, maxWidth: 300 },
  settingsBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  settingsIcon: { color: theme.color.text, fontSize: 22 },
  heroCard: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border },
  avatar: { width: 78, height: 78, borderRadius: 28, backgroundColor: theme.color.surfaceSoft },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarFallbackText: { color: theme.color.textSoft, fontSize: 28 },
  heroBody: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: theme.color.text, fontSize: 20, fontWeight: "800" },
  verified: { color: theme.color.white, fontSize: 12, fontWeight: "900", backgroundColor: theme.color.primary, width: 20, height: 20, borderRadius: 10, textAlign: "center", lineHeight: 20 },
  meta: { color: theme.color.textMuted, fontSize: 13 },
  scoreCard: { padding: 18, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  scoreTop: { flexDirection: "row", gap: 16, justifyContent: "space-between", alignItems: "flex-start" },
  scoreLabel: { color: theme.color.text, fontSize: 16, fontWeight: "700" },
  scoreHint: { color: theme.color.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 250 },
  score: { color: theme.color.primary, fontSize: 24, fontWeight: "900" },
  track: { height: 7, borderRadius: 999, backgroundColor: theme.color.surfaceSoft, overflow: "hidden", marginTop: 16 },
  fill: { height: "100%", borderRadius: 999, backgroundColor: theme.color.primary },
  primary: { minHeight: 54, borderRadius: theme.radius.md, backgroundColor: theme.color.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: theme.color.white, fontSize: 15, fontWeight: "800" },
  sectionTitle: { color: theme.color.text, fontSize: 17, fontWeight: "800", marginTop: 4 },
  promptSection: { gap: 10 },
  promptHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  editText: { color: theme.color.primary, fontSize: 12, fontWeight: "800" },
  promptCard: { padding: 16, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  promptQuestion: { color: theme.color.primary, fontSize: 10, fontWeight: "900" },
  promptAnswer: { color: theme.color.text, fontSize: 16, lineHeight: 23, fontWeight: "700", marginTop: 7 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  insight: { width: "48.5%", minHeight: 132, padding: 15, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.warning, marginBottom: 16 },
  dotDone: { backgroundColor: theme.color.success },
  insightTitle: { color: theme.color.text, fontSize: 14, fontWeight: "700" },
  insightBody: { color: theme.color.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  menu: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, overflow: "hidden" },
  menuRow: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  menuRowLast: { borderBottomWidth: 0 },
  menuBody: { flex: 1, gap: 3 },
  menuLabel: { color: theme.color.text, fontSize: 14, fontWeight: "600" },
  menuValue: { color: theme.color.textMuted, fontSize: 12 },
  chevron: { color: theme.color.textSoft, fontSize: 28, fontWeight: "300" },
});
