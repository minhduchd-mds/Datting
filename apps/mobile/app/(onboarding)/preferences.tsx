/**
 * Giới tính muốn tìm — và đồng ý RIÊNG cho dữ liệu suy ra từ nó.
 *
 * ─── Vì sao màn này tồn tại tách biệt ─────────────────────────────────────
 * NĐ13/2023 coi xu hướng tính dục là dữ liệu nhạy cảm. Người dùng không hề khai
 * "tôi là người đồng tính" — nhưng "tôi là nam, tôi muốn tìm nam" thì SUY RA
 * ĐƯỢC điều đó, và luật nhìn dữ liệu suy ra được y hệt dữ liệu khai báo.
 *
 * Hệ quả thiết kế: câu hỏi này KHÔNG được gộp vào 4 bước onboarding chung. Đồng
 * ý phải lấy tại đúng thời điểm dữ liệu phát sinh, cho đúng một mục đích, và
 * người dùng phải đọc được mình đang đồng ý cho cái gì. Một ô tích "Tôi đồng ý
 * với điều khoản" ở cuối form là KHÔNG HỢP LỆ.
 *
 * ─── Vì sao không có nút "Bỏ qua" ─────────────────────────────────────────
 * Mọi bước onboarding khác đều bỏ qua được. Bước này thì không — nhưng lối
 * thoát không phải là "bỏ qua rồi vẫn dùng", mà là KHÔNG ĐỒNG Ý và không có
 * deck. Đó là hệ quả trung thực: không có cơ sở pháp lý thì không xếp hạng
 * được, chứ không phải phần mềm trừng phạt người dùng.
 */
import { useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../../src/api";
import { PressableScale } from "../../src/components/Feedback";
import { CONSENT_PURPOSE, POLICY_VERSION, nextRoute, session } from "../../src/session";
import { theme } from "../../src/theme";

const GENDERS = ["Nữ", "Nam", "Người phi nhị nguyên", "Tất cả"] as const;

export default function Preferences() {
  const [picked, setPicked] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);

  const toggle = (g: string) => {
    setPicked((cur) => {
      // "Tất cả" loại trừ lẫn nhau với lựa chọn cụ thể: chọn cả hai vừa thừa
      // vừa tạo ra hai cách biểu diễn cho cùng một ý.
      if (g === "Tất cả") return cur.includes(g) ? [] : ["Tất cả"];
      const without = cur.filter((x) => x !== "Tất cả");
      return without.includes(g) ? without.filter((x) => x !== g) : [...without, g];
    });
  };

  const canSubmit = picked.length > 0 && agreed;

  const submit = () => {
    if (!canSubmit) return;
    // Đồng ý ghi TRƯỚC, dữ liệu ghi SAU. Ngược lại thì có một khoảnh khắc dữ
    // liệu nhạy cảm tồn tại mà chưa có cơ sở pháp lý — dù chỉ vài mili giây.
    session.setConsent(CONSENT_PURPOSE.ORIENTATION, true);
    session.setWantGenders(picked);
    void api.setConsent(CONSENT_PURPOSE.ORIENTATION, true, POLICY_VERSION).catch(() => {});
    router.replace(nextRoute() as never);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Bạn muốn tìm ai?</Text>
      <Text style={styles.sub}>Có thể chọn nhiều. Đổi bất cứ lúc nào trong Cài đặt.</Text>

      <View style={styles.chips}>
        {GENDERS.map((g) => {
          const on = picked.includes(g);
          return (
            <PressableScale
              key={g}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => toggle(g)}
              hapticOnPress="selection"
              accessibilityLabel={g}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{g}</Text>
            </PressableScale>
          );
        })}
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Vì sao chúng tôi hỏi riêng câu này</Text>
        <Text style={styles.noticeBody}>
          Lựa chọn trên có thể phản ánh xu hướng tính dục của bạn. Theo Nghị định
          13/2023/NĐ-CP, đây là dữ liệu cá nhân nhạy cảm và cần sự đồng ý riêng,
          tách khỏi các điều khoản chung.
        </Text>
        <Text style={styles.noticeBody}>
          Dữ liệu này chỉ dùng để chọn người hiển thị cho bạn. Không dùng để
          quảng cáo, không chia sẻ cho bên thứ ba, không hiển thị trên hồ sơ
          công khai của bạn.
        </Text>
        <Text style={styles.noticeBody}>
          Bạn rút lại đồng ý bất cứ lúc nào trong Cài đặt. Khi rút lại, lựa chọn
          này bị xoá và chúng tôi ngừng gợi ý cho tới khi bạn chọn lại.
        </Text>
      </View>

      <PressableScale
        style={styles.consentRow}
        onPress={() => setAgreed((a) => !a)}
        hapticOnPress="selection"
        accessibilityLabel="Đồng ý xử lý dữ liệu nhạy cảm"
      >
        <View style={[styles.box, agreed && styles.boxOn]}>
          {agreed && <Text style={styles.tick}>✓</Text>}
        </View>
        <Text style={styles.consentText}>
          Tôi đồng ý cho Datting xử lý lựa chọn này như dữ liệu cá nhân nhạy cảm,
          cho riêng mục đích gợi ý người phù hợp.
        </Text>
      </PressableScale>

      <PressableScale
        style={[styles.primary, !canSubmit && styles.primaryOff]}
        onPress={submit}
        hapticOnPress={canSubmit ? "light" : "none"}
        accessibilityLabel="Tiếp tục"
      >
        <Text style={styles.primaryText}>Tiếp tục</Text>
      </PressableScale>

      <Text style={styles.foot}>
        Phiên bản chính sách {POLICY_VERSION}. Thời điểm đồng ý được ghi lại để
        bạn và chúng tôi cùng đối chiếu được.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.xl, paddingTop: 72, gap: theme.space.md },
  h1: { color: theme.color.text, fontSize: theme.type.h1, fontWeight: "700" },
  sub: { color: theme.color.textMuted, fontSize: theme.type.body, lineHeight: 21 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm, marginTop: 4 },
  chip: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  chipOn: { borderColor: theme.color.primary, backgroundColor: theme.color.primarySoft },
  chipText: { color: theme.color.textMuted, fontSize: theme.type.body },
  chipTextOn: { color: theme.color.text, fontWeight: "600" },
  notice: {
    gap: theme.space.sm,
    padding: theme.space.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  noticeTitle: { color: theme.color.text, fontSize: theme.type.body, fontWeight: "600" },
  noticeBody: { color: theme.color.textMuted, fontSize: theme.type.meta, lineHeight: 19 },
  consentRow: { flexDirection: "row", gap: theme.space.sm, alignItems: "flex-start", paddingVertical: 4 },
  box: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.xs,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { borderColor: theme.color.primary, backgroundColor: theme.color.primary },
  tick: { color: theme.color.white, fontSize: theme.type.body, fontWeight: "700" },
  consentText: { flex: 1, color: theme.color.textMuted, fontSize: theme.type.meta, lineHeight: 19 },
  primary: {
    marginTop: theme.space.sm,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: "center",
  },
  // Nút bị khoá: nền chìm hẳn về surface thay vì một sắc hồng nhạt. Hồng nhạt
  // vẫn đọc ra "bấm được", và đó chính là lời hứa sai mà PressableScale đã phải
  // sửa bằng cách tự quản độ mờ.
  primaryOff: { backgroundColor: theme.color.surfaceSoft },
  primaryText: { color: theme.color.white, fontSize: theme.type.title, fontWeight: "700" },
  foot: { color: theme.color.textSoft, fontSize: theme.type.caption, lineHeight: 17, marginBottom: 40 },
});
