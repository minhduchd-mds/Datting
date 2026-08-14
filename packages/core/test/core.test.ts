import test from "node:test";
import assert from "node:assert/strict";

import {
  DURATION,
  SPRING,
  EASING,
  staggerDelay,
  flingDuration,
  cardRotation,
  stampOpacity,
  resolveMotionConfig,
  createThresholdGate,
} from "../src/motion.js";
import { validateBirthDate, computeAge, MIN_AGE } from "../src/birthDate.js";

/* ===========================================================================
 * Motion tokens — phần toán của hiệu ứng phải test được, và phải test.
 * Animation sai không "crash", nó chỉ khiến app cảm thấy rẻ tiền — đó là lý do
 * nó thường trôi đi mà không ai phát hiện.
 * =========================================================================== */

test("thang thời lượng tăng đơn điệu và không có giá trị trùng", () => {
  const v = [DURATION.instant, DURATION.fast, DURATION.base, DURATION.slow, DURATION.celebration];
  for (let i = 1; i < v.length; i++) {
    assert.ok(v[i]! > v[i - 1]!, `thang bị đảo tại vị trí ${i}`);
  }
});

test("mọi đường cong Bézier đều nằm trong miền hợp lệ của x", () => {
  for (const [name, c] of Object.entries(EASING)) {
    assert.ok(c[0] >= 0 && c[0] <= 1, `${name}: x1 ngoài [0,1]`);
    assert.ok(c[2] >= 0 && c[2] <= 1, `${name}: x2 ngoài [0,1]`);
  }
});

test("chỉ có SPRING.celebrate được phép nảy rõ (damping thấp)", () => {
  assert.ok(SPRING.celebrate.damping < 12);
  for (const [name, s] of Object.entries(SPRING)) {
    if (name === "celebrate") continue;
    assert.ok(s.damping >= 15, `${name} có damping quá thấp (${s.damping}) — sẽ rung`);
  }
});

test("staggerDelay bão hoà — phần tử thứ 100 không phải chờ mãi", () => {
  assert.equal(staggerDelay(0), 0);
  assert.ok(staggerDelay(5) > staggerDelay(1), "phải tăng theo index");
  assert.ok(staggerDelay(100) <= 240, "phải bị chặn trên bởi cap");
  assert.equal(staggerDelay(100), staggerDelay(1000), "đã bão hoà thì không tăng nữa");
});

test("staggerDelay từ chối index âm", () => {
  assert.throws(() => staggerDelay(-1), /không được âm/);
});

test("flingDuration: vuốt càng mạnh, thẻ bay càng nhanh", () => {
  const slow = flingDuration(500, 400);
  const fast = flingDuration(3000, 400);
  assert.ok(fast < slow, "vuốt mạnh phải bay nhanh hơn");
});

test("flingDuration luôn nằm trong khoảng cảm nhận được (120–400ms)", () => {
  for (const v of [0, 50, 500, 5000, 100000, -3000]) {
    const d = flingDuration(v, 400);
    assert.ok(d >= 120 && d <= 400, `v=${v} cho d=${d}`);
  }
});

test("cardRotation bị chặn ở ±14° kể cả khi kéo vượt màn hình", () => {
  assert.equal(cardRotation(0, 400), 0);
  assert.ok(Math.abs(cardRotation(10_000, 400)) <= 14);
  assert.ok(Math.abs(cardRotation(-10_000, 400)) <= 14);
  assert.equal(cardRotation(100, 0), 0, "màn hình rộng 0 không được chia cho 0");
});

test("cardRotation đối xứng quanh gốc", () => {
  assert.equal(cardRotation(120, 400), -cardRotation(-120, 400));
});

test("stampOpacity: im lặng khi chạm nhẹ, đầy khi đạt ngưỡng", () => {
  const T = 100;
  assert.equal(stampOpacity(5, T, 1), 0, "chạm nhẹ không được hiện tem");
  assert.ok(stampOpacity(60, T, 1) > 0 && stampOpacity(60, T, 1) < 1);
  assert.equal(stampOpacity(100, T, 1), 1);
  assert.equal(stampOpacity(500, T, 1), 1, "không được vượt quá 1");
});

test("stampOpacity phân biệt đúng hai chiều", () => {
  const T = 100;
  assert.equal(stampOpacity(80, T, -1), 0, "kéo phải không được hiện tem BỎ QUA");
  assert.ok(stampOpacity(-80, T, -1) > 0, "kéo trái phải hiện tem BỎ QUA");
});

/* ------------------------------- giảm chuyển động (accessibility) --------- */

test("giảm chuyển động: rút ngắn thời lượng và tắt transform", () => {
  const normal = resolveMotionConfig(false);
  const reduced = resolveMotionConfig(true);

  assert.equal(normal.allowTransform, true);
  assert.equal(reduced.allowTransform, false);
  assert.equal(normal.duration("celebration"), DURATION.celebration);
  assert.ok(
    reduced.duration("celebration") <= DURATION.fast,
    "hiệu ứng ăn mừng phải bị rút ngắn khi bật giảm chuyển động",
  );
});

test("giảm chuyển động: mọi lò xo đều hết nảy", () => {
  const reduced = resolveMotionConfig(true);
  for (const name of ["card", "press", "sheet", "celebrate"] as const) {
    const s = reduced.spring(name);
    assert.ok(s.damping >= 40, `${name} vẫn còn nảy (damping=${s.damping})`);
  }
});

test("giảm chuyển động KHÔNG được làm animation dài ra", () => {
  const normal = resolveMotionConfig(false);
  const reduced = resolveMotionConfig(true);
  for (const name of ["instant", "fast", "base", "slow", "celebration"] as const) {
    assert.ok(reduced.duration(name) <= normal.duration(name), `${name} bị kéo dài`);
  }
});

test("resolveMotionConfig trả về bản sao — không rò rỉ tham chiếu SPRING gốc", () => {
  const c = resolveMotionConfig(false);
  const s = c.spring("card");
  s.damping = 999;
  assert.equal(SPRING.card.damping, 18, "hằng số gốc đã bị ghi đè");
});

/* ------------------------------------------------- cổng chống rung liên tiếp */

test("cổng haptic chỉ bắn ở CẠNH LÊN, không bắn mỗi frame", () => {
  let fired = 0;
  const g = createThresholdGate(() => fired++, 250);
  // mô phỏng 60 frame giữ nguyên trạng thái "đã vượt ngưỡng"
  for (let i = 0; i < 60; i++) g.update(true, 1000 + i * 16);
  assert.equal(fired, 1, `bắn ${fired} lần thay vì 1 — thiết bị sẽ rung liên tục`);
});

test("cổng haptic nạp lại sau khi kéo về dưới ngưỡng", () => {
  let fired = 0;
  const g = createThresholdGate(() => fired++, 100);
  g.update(true, 0);      // bắn
  g.update(false, 50);    // nạp lại
  g.update(true, 300);    // đủ khoảng cách → bắn
  assert.equal(fired, 2);
});

test("cổng haptic tôn trọng khoảng cách tối thiểu giữa hai lần bắn", () => {
  let fired = 0;
  const g = createThresholdGate(() => fired++, 250);
  g.update(true, 0);
  g.update(false, 10);
  g.update(true, 100); // mới 100ms < 250ms → KHÔNG bắn
  assert.equal(fired, 1);
});

test("cổng haptic reset() cho phép bắn lại ngay", () => {
  let fired = 0;
  const g = createThresholdGate(() => fired++, 250);
  g.update(true, 0);
  g.reset();
  g.update(true, 1);
  assert.equal(fired, 2);
});

/* ===========================================================================
 * Cổng tuổi — logic PHÁP LÝ. Sai ở đây là cho trẻ vị thành niên vào app.
 * =========================================================================== */

const TODAY = new Date(Date.UTC(2026, 7, 14)); // 14/08/2026

test("đúng 18 tuổi tính đến hôm nay thì được vào", () => {
  const r = validateBirthDate(14, 8, 2008, TODAY);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.age, 18);
});

test("thiếu ĐÚNG MỘT NGÀY so với 18 tuổi thì bị chặn", () => {
  const r = validateBirthDate(15, 8, 2008, TODAY);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, new RegExp(String(MIN_AGE)));
});

test("chưa tới sinh nhật trong năm phải trừ đi 1 tuổi", () => {
  // Sinh 31/12/2008; đến 14/08/2026 mới 17 tuổi, KHÔNG phải 18.
  assert.equal(computeAge(2008, 12, 31, TODAY), 17);
  assert.equal(validateBirthDate(31, 12, 2008, TODAY).ok, false);
});

test("29/02 chỉ hợp lệ trong năm nhuận", () => {
  assert.equal(validateBirthDate(29, 2, 2004, TODAY).ok, true);
  const bad = validateBirthDate(29, 2, 2005, TODAY);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.reason, /Ngày không hợp lệ/);
});

test("từ chối tháng và ngày ngoài miền", () => {
  assert.equal(validateBirthDate(1, 13, 1990, TODAY).ok, false);
  assert.equal(validateBirthDate(0, 5, 1990, TODAY).ok, false);
  assert.equal(validateBirthDate(31, 4, 1990, TODAY).ok, false); // tháng 4 có 30 ngày
});

test("từ chối năm sinh trong tương lai và quá xa quá khứ", () => {
  assert.equal(validateBirthDate(1, 1, 2030, TODAY).ok, false);
  assert.equal(validateBirthDate(1, 1, 1800, TODAY).ok, false);
});

test("từ chối trường rỗng thay vì coi là 0", () => {
  const r = validateBirthDate("", "8", "2000", TODAY);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /đầy đủ/);
});

test("ISO trả về luôn có dạng YYYY-MM-DD đã pad số 0", () => {
  const r = validateBirthDate(5, 3, 1999, TODAY);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.iso, "1999-03-05");
});
