/**
 * Dữ liệu và đồng ý — NĐ13/2023.
 *
 * ─── Vì sao màn này là bắt buộc, không phải tuỳ chọn ─────────────────────
 * Luật đòi việc RÚT LẠI đồng ý phải dễ ngang lúc đồng ý. Trước màn này, app xin
 * đồng ý ở onboarding rồi không cho đường nào rút — tức mọi bản ghi đồng ý đang
 * có đều không hợp lệ, vì đồng ý không rút lại được thì không phải tự nguyện.
 *
 * ─── Vì sao hai mục tách rời ─────────────────────────────────────────────
 * Vị trí và xu hướng tính dục là HAI mục đích khác nhau, mỗi cái cần đồng ý
 * riêng. Một ô tích "Tôi đồng ý với điều khoản" gộp cả hai là không hợp lệ.
 * Xu hướng không được hỏi trực tiếp — nó SUY RA từ `preferences.want_genders`,
 * và luật nhìn dữ liệu suy ra được y như dữ liệu khai báo.
 *
 * ─── Rút lại phải XOÁ dữ liệu, không chỉ tắt cờ ──────────────────────────
 * `session.setConsent(ORIENTATION, false)` xoá luôn `wantGenders`. Giữ lại "để
 * lỡ người dùng đổi ý" là đúng nghĩa xử lý dữ liệu không có cơ sở pháp lý.
 * Hệ quả: `stageOf()` đưa người dùng về lại bước chọn tiêu chí — đó là hành vi
 * ĐÚNG, không phải lỗi.
 */
import { useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { api } from "../../src/api";
import { PressableScale, Toast } from "../../src/components/Feedback";
import { C, R as RAD, S, T } from "../../src/theme";
import {
  CONSENT_PURPOSE, POLICY_VERSION, hasConsent, session, useSession,
  type ConsentPurpose,
} from "../../src/session";

export default function Consents() {
  const state = useSession();
  const [note, setNote] = useState<string | null>(null);

  const toggle = (purpose: ConsentPurpose, next: boolean) => {
    // Ghi bản ghi client TRƯỚC và ĐỒNG BỘ. Nếu chỉ tin vào lần gọi mạng thì mất
    // mạng đồng nghĩa mất bằng chứng đồng ý — thứ luật đòi phải chứng minh được.
    session.setConsent(purpose, next);
    void api.setConsent(purpose, next, POLICY_VERSION).catch(() => {});
    if (!next && purpose === CONSENT_PURPOSE.ORIENTATION) {
      setNote("Đã xoá tiêu chí giới tính. Bạn sẽ được hỏi lại khi mở phần Khám phá.");
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.nav}>
        <PressableScale onPress={() => router.back()} hapticOnPress="selection" accessibilityLabel="Quay lại">
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </PressableScale>
        <Text style={styles.navTitle}>Dữ liệu và đồng ý</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Item
          title="Vị trí"
          body="Dùng để gợi ý người ở gần và tính khoảng cách hiển thị. Chúng tôi lưu ở độ chính xác khu vực, không lưu lịch sử di chuyển."
          on={hasConsent(state, CONSENT_PURPOSE.LOCATION)}
          onChange={(v) => toggle(CONSENT_PURPOSE.LOCATION, v)}
          record={state.consents.location}
        />
        <Item
          title="Giới tính muốn tìm"
          body="Từ lựa chọn này có thể suy ra xu hướng tính dục, nên pháp luật xếp nó vào dữ liệu nhạy cảm và cần đồng ý riêng. Tắt đi sẽ xoá lựa chọn đã lưu."
          on={hasConsent(state, CONSENT_PURPOSE.ORIENTATION)}
          onChange={(v) => toggle(CONSENT_PURPOSE.ORIENTATION, v)}
          record={state.consents.orientation}
        />

        <Text style={styles.legal}>
          Bạn có thể bật hoặc tắt bất cứ lúc nào. Tắt đi thì dữ liệu thu theo mục đích đó
          sẽ bị xoá, và app vẫn dùng được ở mức hạn chế hơn.
        </Text>
      </ScrollView>

      <Toast kind="info" message={note ?? ""} visible={note !== null} onDismiss={() => setNote(null)} />
    </View>
  );
}

function Item({
  title, body, on, onChange, record,
}: {
  title: string;
  body: string;
  on: boolean;
  onChange: (v: boolean) => void;
  record?: { atMs: number; policyVersion: string } | undefined;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Switch
          value={on}
          onValueChange={onChange}
          trackColor={{ false: C.border, true: C.accent }}
          thumbColor={C.textOn}
          accessibilityLabel={title}
        />
      </View>
      <Text style={styles.cardBody}>{body}</Text>
      {/* Mốc thời gian + phiên bản chính sách là phần "chứng minh được" của
          NĐ13. Hiện ra để người dùng thấy chính xác họ đã đồng ý với cái gì. */}
      {record && (
        <Text style={styles.stamp}>
          {on ? "Đồng ý" : "Đã rút lại"} lúc{" "}
          {new Date(record.atMs).toLocaleString("vi-VN")} · chính sách {record.policyVersion}
        </Text>
      )}
      {!record && <Text style={styles.stamp}>Chưa có bản ghi · chính sách {POLICY_VERSION}</Text>}
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
  content: { padding: S.lg, gap: S.md },
  card: { backgroundColor: C.surface, borderRadius: RAD.lg, padding: S.lg },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md },
  cardTitle: { color: C.text, fontSize: T.body, fontWeight: "600", flex: 1 },
  cardBody: { color: C.textMuted, fontSize: T.subhead, lineHeight: 21, marginTop: S.sm },
  stamp: { color: C.textFaint, fontSize: T.footnote, marginTop: S.md },
  legal: { color: C.textMuted, fontSize: T.footnote, lineHeight: 19, marginTop: S.sm },
});
