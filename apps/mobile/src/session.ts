/**
 * Phiên đăng nhập + sổ đồng ý — phần RIÊNG CỦA MOBILE.
 *
 * ─── Luật đã dời sang core ────────────────────────────────────────────────
 * Máy trạng thái chặng (`stageOf`), luật đồng ý (`hasConsent`, `applyConsent`)
 * và hình dạng `SessionState` nay nằm ở `@datting/core/src/session.ts`, dùng
 * chung với web. Chúng là logic PHÁP LÝ: chúng quyết định khi nào được phép
 * thu SĐT và khi nào được vào deck. Giữ hai bản — một cho mobile, một cho web
 * — là bảo đảm hai bản sẽ lệch, và bản lệch sẽ trông hoàn toàn bình thường
 * trên giao diện. Cùng lý do đã đưa `validateBirthDate` vào core.
 *
 * Còn lại ở file này đúng ba thứ mà core không được biết:
 *   1. MMKV — kho lưu trữ native.
 *   2. `STAGE_ROUTE` — đường dẫn expo-router, không dùng lại được cho web.
 *   3. `useSyncExternalStore` — React.
 *
 * ─── Vì sao MMKV chứ không AsyncStorage ────────────────────────────────────
 * MMKV đọc ĐỒNG BỘ. Router phải quyết định màn hình đầu tiên NGAY ở lần render
 * đầu; với AsyncStorage (bất đồng bộ) sẽ có một frame trống rồi nhảy màn —
 * người dùng đã đăng nhập vẫn thấy loé màn đăng nhập mỗi lần mở app.
 *
 * MMKV là native module, KHÔNG chạy trong Expo Go. Phải dùng dev client hoặc
 * bản build EAS. Đó là lý do repo này không dùng Expo Go.
 *
 * ─── Bản ghi ở đây CHỈ LÀ BẢN SAO để dựng UI ──────────────────────────────
 * Bằng chứng pháp lý phải nằm ở server: client xoá app là bằng chứng biến mất.
 * Mọi thay đổi ở đây phải kèm một lệnh gọi lên server (xem `api.setConsent`).
 */
import { MMKV } from "react-native-mmkv";
import { useSyncExternalStore } from "react";

import {
  applyConsent,
  CONSENT_PURPOSE,
  EMPTY_SESSION,
  signedOut,
  stageOf,
  type ConsentPurpose,
  type ConsentRecord,
  type SessionStage,
  type SessionState,
} from "@datting/core";

/*
 * Phát lại những gì màn hình đang import.
 *
 * Chín file trong `app/` import từ module này. Bắt chúng đổi sang
 * `@datting/core` không đem lại gì ngoài rủi ro sửa nhầm — và module này vẫn
 * là cửa vào đúng cho mobile, vì nó mới là chỗ có kho lưu trữ.
 */
export {
  CONSENT_PURPOSE,
  POLICY_VERSION,
  hasConsent,
  stageOf,
  type ConsentPurpose,
  type ConsentRecord,
  type SessionStage,
  type SessionState,
} from "@datting/core";

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
  if (!raw) return EMPTY_SESSION;
  try {
    return { ...EMPTY_SESSION, ...(JSON.parse(raw) as Partial<SessionState>) };
  } catch {
    // Dữ liệu hỏng: bắt đầu lại còn hơn treo app ở màn trắng.
    storage.delete(KEY);
    return EMPTY_SESSION;
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
   * thao tác. Luật (kể cả việc rút ORIENTATION phải xoá `wantGenders`) nằm ở
   * `applyConsent` của core, không lặp lại ở đây.
   */
  setConsent(purpose: ConsentPurpose, granted: boolean): ConsentRecord {
    const next = applyConsent(snapshot, purpose, granted, Date.now());
    write(next);
    // `applyConsent` vừa ghi đúng mục đích này nên nó chắc chắn có mặt.
    return next.consents[purpose] as ConsentRecord;
  },

  /**
   * Đăng xuất KHÔNG xoá ngày sinh: cổng tuổi khoá theo thiết bị. Xoá đi thì
   * người bị chặn chỉ cần đăng xuất rồi khai lại ngày khác. (Luật ở core.)
   */
  signOut(): void {
    write(signedOut(snapshot));
  },

  /** Xoá tài khoản phía client. Xoá mềm 30 ngày + purge cứng là việc của server. */
  wipe(): void {
    write(EMPTY_SESSION);
  },
};

/**
 * Đường dẫn cho mỗi chặng. Mỗi giá trị TRỎ THẲNG VÀO MỘT FILE.
 *
 * Bảng này KHÔNG dời sang core được: nó là đường dẫn của expo-router, còn web
 * dùng hash router với tập đường dẫn khác hẳn. Chỉ `SessionStage` là chung.
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
