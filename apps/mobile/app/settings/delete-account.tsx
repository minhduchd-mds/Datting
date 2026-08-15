/**
 * Xoá tài khoản — App Store 5.1.1(v) bắt buộc với app có đăng ký.
 *
 * ─── Vì sao phải gõ chữ để xác nhận ──────────────────────────────────────
 * Đây là thao tác KHÔNG hoàn tác được (sau 30 ngày). Một hộp thoại "Bạn có chắc
 * không?" bị bấm qua theo phản xạ — người dùng đã bấm "Đồng ý" hàng trăm lần
 * hôm nay. Gõ một từ buộc mắt phải đọc, và đó là toàn bộ mục đích.
 *
 * ─── Vì sao nói rõ 30 ngày ───────────────────────────────────────────────
 * NĐ13/2023: xoá mềm 30 ngày rồi purge cứng. Người dùng có quyền biết dữ liệu
 * của mình còn tồn tại bao lâu và đổi ý được trong bao lâu. Giấu chi tiết đó đi
 * để "trông dứt khoát hơn" là nói dối về một thứ có hệ quả pháp lý.
 *
 * ─── Vì sao KHÔNG dùng lý do làm rào cản ─────────────────────────────────
 * Ô lý do để trống được. Bắt điền lý do trước khi cho xoá là dựng ma sát vào
 * đúng cái quyền mà App Store và NĐ13 bảo phải dễ thực hiện.
 */
import { useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { api } from "../../src/api";
import { PressableScale, Toast, useShake } from "../../src/components/Feedback";
import Animated from "react-native-reanimated";
import { C, R as RAD, S, T } from "../../src/theme";
import { session } from "../../src/session";

const TU_XAC_NHAN = "XOÁ";

export default function DeleteAccount() {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shake = useShake();

  const ok = confirm.trim().toUpperCase() === TU_XAC_NHAN;

  const run = () => {
    if (!ok) { shake.shake(); return; }
    setBusy(true);
    // Gọi server TRƯỚC rồi mới dọn phiên: dọn trước mà mạng hỏng thì người dùng
    // bị đăng xuất khỏi một tài khoản vẫn còn sống, và không còn đường quay lại
    // để thử lại.
    void api
      .deleteAccount(reason.trim())
      .then(() => {
        session.wipe();
        router.replace("/" as never);
      })
      .catch(() => {
        setBusy(false);
        setErr("Không gửi được yêu cầu. Kiểm tra kết nối rồi thử lại.");
      });
  };

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <PressableScale onPress={() => router.back()} hapticOnPress="selection" accessibilityLabel="Quay lại">
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </PressableScale>
        <Text style={styles.navTitle}>Xoá tài khoản</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.warn}>
          <Ionicons name="alert-circle-outline" size={22} color={C.danger} />
          <Text style={styles.warnText}>Thao tác này không hoàn tác được sau 30 ngày.</Text>
        </View>

        <Text style={styles.body}>
          Tài khoản của bạn bị ẩn ngay lập tức: hồ sơ biến mất khỏi mọi deck, các cuộc trò
          chuyện đóng lại, và không ai tìm thấy bạn nữa.
        </Text>
        <Text style={styles.body}>
          Dữ liệu được giữ ở dạng đã xoá trong <Text style={styles.bold}>30 ngày</Text>. Trong
          thời gian đó bạn đăng nhập lại bằng số điện thoại cũ là khôi phục được. Sau 30 ngày,
          toàn bộ hồ sơ, ảnh và tin nhắn bị xoá vĩnh viễn và không lấy lại được.
        </Text>

        <Text style={styles.label}>Lý do rời đi (không bắt buộc)</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Điều gì khiến bạn quyết định xoá?"
          placeholderTextColor={C.textFaint}
          style={[styles.input, styles.inputArea]}
          multiline
          accessibilityLabel="Lý do rời đi"
        />

        <Text style={styles.label}>Gõ {TU_XAC_NHAN} để xác nhận</Text>
        <Animated.View style={shake.style}>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder={TU_XAC_NHAN}
            placeholderTextColor={C.textFaint}
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={`Gõ ${TU_XAC_NHAN} để xác nhận`}
          />
        </Animated.View>

        <PressableScale
          style={[styles.danger, !ok && styles.disabled]}
          onPress={run}
          disabled={busy}
          hapticOnPress="none"
          accessibilityLabel="Xoá tài khoản vĩnh viễn"
        >
          <Text style={styles.dangerText}>{busy ? "Đang gửi…" : "Xoá tài khoản"}</Text>
        </PressableScale>

        <PressableScale
          style={styles.cancel}
          onPress={() => router.back()}
          hapticOnPress="selection"
          accessibilityLabel="Giữ tài khoản"
        >
          <Text style={styles.cancelText}>Giữ tài khoản của tôi</Text>
        </PressableScale>
      </ScrollView>

      <Toast kind="error" message={err ?? ""} visible={err !== null} onDismiss={() => setErr(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  nav: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    paddingHorizontal: S.lg, paddingTop: S.huge, paddingBottom: S.md,
    borderBottomWidth: 1, borderBottomColor: C.borderSoft,
  },
  navTitle: { color: C.text, fontSize: T.body, fontWeight: "600" },
  content: { padding: S.lg, paddingBottom: S.huge },
  warn: {
    flexDirection: "row", alignItems: "center", gap: S.md,
    backgroundColor: C.surface, borderRadius: RAD.md, padding: S.md,
    borderLeftWidth: 3, borderLeftColor: C.danger, marginBottom: S.lg,
  },
  warnText: { color: C.text, fontSize: T.subhead, flex: 1, fontWeight: "600" },
  body: { color: C.textMuted, fontSize: T.subhead, lineHeight: 22, marginBottom: S.md },
  bold: { color: C.text, fontWeight: "700" },
  label: {
    color: C.textMuted, fontSize: T.caption2, fontWeight: "700",
    letterSpacing: 1.4, textTransform: "uppercase", marginTop: S.xl, marginBottom: S.sm,
  },
  input: {
    backgroundColor: C.surface, borderRadius: RAD.md, borderWidth: 1, borderColor: C.border,
    color: C.text, fontSize: T.body, paddingHorizontal: S.md, paddingVertical: S.md,
  },
  inputArea: { minHeight: 80, textAlignVertical: "top" },
  danger: {
    backgroundColor: C.danger, borderRadius: RAD.md,
    alignItems: "center", paddingVertical: S.lg, marginTop: S.xl,
  },
  disabled: { opacity: 0.4 },
  dangerText: { color: C.textOn, fontSize: T.body, fontWeight: "700" },
  cancel: { alignItems: "center", paddingVertical: S.lg },
  cancelText: { color: C.text, fontSize: T.body, fontWeight: "600" },
});
