/**
 * MÀN BỔ SUNG #1–#2: Cổng tuổi + Đăng nhập.
 *
 * Cả hai đều nằm trong nhóm "CHẶN" ở mục 1.4 của tài liệu kiến trúc: thiếu một
 * trong hai, app bị App Store từ chối và vi phạm NĐ13/2023.
 */
import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View, Linking } from "react-native";
import { PressableScale, StepProgress, Toast, useShake } from "../components/Feedback";
import { validateBirthDate } from "@datting/core";
import { haptic } from "../motion/haptics";

/* ===========================================================================
 * MÀN 1 — CỔNG TUỔI (Age Gate)
 *
 * Ba sai lầm phổ biến phải tránh:
 *   1. Hỏi "bạn có trên 18 tuổi không?" (nút Có/Không) — vô giá trị về pháp lý
 *      và bị Apple coi là không đủ. Phải nhập NGÀY SINH thật.
 *   2. Lưu tuổi thay vì ngày sinh — dữ liệu sai sau 12 tháng.
 *   3. Cho phép quay lại sửa sau khi đã bị chặn — phải khoá theo thiết bị.
 * =========================================================================== */
export function AgeGateScreen({ onPass }: { onPass: (birthDate: string) => void }) {
  const [d, setD] = useState("");
  const [mth, setM] = useState("");
  const [y, setY] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { style: shakeStyle, shake } = useShake();
  const mRef = useRef<TextInput>(null);
  const yRef = useRef<TextInput>(null);

  const submit = () => {
    const res = validateBirthDate(d, mth, y);
    if (!res.ok) {
      setError(res.reason);
      shake();
      return;
    }
    void haptic.success();
    onPass(res.iso);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.h1}>Ngày sinh của bạn</Text>
      <Text style={styles.sub}>
        Chúng tôi cần thông tin này để bảo đảm nền tảng chỉ dành cho người từ 18 tuổi.
        Ngày sinh không hiển thị công khai — chỉ độ tuổi được hiển thị.
      </Text>

      <View style={[styles.dobRow, shakeStyle as never]}>
        <DobBox value={d} onChange={(v) => { setD(v); if (v.length === 2) mRef.current?.focus(); }} placeholder="NN" max={2} />
        <DobBox ref={mRef} value={mth} onChange={(v) => { setM(v); if (v.length === 2) yRef.current?.focus(); }} placeholder="TT" max={2} />
        <DobBox ref={yRef} value={y} onChange={setY} placeholder="NNNN" max={4} wide />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <PressableScale style={styles.primary} onPress={submit} hapticOnPress="none" accessibilityLabel="Tiếp tục">
        <Text style={styles.primaryText}>Tiếp tục</Text>
      </PressableScale>

      <Text style={styles.legal}>
        Bằng việc tiếp tục, bạn đồng ý với{" "}
        <Text style={styles.link} onPress={() => Linking.openURL("https://example.vn/terms")}>
          Điều khoản sử dụng
        </Text>{" "}
        và{" "}
        <Text style={styles.link} onPress={() => Linking.openURL("https://example.vn/privacy")}>
          Chính sách quyền riêng tư
        </Text>
        .
      </Text>
    </View>
  );
}

const DobBox = React.forwardRef<
  TextInput,
  { value: string; onChange: (v: string) => void; placeholder: string; max: number; wide?: boolean }
>(function DobBox({ value, onChange, placeholder, max, wide }, ref) {
  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, max))}
      placeholder={placeholder}
      placeholderTextColor="#484f58"
      keyboardType="number-pad"
      style={[styles.dobBox, wide && { flex: 1.6 }]}
      accessibilityLabel={placeholder === "NN" ? "Ngày" : placeholder === "TT" ? "Tháng" : "Năm"}
    />
  );
});

/* Logic kiểm tra ngày sinh nằm ở `packages/core/src/birthDate.ts` — module thuần
 * tuý, có 8 test riêng, vì đây là logic PHÁP LÝ chứ không phải logic hiển thị.
 * Nó cũng được dùng lại ở backend: nếu viết hai lần, hai bản SẼ lệch nhau. */

/* ===========================================================================
 * MÀN 2 — ĐĂNG NHẬP
 *
 * MỘT đường duy nhất: SĐT + OTP. Không SSO, không mật khẩu, không "quên mật
 * khẩu", không lưu credential. Danh tính = số điện thoại đã xác thực.
 *
 * Vì sao SĐT chứ không phải email: dating app cần một rào cản chi phí để chặn
 * tài khoản rác. Email miễn phí và vô hạn; số điện thoại thì không.
 *
 * LƯU Ý APP STORE (mục 4.8): chừng nào chỉ có SĐT+OTP thì KHÔNG bắt buộc
 * "Sign in with Apple". Ngay khi thêm bất kỳ đăng nhập mạng xã hội nào
 * (Google/Facebook), Apple BẮT BUỘC phải có Sign in with Apple ngang hàng.
 *
 * OTP: 6 số, tự dán từ SMS (autoComplete="one-time-code"), đếm ngược gửi lại
 * 60 giây, rung lắc khi sai. KHÔNG hiển thị "mã sai" trước khi người dùng nhập
 * đủ 6 số — gây lo lắng vô ích.
 * =========================================================================== */
export function SignInScreen({
  onRequestOtp,
  onVerifyOtp,
}: {
  onRequestOtp: (phone: string) => Promise<void>;
  onVerifyOtp: (phone: string, code: string) => Promise<boolean>;
}) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [cooldown, setCooldown] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const { style: shakeStyle, shake } = useShake();

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const valid = /^0\d{9}$/.test(phone);

  return (
    <View style={styles.root}>
      <Text style={styles.h1}>{stage === "phone" ? "Số điện thoại" : "Nhập mã xác thực"}</Text>
      <Text style={styles.sub}>
        {stage === "phone"
          ? "Chúng tôi sẽ gửi mã gồm 6 chữ số qua SMS."
          : `Mã đã gửi tới ${phone}. Kiểm tra tin nhắn của bạn.`}
      </Text>

      {stage === "phone" ? (
        <>
          <TextInput
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
            placeholder="09xx xxx xxx"
            placeholderTextColor="#484f58"
            keyboardType="phone-pad"
            autoComplete="tel"
            style={styles.input}
            accessibilityLabel="Số điện thoại"
          />
          <PressableScale
            style={[styles.primary, !valid && styles.disabled]}
            disabled={!valid}
            onPress={async () => {
              await onRequestOtp(phone);
              setStage("otp");
              setCooldown(60);
            }}
            accessibilityLabel="Gửi mã"
          >
            <Text style={styles.primaryText}>Gửi mã</Text>
          </PressableScale>
        </>
      ) : (
        <>
          <TextInput
            value={otp}
            onChangeText={async (t) => {
              const v = t.replace(/\D/g, "").slice(0, 6);
              setOtp(v);
              // Chỉ kiểm tra KHI ĐỦ 6 số — không báo lỗi giữa chừng.
              if (v.length === 6) {
                const ok = await onVerifyOtp(phone, v);
                if (ok) void haptic.success();
                else {
                  shake();
                  setOtp("");
                  setToast("Mã không đúng. Vui lòng thử lại.");
                }
              }
            }}
            placeholder="••••••"
            placeholderTextColor="#484f58"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            style={[styles.input, styles.otp, shakeStyle as never]}
            accessibilityLabel="Mã xác thực 6 chữ số"
          />
          <PressableScale
            style={[styles.ghost, cooldown > 0 && styles.disabled]}
            disabled={cooldown > 0}
            onPress={async () => {
              await onRequestOtp(phone);
              setCooldown(60);
            }}
            accessibilityLabel="Gửi lại mã"
          >
            <Text style={styles.ghostText}>
              {cooldown > 0 ? `Gửi lại sau ${cooldown}s` : "Gửi lại mã"}
            </Text>
          </PressableScale>
        </>
      )}

      <View style={{ marginTop: 24 }}>
        <StepProgress total={2} current={stage === "phone" ? 0 : 1} />
      </View>

      <Toast kind="error" message={toast ?? ""} visible={!!toast} onDismiss={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d1117", padding: 24, paddingTop: 80 },
  h1: { color: "#e6edf3", fontSize: 26, fontWeight: "700" },
  sub: { color: "#8b949e", fontSize: 14, marginTop: 8, lineHeight: 21 },
  dobRow: { flexDirection: "row", gap: 10, marginTop: 28 },
  dobBox: {
    flex: 1,
    backgroundColor: "#161b22",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363d",
    color: "#e6edf3",
    fontSize: 20,
    textAlign: "center",
    paddingVertical: 14,
  },
  input: {
    backgroundColor: "#161b22",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363d",
    color: "#e6edf3",
    fontSize: 18,
    padding: 16,
    marginTop: 24,
  },
  otp: { fontSize: 26, letterSpacing: 10, textAlign: "center" },
  primary: {
    backgroundColor: "#f43f5e",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  ghost: { paddingVertical: 14, alignItems: "center", marginTop: 12 },
  ghostText: { color: "#8b949e", fontSize: 14 },
  disabled: { opacity: 0.4 },
  error: { color: "#f43f5e", fontSize: 13, marginTop: 12 },
  legal: { color: "#6e7681", fontSize: 12, lineHeight: 18, marginTop: 24 },
  link: { color: "#38bdf8", textDecorationLine: "underline" },
});
