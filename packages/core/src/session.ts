/**
 * Chặng khởi động + sổ đồng ý (NĐ13/2023) — phần THUẦN TUÝ.
 *
 * ─── Vì sao nằm ở core chứ không ở từng app ───────────────────────────────
 * Bản đầu tiên sống trọn trong `apps/mobile/src/session.ts`. Khi web cần đúng
 * luồng đó, chép sang là tạo ra hai bản của một quy tắc PHÁP LÝ — và hai bản
 * thì sẽ lệch. Lệch ở đây không phải lệch giao diện: nó là một nền tảng cho
 * người dùng vào deck khi chưa có đồng ý xu hướng tính dục, hoặc thu SĐT của
 * người chưa qua cổng tuổi. Cùng loại với `validateBirthDate` — đó là lý do
 * file này nằm cạnh nó.
 *
 * Ở đây KHÔNG có: kho lưu trữ (MMKV ở mobile, localStorage ở web), bảng đường
 * dẫn (expo-router khác hẳn hash router của web), và React. Chỉ có kiểu dữ
 * liệu và hàm thuần — nhờ vậy `node --test` chạy được, và backend dùng lại
 * được để tự kiểm tra thay vì tin lời client.
 */

/** Đổi khi nội dung chính sách đổi — người dùng phải đồng ý LẠI, không kế thừa. */
export const POLICY_VERSION = "2026-08-14";

export const CONSENT_PURPOSE = {
  /** Vị trí chính xác để xếp thẻ theo khoảng cách. */
  LOCATION: "location",
  /** Suy ra từ preferences.want_genders — nhạy cảm dù người dùng không tự khai. */
  ORIENTATION: "orientation",
} as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSE)[keyof typeof CONSENT_PURPOSE];

export interface ConsentRecord {
  purpose: ConsentPurpose;
  granted: boolean;
  /** Mốc thời gian — phần "chứng minh được" của NĐ13. */
  atMs: number;
  /** Phiên bản chính sách tại thời điểm đồng ý. Đồng ý bản cũ không tính cho bản mới. */
  policyVersion: string;
}

export interface SessionState {
  /** ISO yyyy-mm-dd. LƯU NGÀY SINH, không lưu tuổi — tuổi sai sau 12 tháng. */
  birthDate: string | null;
  userId: string | null;
  token: string | null;
  onboarded: boolean;
  /**
   * Giới tính muốn tìm. `null` = chưa hỏi.
   *
   * Trường này LÀM PHÁT SINH dữ liệu nhạy cảm: xu hướng tính dục suy ra được
   * từ nó. Vì vậy nó có chặng riêng kèm đồng ý riêng, không gộp vào onboarding.
   */
  wantGenders: string[] | null;
  verified: boolean;
  /**
   * Đã bấm "Để sau" ở màn xác minh ảnh.
   *
   * Xác minh là bước AN TOÀN, không phải PHÁP LÝ — nên nó khuyến khích chứ
   * không chặn. Màn đó hứa một phần thưởng ("hồ sơ đã xác minh nhận nhiều lượt
   * thích hơn"); hứa thưởng rồi chặn đường là mâu thuẫn.
   */
  verifyDeferred: boolean;
  consents: Partial<Record<ConsentPurpose, ConsentRecord>>;
}

export const EMPTY_SESSION: SessionState = {
  birthDate: null,
  userId: null,
  token: null,
  onboarded: false,
  wantGenders: null,
  verified: false,
  verifyDeferred: false,
  consents: {},
};

/** Đồng ý còn hiệu lực = đã cho phép VÀ đúng phiên bản chính sách hiện hành. */
export function hasConsent(state: SessionState, purpose: ConsentPurpose): boolean {
  const c = state.consents[purpose];
  return c?.granted === true && c.policyVersion === POLICY_VERSION;
}

/**
 * Ghi một mốc đồng ý và trả về state MỚI.
 *
 * `granted: false` là RÚT LẠI — cùng một hàm, cùng một chi phí thao tác. Nếu
 * rút lại khó hơn đồng ý thì đồng ý đó không tự nguyện, và không tự nguyện thì
 * theo NĐ13 nó không có giá trị.
 *
 * Rút lại đồng ý ORIENTATION phải XOÁ `wantGenders` ngay tại đây, không để nơi
 * gọi tự nhớ. Giữ lại "phòng khi người dùng đổi ý" chính là định nghĩa của xử
 * lý dữ liệu không có cơ sở pháp lý.
 */
export function applyConsent(
  state: SessionState,
  purpose: ConsentPurpose,
  granted: boolean,
  atMs: number,
): SessionState {
  const record: ConsentRecord = { purpose, granted, atMs, policyVersion: POLICY_VERSION };
  const next: SessionState = {
    ...state,
    consents: { ...state.consents, [purpose]: record },
  };
  if (purpose === CONSENT_PURPOSE.ORIENTATION && !granted) {
    next.wantGenders = null;
  }
  return next;
}

/** Bước tiếp theo trong luồng khởi động. Một nguồn sự thật duy nhất cho điều hướng. */
export type SessionStage =
  | "age-gate"
  | "sign-in"
  | "onboarding"
  | "preferences"
  | "verify"
  | "ready";

/**
 * Thứ tự CÓ Ý NGHĨA và không tuỳ tiện đảo được:
 *
 *   age-gate  trước sign-in  — chưa xác định đủ tuổi thì chưa được thu SĐT.
 *   preferences trước ready  — deck cần want_genders mới xếp được, và trường
 *                              đó chỉ tồn tại hợp pháp khi đã có đồng ý riêng.
 *   verify    sau cùng       — và BỎ QUA ĐƯỢC, vì nó là bước an toàn chứ không
 *                              phải bước pháp lý.
 *
 * Rút lại đồng ý ORIENTATION ⇒ `wantGenders` bị xoá ⇒ hàm này tự đưa người
 * dùng về chặng `preferences`. Đó là hành vi đúng: không còn cơ sở pháp lý thì
 * không còn dữ liệu, và không có dữ liệu thì không xếp được deck.
 */
export function stageOf(state: SessionState): SessionStage {
  if (!state.birthDate) return "age-gate";
  if (!state.token || !state.userId) return "sign-in";
  if (!state.onboarded) return "onboarding";
  if (state.wantGenders === null || !hasConsent(state, CONSENT_PURPOSE.ORIENTATION)) {
    return "preferences";
  }
  if (!state.verified && !state.verifyDeferred) return "verify";
  return "ready";
}

/**
 * Đăng xuất KHÔNG xoá ngày sinh: cổng tuổi khoá theo THIẾT BỊ. Xoá đi thì
 * người bị chặn chỉ cần đăng xuất rồi khai một ngày khác.
 */
export function signedOut(state: SessionState): SessionState {
  return { ...EMPTY_SESSION, birthDate: state.birthDate };
}
