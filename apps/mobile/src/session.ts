/**
 * Phiên đăng nhập + sổ đồng ý (NĐ13/2023).
 *
 * ─── Vì sao MMKV chứ không AsyncStorage ────────────────────────────────────
 * MMKV đọc ĐỒNG BỘ. Router phải quyết định màn hình đầu tiên NGAY ở lần render
 * đầu; với AsyncStorage (bất đồng bộ) sẽ có một frame trống, rồi nhảy màn —
 * người dùng đã đăng nhập vẫn thấy loé màn đăng nhập mỗi lần mở app.
 *
 * MMKV là native module, KHÔNG chạy trong Expo Go. Phải dùng dev client hoặc
 * bản build EAS. Đó là lý do repo này không dùng Expo Go.
 *
 * ─── Vì sao đồng ý phải TÁCH RIÊNG ────────────────────────────────────────
 * NĐ13/2023: vị trí VÀ xu hướng tính dục đều là dữ liệu nhạy cảm. Xu hướng
 * tính dục KHÔNG được hỏi trực tiếp — nó SUY RA ĐƯỢC từ `preferences.want_genders`,
 * và luật nhìn vào dữ liệu suy ra được y như dữ liệu khai báo.
 *
 * Hệ quả: một ô tích "Tôi đồng ý với điều khoản" là KHÔNG HỢP LỆ. Mỗi mục đích
 * cần đồng ý riêng, chứng minh được (mốc thời gian + phiên bản chính sách), và
 * rút lại được bất cứ lúc nào — rút lại phải dễ ngang lúc đồng ý.
 *
 * BẢN GHI Ở ĐÂY CHỈ LÀ BẢN SAO ĐỂ DỰNG UI. Bằng chứng pháp lý phải nằm ở
 * server: client xoá app là bằng chứng biến mất. Mọi thay đổi ở đây phải kèm
 * một lệnh gọi lên server (xem `api.setConsent`).
 */
import { MMKV } from "react-native-mmkv";
import { useSyncExternalStore } from "react";

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
  /** Phiên bản chính sách tại thời điểm đồng ý. Đồng ý với bản cũ không tính cho bản mới. */
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
   * Đây là trường làm PHÁT SINH dữ liệu nhạy cảm: xu hướng tính dục suy ra
   * được từ nó. Vì vậy nó không nằm trong OnboardingData chung mà có chặng
   * riêng, kèm đồng ý riêng — xem app/(onboarding)/preferences.tsx.
   */
  wantGenders: string[] | null;
  verified: boolean;
  /**
   * Người dùng đã bấm "Để sau" ở màn xác minh ảnh.
   *
   * Xác minh là bước AN TOÀN, không phải bước PHÁP LÝ — nên nó khuyến khích
   * chứ không chặn. Ép selfie ngay lúc đăng ký giết tỉ lệ hoàn tất, mà chính
   * màn hình đó cũng nói "hồ sơ đã xác minh nhận được nhiều lượt thích hơn":
   * đó là câu của một phần thưởng, không phải của một rào chắn.
   */
  verifyDeferred: boolean;
  consents: Partial<Record<ConsentPurpose, ConsentRecord>>;
}

const EMPTY: SessionState = {
  birthDate: null,
  userId: null,
  token: null,
  onboarded: false,
  wantGenders: null,
  verified: false,
  verifyDeferred: false,
  consents: {},
};

const KEY = "session.v1";
const storage = new MMKV({ id: "datting-session" });

/**
 * `useSyncExternalStore` yêu cầu getSnapshot trả về CÙNG một tham chiếu khi
 * dữ liệu không đổi. Trả object mới mỗi lần gọi ⇒ React coi là đã thay đổi ⇒
 * render vô hạn. Nên snapshot được cache và chỉ thay khi thực sự ghi.
 */
let snapshot: SessionState = read();
const listeners = new Set<() => void>();

function read(): SessionState {
  const raw = storage.getString(KEY);
  if (!raw) return EMPTY;
  try {
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<SessionState>) };
  } catch {
    // Dữ liệu hỏng: bắt đầu lại còn hơn treo app ở màn trắng.
    storage.delete(KEY);
    return EMPTY;
  }
}

function write(next: SessionState): void {
  snapshot = next;
  storage.set(KEY, JSON.stringify(next));
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): SessionState {
  return snapshot;
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Đọc ngoài React (ví dụ trong api client để lấy token). */
export function currentSession(): SessionState {
  return snapshot;
}

export const session = {
  passAgeGate(birthDate: string): void {
    write({ ...snapshot, birthDate });
  },

  signIn(userId: string, token: string): void {
    write({ ...snapshot, userId, token });
  },

  finishOnboarding(): void {
    write({ ...snapshot, onboarded: true });
  },

  /**
   * Ghi giới tính muốn tìm. Chỉ gọi khi ĐÃ có đồng ý ORIENTATION — dữ liệu nhạy
   * cảm không được tồn tại trước khi có cơ sở pháp lý để tồn tại.
   */
  setWantGenders(wantGenders: string[]): void {
    write({ ...snapshot, wantGenders });
  },

  setVerified(verified: boolean): void {
    write({ ...snapshot, verified });
  },

  deferVerification(): void {
    write({ ...snapshot, verifyDeferred: true });
  },

  /**
   * Ghi đồng ý. `granted: false` là RÚT LẠI — cùng một hàm, cùng một chi phí
   * thao tác. Nếu rút lại khó hơn đồng ý thì đồng ý đó không tự nguyện.
   */
  setConsent(purpose: ConsentPurpose, granted: boolean): ConsentRecord {
    const record: ConsentRecord = {
      purpose,
      granted,
      atMs: Date.now(),
      policyVersion: POLICY_VERSION,
    };
    const next: SessionState = {
      ...snapshot,
      consents: { ...snapshot.consents, [purpose]: record },
    };
    // Rút lại đồng ý phải XOÁ dữ liệu đã thu theo đồng ý đó. Giữ lại "để lỡ
    // người dùng đổi ý" là đúng nghĩa xử lý không có cơ sở pháp lý.
    if (purpose === CONSENT_PURPOSE.ORIENTATION && !granted) {
      next.wantGenders = null;
    }
    write(next);
    return record;
  },

  /**
   * Đăng xuất KHÔNG xoá ngày sinh: cổng tuổi khoá theo thiết bị. Xoá đi thì
   * người bị chặn chỉ cần đăng xuất rồi khai lại ngày khác.
   */
  signOut(): void {
    write({ ...EMPTY, birthDate: snapshot.birthDate });
  },

  /** Xoá tài khoản phía client. Xoá mềm 30 ngày + purge cứng là việc của server. */
  wipe(): void {
    write(EMPTY);
  },
};

/** Đồng ý còn hiệu lực = đã cho phép VÀ đúng phiên bản chính sách hiện hành. */
export function hasConsent(state: SessionState, purpose: ConsentPurpose): boolean {
  const c = state.consents[purpose];
  return c?.granted === true && c.policyVersion === POLICY_VERSION;
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
 * Đường dẫn cho mỗi chặng. Mỗi giá trị TRỎ THẲNG VÀO MỘT FILE.
 *
 * ─── Hai cái bẫy của Expo Router, đã dính đủ cả hai ───────────────────────
 *
 * (1) Dấu ngoặc là route group: đoạn `(onboarding)` bị xoá hẳn khỏi URL. Nên
 *     nếu để tên file là `index.tsx`, BA màn khác nhau cùng nhận đường dẫn `/`:
 *
 *         app/index.tsx              → /
 *         app/(onboarding)/index.tsx → /      ← trùng
 *         app/(tabs)/index.tsx       → /      ← trùng
 *
 *     `router.replace("/")` khi đó là lệnh MƠ HỒ, và nó được giải theo chỗ
 *     đứng lúc gọi: từ `(onboarding)` thì nhóm hiện tại thắng ⇒ quay lại bước 1
 *     với `useState(0)` khởi tạo lại, người dùng làm xong onboarding lại bị ném
 *     về đầu và không bao giờ tới được deck.
 *
 * (2) Nêu tên nhóm cũng KHÔNG cứu được: `"/(onboarding)"` trỏ vào một *nhóm*
 *     chứ không vào một *file*. Nhóm này không có `_layout.tsx` nên nó không
 *     tạo navigator — ba file con được nâng thẳng lên Stack gốc — và bộ định
 *     tuyến phải tự chọn màn nào là "màn của nhóm". Nó chọn `preferences`,
 *     tức nhảy cóc qua toàn bộ 4 bước onboarding.
 *
 * ─── Vì vậy: KHÔNG file nào trong nhóm được đặt tên `index` ───────────────
 * `(onboarding)/profile.tsx` và `(tabs)/discover.tsx` mang tên riêng, nên
 * `/` chỉ còn ĐÚNG MỘT file đòi (app/index.tsx) và mọi href dưới đây là một
 * đường dẫn có thật, giải được mà không cần đoán. Đổi tên hai file đó về
 * `index.tsx` là dựng lại nguyên cả hai cái bẫy.
 */
export const STAGE_ROUTE: Record<SessionStage, string> = {
  "age-gate": "/(auth)/age-gate",
  "sign-in": "/(auth)/sign-in",
  onboarding: "/(onboarding)/profile",
  preferences: "/(onboarding)/preferences",
  verify: "/(onboarding)/verify",
  ready: "/(tabs)/discover",
};

/**
 * Chặng kế tiếp, đọc NGAY từ snapshot hiện hành.
 *
 * Gọi được ngay sau `session.*` vì `write()` gán `snapshot` đồng bộ trước khi
 * báo cho listener — không phải chờ React render xong mới có state mới.
 */
export function nextRoute(): string {
  return STAGE_ROUTE[stageOf(snapshot)];
}
