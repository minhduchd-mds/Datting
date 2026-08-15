/**
 * MÀN BỔ SUNG #3–#4: Onboarding 4 bước + Xác minh ảnh.
 *
 * Figma chỉ vẽ 1/4 bước (chọn sở thích) dù thanh tiến trình ghi Step-1 → Step-4.
 * Đây là ba bước còn thiếu, cộng luồng xác minh ảnh (bắt buộc với bản công khai).
 *
 * Nguyên tắc thiết kế onboarding: MỖI BƯỚC PHẢI BỎ QUA ĐƯỢC, TRỪ những bước
 * bắt buộc về pháp lý hoặc an toàn. Ép người dùng điền 20 trường trước khi thấy
 * giá trị của sản phẩm là cách nhanh nhất để mất họ. Nhưng phải cho thấy rõ
 * hồ sơ chưa hoàn thiện làm giảm cơ hội — đó là lý do có thanh "Hoàn thiện 80%".
 */
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListEnter, PressableScale, StepProgress, Skeleton } from "../components/Feedback";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

import { haptic } from "../motion/haptics";
import { C } from "../theme";

export interface OnboardingData {
  interests: string[];
  photos: string[];
  displayName: string;
  jobTitle: string;
  community: string;
  bio: string;
  intent: string[];
  locationGranted: boolean;
}

const INTERESTS = [
  "Chạy bộ", "Cà phê", "Đọc sách", "Nghe nhạc", "Du lịch", "Nấu ăn", "Gym", "Chụp ảnh",
  "Xem phim", "Yoga", "Thể thao", "Nghệ thuật", "Leo núi", "Bơi lội", "Đạp xe",
];
/* Ý định hẹn hò. Đây là trường có sức lọc mạnh nhất trong toàn bộ onboarding:
 * ghép "hẹn hò nghiêm túc" với "tìm gì đó nhẹ nhàng" tạo ra trải nghiệm tệ cho
 * CẢ HAI phía, dù mọi tín hiệu khác đều khớp. Hiển thị công khai trên hồ sơ. */
const INTENTS = ["Hẹn hò nghiêm túc", "Tìm hiểu từ từ", "Kết bạn trước", "Bạn đồng hành", "Chưa rõ"];

const MIN_INTERESTS = 3;
const MIN_PHOTOS = 1;

export function OnboardingFlow({ onDone }: { onDone: (d: OnboardingData) => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    interests: [],
    photos: [],
    displayName: "",
    jobTitle: "",
    community: "",
    bio: "",
    intent: [],
    locationGranted: false,
  });

  const patch = (p: Partial<OnboardingData>) => setData((d) => ({ ...d, ...p }));
  const next = () => {
    void haptic.light();
    if (step === 3) onDone(data);
    else setStep((s) => s + 1);
  };

  const canProceed = useMemo(() => {
    switch (step) {
      case 0: return data.interests.length >= MIN_INTERESTS;
      case 1: return data.photos.length >= MIN_PHOTOS;
      case 2: return data.displayName.trim().length >= 2;
      default: return true;
    }
  }, [step, data]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <StepProgress total={4} current={step} />
        {step > 0 && (
          <PressableScale onPress={() => setStep((s) => s - 1)} hapticOnPress="selection" accessibilityLabel="Quay lại">
            <Text style={styles.back}>Quay lại</Text>
          </PressableScale>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {step === 0 && <StepInterests data={data} patch={patch} />}
        {step === 1 && <StepPhotos data={data} patch={patch} />}
        {step === 2 && <StepBasics data={data} patch={patch} />}
        {step === 3 && <StepIntentAndLocation data={data} patch={patch} />}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <PressableScale
          style={[styles.primary, !canProceed && styles.disabled]}
          disabled={!canProceed}
          onPress={next}
          hapticOnPress="none"
          accessibilityLabel={step === 3 ? "Hoàn tất" : "Tiếp tục"}
        >
          <Text style={styles.primaryText}>{step === 3 ? "Bắt đầu khám phá" : "Tiếp tục"}</Text>
        </PressableScale>

        {/* Bước 1 và 2 KHÔNG cho bỏ qua: không có sở thích và ảnh thì thuật toán
            không có gì để làm việc, và người dùng sẽ có trải nghiệm tệ ngay lập tức. */}
        {step >= 2 && (
          <PressableScale onPress={next} hapticOnPress="selection" accessibilityLabel="Bỏ qua bước này">
            <Text style={styles.skip}>Bỏ qua</Text>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- Bước 1/4 */
function StepInterests({ data, patch }: { data: OnboardingData; patch: (p: Partial<OnboardingData>) => void }) {
  const toggle = (t: string) => {
    void haptic.selection();
    patch({
      interests: data.interests.includes(t)
        ? data.interests.filter((x) => x !== t)
        : [...data.interests, t],
    });
  };
  return (
    <>
      <Text style={styles.h1}>Chọn sở thích của bạn</Text>
      <Text style={styles.sub}>
        Giúp AI tìm kiếm người phù hợp nhất thông qua phong cách sống hàng ngày của bạn tại
        DATTING. Chọn ít nhất {MIN_INTERESTS} mục.
      </Text>
      <View style={styles.chips}>
        {INTERESTS.map((t, i) => (
          <ListEnter key={t} index={i}>
            <Chip label={t} active={data.interests.includes(t)} onPress={() => toggle(t)} />
          </ListEnter>
        ))}
      </View>
      {/* Mẫu số là NGƯỠNG, không phải tổng số chip. "0/15" đọc ra thành "cần
          chọn 15", trong khi thực tế chỉ cần 3 — bộ đếm đang mô tả cái rổ chứ
          không mô tả việc phải làm. Chọn đủ rồi thì đổi sang xác nhận, vì lúc
          đó câu hỏi của người dùng đổi từ "còn thiếu bao nhiêu" sang "bấm được
          chưa". */}
      <Text style={styles.counter}>
        {data.interests.length < MIN_INTERESTS
          ? `Đã chọn ${data.interests.length}/${MIN_INTERESTS} — chọn thêm ${MIN_INTERESTS - data.interests.length} mục nữa`
          : `Đã chọn ${data.interests.length} mục`}
      </Text>
    </>
  );
}

/**
 * Mở thư viện ảnh của máy.
 *
 * Bản trước gắn một URL picsum ngẫu nhiên và ghi comment "PRODUCTION:
 * expo-image-picker" — tức là biết chưa làm. Hậu quả với người dùng thật: bấm
 * vào ô ảnh thì hoặc không thấy gì (mạng chậm/chặn picsum), hoặc thấy ảnh của
 * người lạ trên Internet nằm trong hồ sơ của mình.
 *
 * `mediaTypes: ["images"]` chứ không phải video: hồ sơ hẹn hò chỉ nhận ảnh, và
 * để lọt video vào đây là để lọt cả một đường tải lên chưa ai thiết kế.
 *
 * `quality: 0.8` — ảnh gốc từ camera điện thoại thường 4–8 MB; 0.8 giữ được
 * chất lượng mắt thường không phân biệt được mà cắt còn khoảng một phần ba.
 * Trên mạng 4G ở VN, đó là khác biệt giữa "tải lên xong" và "bỏ cuộc".
 */
async function pickPhoto(
  slot: number,
  data: OnboardingData,
  patch: (p: Partial<OnboardingData>) => void,
): Promise<void> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return;

  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [2, 3],
    quality: 0.8,
  });
  if (r.canceled || !r.assets[0]) return;

  const uri = r.assets[0].uri;
  const next = [...data.photos];
  // Chạm vào ô đã có ảnh là ĐỔI ảnh đó, chạm ô trống là THÊM. Bản trước luôn
  // thêm vào cuối, nên "chạm để đổi" trong nhãn trợ năng là nói dối.
  if (slot < next.length) next[slot] = uri;
  else next.push(uri);
  patch({ photos: next });
}

/* --------------------------------------------------------------- Bước 2/4 */
function StepPhotos({ data, patch }: { data: OnboardingData; patch: (p: Partial<OnboardingData>) => void }) {
  const slots = Array.from({ length: 6 }, (_, i) => data.photos[i]);
  return (
    <>
      <Text style={styles.h1}>Thêm ảnh của bạn</Text>
      <Text style={styles.sub}>
        Chọn tối đa 6 ảnh. Ảnh đầu tiên là ảnh đại diện. Hồ sơ có ảnh thật nhận được nhiều
        lượt thích hơn đáng kể.
      </Text>
      <View style={styles.photoGrid}>
        {slots.map((uri, i) => (
          <PressableScale
            key={i}
            style={styles.photoSlot}
            hapticOnPress="light"
            accessibilityLabel={uri ? `Ảnh ${i + 1}, chạm để đổi` : `Thêm ảnh ${i + 1}`}
            onPress={() => {
              void pickPhoto(i, data, patch);
            }}
          >
            {uri ? (
              <Image source={{ uri }} style={styles.photoImg} />
            ) : (
              <Text style={styles.photoPlus}>+</Text>
            )}
            {/* `numberOfLines={1}`: viên nhãn chỉ neo `left`, không neo `right`,
                nên nó co giãn theo chữ. Trên máy hẹp hoặc khi người dùng phóng
                cỡ chữ hệ thống, "Ảnh chính" sẽ vắt dòng và viên nhãn phình ra
                che gần hết ô. Cắt một dòng là đủ — nhãn này không mang thông
                tin nào mà mất đi thì không hiểu được ảnh. */}
            {i === 0 && uri && (
              <View style={styles.mainBadge}>
                <Text style={styles.mainBadgeText} numberOfLines={1}>Ảnh chính</Text>
              </View>
            )}
          </PressableScale>
        ))}
      </View>
      {/* KHÔNG nêu con số thời gian nào cả — kể cả "vài phút".
          Phần lớn ảnh được ML duyệt trong vài giây, nhưng dải điểm không chắc
          chắn phải qua người, mà đội kiểm duyệt là MỘT người với trần ~60 hồ
          sơ/giờ. Đến giờ cao điểm thì "vài phút" thành vài tiếng, và câu hứa ở
          đây biến mỗi lần chờ thành một khiếu nại.
          Điều đáng nói là điều người dùng thực sự cần biết: chờ không mất gì. */}
      <Text style={styles.note}>
        Ảnh được kiểm duyệt trước khi hiển thị công khai. Bạn vẫn dùng được app
        bình thường trong lúc chờ — chúng tôi báo khi xong.
      </Text>
    </>
  );
}

/* --------------------------------------------------------------- Bước 3/4 */
function StepBasics({ data, patch }: { data: OnboardingData; patch: (p: Partial<OnboardingData>) => void }) {
  return (
    <>
      <Text style={styles.h1}>Đôi nét về bạn</Text>
      <Text style={styles.sub}>Những thông tin này hiển thị trên hồ sơ của bạn.</Text>
      <Field label="Tên hiển thị" value={data.displayName} onChange={(v) => patch({ displayName: v })} placeholder="Minh" />
      <Field label="Nghề nghiệp" value={data.jobTitle} onChange={(v) => patch({ jobTitle: v })} placeholder="Kiến trúc sư" />
      {/* `community` = khu vực đang sống, KHÔNG phải địa chỉ. Dùng để đa dạng hoá
          deck (không dồn 10 người cùng một quận liên tiếp), không dùng để xếp hạng. */}
      <Field label="Khu vực đang sống" value={data.community} onChange={(v) => patch({ community: v })} placeholder="Cầu Giấy, Hà Nội" />
      <Field
        label="Giới thiệu bản thân"
        value={data.bio}
        onChange={(v) => patch({ bio: v.slice(0, 500) })}
        placeholder="Thích cafe sáng sớm, chạy bộ quanh Hồ Tây…"
        multiline
        counter={`${data.bio.length}/500`}
      />
    </>
  );
}

/* --------------------------------------------------------------- Bước 4/4 */
/**
 * Xin quyền vị trí THẬT của hệ điều hành.
 *
 * Bản trước chỉ lật một boolean: người dùng bấm "Cho phép", chữ đổi thành "Đã
 * cho phép", và không có hộp thoại nào của Android hiện ra. Với NĐ13/2023 thì
 * đó còn tệ hơn là không làm gì — app ghi một bản ghi ĐỒNG Ý cho dữ liệu nhạy
 * cảm mà người dùng chưa từng được hệ điều hành hỏi.
 *
 * Người dùng từ chối ⇒ `locationGranted` giữ `false` và luồng đi tiếp bình
 * thường. App phải dùng được khi bị từ chối; đó cũng là điều màn hình này đang
 * hứa ngay bên dưới nút.
 */
async function toggleLocation(
  data: OnboardingData,
  patch: (p: Partial<OnboardingData>) => void,
): Promise<void> {
  if (data.locationGranted) {
    // Rút lại phải dễ ngang lúc đồng ý — bỏ cờ ở client là đủ, vì toạ độ chưa
    // rời máy cho tới bước gửi hồ sơ.
    patch({ locationGranted: false });
    return;
  }
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) {
    patch({ locationGranted: false });
    return;
  }
  patch({ locationGranted: true });
}

function StepIntentAndLocation({ data, patch }: { data: OnboardingData; patch: (p: Partial<OnboardingData>) => void }) {
  return (
    <>
      <Text style={styles.h1}>Bạn đang tìm kiếm điều gì?</Text>
      <Text style={styles.sub}>
        Chọn một hoặc nhiều mục — chúng tôi ưu tiên ghép những người tìm cùng một thứ.
        Bạn có thể đổi bất cứ lúc nào.
      </Text>
      <View style={styles.chips}>
        {INTENTS.map((t, i) => (
          <ListEnter key={t} index={i}>
            <Chip
              label={t}
              active={data.intent.includes(t)}
              onPress={() => {
                void haptic.selection();
                patch({
                  intent: data.intent.includes(t)
                    ? data.intent.filter((x) => x !== t)
                    : [...data.intent, t],
                });
              }}
            />
          </ListEnter>
        ))}
      </View>

      {/* NĐ13/2023: vị trí là DỮ LIỆU NHẠY CẢM ⇒ phải xin đồng ý RIÊNG BIỆT,
          giải thích rõ mục đích, và app phải dùng được (kém hơn) nếu bị từ chối. */}
      <View style={styles.permCard}>
        <Text style={styles.permTitle}>Cho phép truy cập vị trí</Text>
        <Text style={styles.permBody}>
          Vị trí được dùng để gợi ý người ở gần bạn và tính khoảng cách hiển thị. Chúng tôi
          lưu vị trí ở độ chính xác khu vực, không lưu lịch sử di chuyển. Bạn có thể tắt bất
          cứ lúc nào trong Cài đặt.
        </Text>
        <PressableScale
          style={[styles.permBtn, data.locationGranted && styles.permBtnOn]}
          onPress={() => void toggleLocation(data, patch)}
          hapticOnPress="medium"
          accessibilityLabel="Cho phép truy cập vị trí"
        >
          <Text style={styles.permBtnText}>
            {data.locationGranted ? "Đã cho phép" : "Cho phép"}
          </Text>
        </PressableScale>
        <Text style={styles.note}>
          Không cho phép? Bạn vẫn dùng được app — chúng tôi sẽ hỏi khu vực bạn đang sống thay thế.
        </Text>
      </View>
    </>
  );
}

/* ===========================================================================
 * MÀN BỔ SUNG #5 — XÁC MINH ẢNH (Photo Verification)
 *
 * Bắt buộc với bản công khai. Cơ chế: app yêu cầu người dùng chụp selfie theo
 * một TƯ THẾ NGẪU NHIÊN (do server sinh, không đoán trước được), rồi so khớp
 * với ảnh hồ sơ.
 *
 * Ba điểm kỹ thuật quyết định thành bại:
 *   1. Tư thế phải do SERVER sinh và có hạn dùng ngắn — nếu client tự chọn,
 *      kẻ gian dựng sẵn thư viện ảnh cho mọi tư thế.
 *   2. Liveness check phải chạy ON-DEVICE (ExecuTorch/Core ML) trước khi gửi —
 *      chặn ảnh chụp lại màn hình ngay tại nguồn, tiết kiệm băng thông và
 *      lộ ít dữ liệu sinh trắc hơn.
 *   3. KHÔNG lưu ảnh selfie xác minh sau khi so khớp xong. Đây là dữ liệu sinh
 *      trắc học — lưu lại là gánh nặng pháp lý khổng lồ mà không có lợi ích.
 * =========================================================================== */
export type VerifyState = "idle" | "capturing" | "checking" | "passed" | "failed";

export function PhotoVerificationScreen({
  posePrompt,
  state,
  onCapture,
  onRetry,
}: {
  posePrompt: string;
  state: VerifyState;
  onCapture: () => void;
  onRetry: () => void;
}) {
  return (
    <View style={styles.root}>
      <Text style={styles.h1}>Xác minh ảnh thật</Text>
      <Text style={styles.sub}>
        Hồ sơ đã xác minh nhận được nhiều lượt thích hơn và giúp cộng đồng an toàn hơn.
      </Text>

      <View style={styles.poseCard}>
        <Text style={styles.poseLabel}>Tư thế của bạn hôm nay</Text>
        <Text style={styles.pose}>{posePrompt}</Text>
        <Text style={styles.note}>Tư thế thay đổi mỗi lần — đó là cách chúng tôi biết đây là bạn.</Text>
      </View>

      <View style={styles.viewfinder}>
        {state === "checking" ? (
          <Skeleton width="100%" height={280} radius={16} />
        ) : (
          <Text style={styles.viewfinderText}>
            {state === "passed" ? "✓ Đã xác minh" : state === "failed" ? "Chưa khớp" : "Khung camera"}
          </Text>
        )}
      </View>

      {state === "failed" && (
        <Text style={styles.error}>
          Ảnh chưa khớp với hồ sơ. Hãy thử ở nơi đủ sáng và giữ khuôn mặt trong khung.
        </Text>
      )}

      <PressableScale
        style={styles.primary}
        onPress={state === "failed" ? onRetry : onCapture}
        hapticOnPress="medium"
        disabled={state === "checking"}
        accessibilityLabel={state === "failed" ? "Thử lại" : "Chụp ảnh xác minh"}
      >
        <Text style={styles.primaryText}>
          {state === "checking" ? "Đang kiểm tra…" : state === "failed" ? "Thử lại" : "Chụp ảnh"}
        </Text>
      </PressableScale>

      <Text style={styles.legal}>
        Ảnh xác minh chỉ dùng để so khớp và bị xoá ngay sau đó. Chúng tôi không lưu dữ liệu
        sinh trắc học của bạn.
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ dùng chung */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale
      style={[styles.chip, active && styles.chipOn]}
      onPress={onPress}
      hapticOnPress="none"
      accessibilityLabel={`${label}${active ? ", đã chọn" : ""}`}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </PressableScale>
  );
}

function Field({
  label, value, onChange, placeholder, multiline, counter,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; multiline?: boolean; counter?: string;
}) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.textFaint}
        multiline={multiline}
        style={[styles.input, multiline && { height: 110, textAlignVertical: "top" }]}
        accessibilityLabel={label}
      />
      {counter && <Text style={styles.counter}>{counter}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  // paddingTop/paddingBottom KHÔNG đặt ở đây mà lấy từ useSafeAreaInsets().
  // Số cứng (64 trên iOS, 40 trên Android) chỉ đúng với đúng một kích thước máy:
  // Pixel 4 XL để thanh điều hướng 3 nút chiếm 48dp, nên `paddingBottom: 28` cũ
  // đẩy nút "Tiếp tục" chui xuống dưới thanh đó.
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { color: C.textMuted, fontSize: 14 },
  body: { paddingBottom: 32 },
  footer: { paddingTop: 8 },
  h1: { color: C.text, fontSize: 24, fontWeight: "700", marginTop: 24 },
  sub: { color: C.textMuted, fontSize: 14, marginTop: 8, lineHeight: 21 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.textMuted, fontSize: 13 },
  chipTextOn: { color: C.textOn, fontWeight: "600" },
  counter: { color: C.textMuted, fontSize: 12, marginTop: 10, textAlign: "right" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  photoSlot: {
    width: "31%", aspectRatio: 0.75, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surface, alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  photoImg: { width: "100%", height: "100%" },
  photoPlus: { color: C.textFaint, fontSize: 28 },
  mainBadge: { position: "absolute", bottom: 6, left: 6, backgroundColor: "rgba(0,0,0,.7)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  mainBadgeText: { color: C.textOn, fontSize: 10 },
  note: { color: C.textMuted, fontSize: 12, lineHeight: 18, marginTop: 12 },
  fieldLabel: { color: C.textMuted, fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 15, padding: 14 },
  permCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginTop: 28 },
  permTitle: { color: C.text, fontSize: 16, fontWeight: "600" },
  permBody: { color: C.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  permBtn: { borderRadius: 999, borderWidth: 1, borderColor: C.accent, paddingVertical: 12, alignItems: "center", marginTop: 14 },
  permBtnOn: { backgroundColor: C.accent },
  permBtnText: { color: C.textOn, fontWeight: "600" },
  poseCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginTop: 24 },
  poseLabel: { color: C.textMuted, fontSize: 12 },
  pose: { color: C.text, fontSize: 18, fontWeight: "600", marginTop: 6 },
  viewfinder: { height: 280, borderRadius: 16, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", marginTop: 20 },
  viewfinderText: { color: C.textMuted },
  primary: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 16, alignItems: "center", marginTop: 20 },
  primaryText: { color: C.textOn, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  skip: { color: C.textMuted, fontSize: 14, textAlign: "center", paddingVertical: 14 },
  error: { color: C.accent, fontSize: 13, marginTop: 12 },
  legal: { color: C.textMuted, fontSize: 12, lineHeight: 18, marginTop: 20 },
});
