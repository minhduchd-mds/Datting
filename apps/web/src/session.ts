import { useSyncExternalStore } from "react";

import {
  applyConsent,
  EMPTY_SESSION,
  signedOut,
  type ConsentPurpose,
  type SessionState,
} from "@datting/core";

/**
 * Phiên đăng nhập phía web — phần RIÊNG CỦA WEB.
 *
 * Luật (máy trạng thái chặng, quy tắc đồng ý, hình dạng state) nằm ở
 * `@datting/core/src/session.ts`, dùng chung với mobile. Ở đây chỉ có kho lưu
 * trữ và cầu nối React. Xem đầu file bên core để biết vì sao không được chép.
 *
 * ─── Vì sao localStorage chứ không cookie ─────────────────────────────────
 * localStorage đọc ĐỒNG BỘ, nên lần render đầu đã biết phải hiện màn nào. Với
 * một nguồn bất đồng bộ sẽ có một frame trống rồi nhảy màn — người đã đăng
 * nhập vẫn thấy loé màn đăng nhập mỗi lần mở tab. Cùng lý do mobile chọn MMKV
 * thay AsyncStorage.
 *
 * Đánh đổi phải nói rõ: localStorage đọc được bằng JavaScript, nên một lỗ XSS
 * là mất token. Cookie `HttpOnly` thì không. Đổi sang cookie là việc của lúc
 * có domain thật và HTTPS — lúc đó `credentials: "include"` trong `api.ts` đã
 * sẵn sàng và chỉ cần bỏ header `Authorization` đi.
 */

const KEY = "datting.session.v1";

/**
 * `useSyncExternalStore` đòi getSnapshot trả về CÙNG tham chiếu khi dữ liệu
 * không đổi. Trả object mới mỗi lần gọi ⇒ React coi là đã đổi ⇒ render vô hạn.
 */
let snapshot: SessionState = read();
const listeners = new Set<() => void>();

function read(): SessionState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return EMPTY_SESSION;
    return { ...EMPTY_SESSION, ...(JSON.parse(raw) as Partial<SessionState>) };
  } catch {
    // Hỏng dữ liệu, hoặc localStorage bị chặn (chế độ riêng tư ở vài trình
    // duyệt). Bắt đầu lại còn hơn treo ở màn trắng.
    return EMPTY_SESSION;
  }
}

function write(next: SessionState): void {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Hết dung lượng hoặc bị chặn. Phiên vẫn sống trong tab này — mất khi tải
    // lại trang, nhưng thế còn hơn ném lỗi giữa lúc đăng nhập.
  }
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

/** Đọc ngoài React — `api.ts` cần token mà nó không phải là component. */
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
   * Ghi giới tính muốn tìm. Chỉ gọi khi ĐÃ có đồng ý ORIENTATION — dữ liệu
   * nhạy cảm không được tồn tại trước khi có cơ sở pháp lý để tồn tại.
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
   * Ghi đồng ý. `granted: false` là RÚT LẠI. Luật — kể cả việc rút ORIENTATION
   * phải xoá `wantGenders` — nằm ở `applyConsent` của core, không lặp ở đây.
   */
  setConsent(purpose: ConsentPurpose, granted: boolean): void {
    write(applyConsent(snapshot, purpose, granted, Date.now()));
  },

  /** Đăng xuất GIỮ ngày sinh: cổng tuổi khoá theo thiết bị. (Luật ở core.) */
  signOut(): void {
    write(signedOut(snapshot));
  },
};
