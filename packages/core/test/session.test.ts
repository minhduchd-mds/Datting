import { strict as assert } from "node:assert";
import test from "node:test";

import {
  applyConsent,
  CONSENT_PURPOSE,
  EMPTY_SESSION,
  hasConsent,
  POLICY_VERSION,
  signedOut,
  stageOf,
  type SessionState,
} from "../src/session.js";

/** Người dùng đã đi hết luồng: dùng làm mốc để lùi từng bước một. */
function daXong(): SessionState {
  return {
    birthDate: "1996-04-12",
    userId: "1",
    token: "t",
    onboarded: true,
    wantGenders: ["nu"],
    verified: true,
    verifyDeferred: false,
    consents: {
      [CONSENT_PURPOSE.ORIENTATION]: {
        purpose: CONSENT_PURPOSE.ORIENTATION,
        granted: true,
        atMs: 1_700_000_000_000,
        policyVersion: POLICY_VERSION,
      },
    },
  };
}

test("phiên rỗng dừng ở cổng tuổi", () => {
  assert.equal(stageOf(EMPTY_SESSION), "age-gate");
});

test("cổng tuổi đứng TRƯỚC đăng nhập", () => {
  // Đây là thứ tự pháp lý, không phải thứ tự thẩm mỹ: đặt ngược lại nghĩa là
  // đã thu SĐT của một người có thể chưa đủ 18 tuổi rồi mới đi hỏi tuổi.
  const chuaKhaiTuoi: SessionState = { ...EMPTY_SESSION, userId: "1", token: "t" };
  assert.equal(stageOf(chuaKhaiTuoi), "age-gate");
});

test("có ngày sinh nhưng chưa có token thì phải đăng nhập", () => {
  assert.equal(stageOf({ ...EMPTY_SESSION, birthDate: "1996-04-12" }), "sign-in");
});

test("thiếu MỘT trong hai (userId, token) vẫn là chưa đăng nhập", () => {
  const chiCoToken: SessionState = { ...EMPTY_SESSION, birthDate: "1996-04-12", token: "t" };
  const chiCoId: SessionState = { ...EMPTY_SESSION, birthDate: "1996-04-12", userId: "1" };
  assert.equal(stageOf(chiCoToken), "sign-in");
  assert.equal(stageOf(chiCoId), "sign-in");
});

test("đăng nhập rồi nhưng chưa onboarding", () => {
  const s: SessionState = { ...EMPTY_SESSION, birthDate: "1996-04-12", userId: "1", token: "t" };
  assert.equal(stageOf(s), "onboarding");
});

test("chưa hỏi giới tính muốn tìm thì dừng ở preferences", () => {
  const s: SessionState = { ...daXong(), wantGenders: null };
  assert.equal(stageOf(s), "preferences");
});

test("có want_genders nhưng KHÔNG có đồng ý xu hướng ⇒ vẫn dừng ở preferences", () => {
  // Trường hợp nguy hiểm nhất: dữ liệu nhạy cảm đã tồn tại mà cơ sở pháp lý
  // cho nó thì không. Không được đi tiếp vào deck.
  const s: SessionState = { ...daXong(), consents: {} };
  assert.equal(stageOf(s), "preferences");
});

test("đồng ý theo phiên bản chính sách CŨ không còn hiệu lực", () => {
  const s: SessionState = {
    ...daXong(),
    consents: {
      [CONSENT_PURPOSE.ORIENTATION]: {
        purpose: CONSENT_PURPOSE.ORIENTATION,
        granted: true,
        atMs: 1,
        policyVersion: "2020-01-01",
      },
    },
  };
  assert.equal(hasConsent(s, CONSENT_PURPOSE.ORIENTATION), false);
  assert.equal(stageOf(s), "preferences");
});

test("xác minh ảnh BỎ QUA được — nó là bước an toàn, không phải bước pháp lý", () => {
  const chuaXacMinh: SessionState = { ...daXong(), verified: false, verifyDeferred: false };
  assert.equal(stageOf(chuaXacMinh), "verify");

  const deSau: SessionState = { ...chuaXacMinh, verifyDeferred: true };
  assert.equal(stageOf(deSau), "ready", "bấm 'Để sau' phải đi tiếp được");
});

test("đi hết luồng thì sẵn sàng", () => {
  assert.equal(stageOf(daXong()), "ready");
});

test("RÚT LẠI đồng ý xu hướng xoá luôn want_genders và đẩy về preferences", () => {
  // Đây là bài test đáng giá nhất trong file. Giữ lại `wantGenders` sau khi
  // người dùng rút đồng ý chính là định nghĩa của xử lý dữ liệu không có cơ sở
  // pháp lý — và nó sẽ trông hoàn toàn bình thường trên giao diện.
  const truoc = daXong();
  assert.equal(stageOf(truoc), "ready");

  const sau = applyConsent(truoc, CONSENT_PURPOSE.ORIENTATION, false, 1_700_000_001_000);
  assert.equal(sau.wantGenders, null, "dữ liệu nhạy cảm phải biến mất cùng đồng ý");
  assert.equal(hasConsent(sau, CONSENT_PURPOSE.ORIENTATION), false);
  assert.equal(stageOf(sau), "preferences", "không còn cơ sở pháp lý thì không vào deck");
});

test("rút lại đồng ý VỊ TRÍ không đụng tới want_genders", () => {
  // Mỗi mục đích độc lập. Rút cái này mà xoá dữ liệu của cái kia là phạt người
  // dùng vì đã thực hiện quyền của mình.
  const sau = applyConsent(daXong(), CONSENT_PURPOSE.LOCATION, false, 2);
  assert.deepEqual(sau.wantGenders, ["nu"]);
  assert.equal(stageOf(sau), "ready");
});

test("mốc đồng ý ghi đủ thời điểm và phiên bản — phần 'chứng minh được'", () => {
  const sau = applyConsent(EMPTY_SESSION, CONSENT_PURPOSE.LOCATION, true, 1_234_567);
  const c = sau.consents[CONSENT_PURPOSE.LOCATION];
  assert.ok(c);
  assert.equal(c.granted, true);
  assert.equal(c.atMs, 1_234_567);
  assert.equal(c.policyVersion, POLICY_VERSION);
});

test("applyConsent KHÔNG sửa state cũ", () => {
  // Store của cả hai app đều so sánh tham chiếu để quyết định render lại.
  const truoc = daXong();
  const ban = JSON.stringify(truoc);
  applyConsent(truoc, CONSENT_PURPOSE.ORIENTATION, false, 9);
  assert.equal(JSON.stringify(truoc), ban);
});

test("đăng xuất GIỮ ngày sinh — cổng tuổi khoá theo thiết bị", () => {
  // Xoá ngày sinh khi đăng xuất biến cổng tuổi thành thủ tục trang trí: người
  // bị chặn chỉ cần đăng xuất rồi khai lại một ngày khác.
  const sau = signedOut(daXong());
  assert.equal(sau.birthDate, "1996-04-12");
  assert.equal(sau.token, null);
  assert.equal(sau.userId, null);
  assert.equal(stageOf(sau), "sign-in");
});

test("đăng xuất xoá sạch đồng ý và dữ liệu nhạy cảm", () => {
  const sau = signedOut(daXong());
  assert.deepEqual(sau.consents, {});
  assert.equal(sau.wantGenders, null);
});
