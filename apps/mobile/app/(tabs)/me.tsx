/**
 * Tab thứ tư — cửa vào mọi thứ thuộc về "tôi".
 *
 * Trước đó app KHÔNG có màn nào dẫn tới cài đặt, nên ba khả năng đã viết sẵn
 * trong `session.ts` — rút lại đồng ý, xoá tài khoản, gỡ chặn — không có đường
 * nào chạm tới. Với NĐ13/2023 thì đó không phải thiếu tính năng: luật đòi việc
 * rút lại đồng ý phải DỄ NGANG lúc đồng ý, mà "không có nút" thì không dễ ngang
 * được với bất cứ thứ gì.
 *
 * Bố cục nhóm-lồng của iOS: các mục cùng chủ đề gom trong một khối bo góc, có
 * nhãn mục viết hoa phía trên. Nhờ vậy "Xoá tài khoản" đứng riêng một khối và
 * không bị nhầm với các mục thường ngày.
 */
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { PressableScale } from "../../src/components/Feedback";
import { C, R as RAD, S, T } from "../../src/theme";
import { CONSENT_PURPOSE, hasConsent, session, useSession } from "../../src/session";

export default function Me() {
  const state = useSession();
  const viTri = hasConsent(state, CONSENT_PURPOSE.LOCATION);
  const xuHuong = hasConsent(state, CONSENT_PURPOSE.ORIENTATION);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Tôi</Text>

      <Text style={styles.eyebrow}>Hồ sơ</Text>
      <View style={styles.group}>
        <Row icon="person-outline" label="Hồ sơ của tôi" hint="Sắp có" disabled />
        <Row icon="options-outline" label="Bộ lọc tìm kiếm" hint="Sắp có" disabled last />
      </View>

      <Text style={styles.eyebrow}>Quyền riêng tư</Text>
      <View style={styles.group}>
        <Row
          icon="shield-checkmark-outline"
          label="Dữ liệu và đồng ý"
          hint={`${(viTri ? 1 : 0) + (xuHuong ? 1 : 0)}/2 đang bật`}
          onPress={() => router.push("/settings/consents" as never)}
        />
        <Row
          icon="ban-outline"
          label="Danh sách đã chặn"
          onPress={() => router.push("/settings/blocked" as never)}
          last
        />
      </View>

      <Text style={styles.eyebrow}>Tài khoản</Text>
      <View style={styles.group}>
        <Row
          icon="log-out-outline"
          label="Đăng xuất"
          onPress={() => {
            session.signOut();
            router.replace("/" as never);
          }}
          last
        />
      </View>

      {/* Khối RIÊNG, không gộp chung với Đăng xuất: một thao tác không hoàn tác
          được không nên đứng cạnh một thao tác hoàn tác được trong cùng khung. */}
      <View style={[styles.group, styles.groupDanger]}>
        <Row
          icon="trash-outline"
          label="Xoá tài khoản"
          danger
          onPress={() => router.push("/settings/delete-account" as never)}
          last
        />
      </View>

      <Text style={styles.foot}>Datting 0.1.0</Text>
    </ScrollView>
  );
}

function Row({
  icon, label, hint, onPress, last, danger, disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  hint?: string;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const tint = danger ? C.danger : C.text;
  return (
    <PressableScale
      style={[styles.row, !last && styles.rowLine]}
      onPress={onPress ?? (() => {})}
      disabled={disabled}
      hapticOnPress="selection"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={danger ? C.danger : C.textMuted} />
      <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
      {hint && <Text style={styles.rowHint}>{hint}</Text>}
      {!disabled && <Ionicons name="chevron-forward" size={16} color={C.textFaint} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: S.lg, paddingTop: S.huge },
  h1: { color: C.text, fontSize: T.largeTitle, fontWeight: "800", letterSpacing: -0.6, marginBottom: S.xxl },
  eyebrow: {
    color: C.textMuted, fontSize: T.caption2, fontWeight: "700",
    letterSpacing: 1.6, textTransform: "uppercase", marginBottom: S.sm, marginTop: S.xl,
  },
  group: { backgroundColor: C.surface, borderRadius: RAD.lg, overflow: "hidden" },
  groupDanger: { marginTop: S.xl },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.lg },
  rowLine: { borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  rowLabel: { flex: 1, fontSize: T.body },
  rowHint: { color: C.textMuted, fontSize: T.subhead },
  foot: { color: C.textFaint, fontSize: T.footnote, textAlign: "center", marginTop: S.xxxl },
});
