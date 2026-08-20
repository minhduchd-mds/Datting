import { strict as assert } from "node:assert";
import test from "node:test";

import { connectValkey, ValkeyClient } from "../src/valkey.js";
import { recordSwipe, undoSwipe } from "../src/mutualLike.js";
import { pairKey } from "../src/pairKey.js";

/**
 * Kiểm chứng trên Valkey THẬT.
 *
 * ─── Vì sao những bài này không thể là unit test ──────────────────────────
 * `mutualLike.ts` tồn tại vì một cuộc đua: A thích B và B thích A gần như cùng
 * lúc. Đọc-rồi-ghi ở tầng ứng dụng sẽ cho ra hoặc HAI match (cả hai bên cùng
 * thấy mình là người tạo) hoặc KHÔNG match nào (cả hai cùng đọc trước khi bên
 * kia ghi). Cách chữa là một script Lua chạy nguyên tử trên server.
 *
 * Một con giả trong bộ nhớ không chứng minh được gì về tính nguyên tử đó — nó
 * chỉ chứng minh rằng con giả cư xử như ta đã viết cho nó. Muốn biết script
 * Lua có thật sự nguyên tử thì phải có một server thật thi hành nó.
 *
 * ─── Vì sao TỰ BỎ QUA khi không có server ────────────────────────────────
 * Valkey không có bản Windows chính thức và máy dev ở đây không có Docker.
 * Bắt buộc phải có Valkey thì `npm test` gãy trên máy dev, và cái gãy đó sẽ
 * dạy người ta bỏ qua kết quả test. Nên: có `VALKEY_URL` thì chạy, không có
 * thì bỏ qua kèm lý do — CI đặt biến đó (xem job `integration` trong
 * `.github/workflows/ci.yml`) nên nhánh thật vẫn luôn được chạy ở đó.
 */
const URL = process.env["VALKEY_URL"];
const BO_QUA = { skip: URL ? false : "cần VALKEY_URL (CI đặt sẵn; máy dev thì bỏ qua)" };

/*
 * `connectValkey` trả về client ioredis THÔ, còn `recordSwipe` nhận `RedisLike`
 * — `ValkeyClient` là lớp bắc cầu giữa hai thứ đó (nó ép kết quả `eval` từ
 * `unknown` về `number`). Truyền thẳng client thô vào là lỗi biên dịch, và đó
 * là điều đúng: kiểu ở đây đang bắt ta đi qua đúng cái adapter mà production
 * cũng đi qua, thay vì test một đường dẫn khác với đường dẫn thật.
 */
async function moKetNoi() {
  const raw = await connectValkey(URL!);
  return { raw, v: new ValkeyClient(raw) };
}

/** ID riêng cho mỗi bài để hai bài không giẫm lên khoá của nhau. */
let dem = 0n;
function capId(): [bigint, bigint] {
  dem += 1n;
  return [900_000n + dem * 2n, 900_001n + dem * 2n];
}

test("một chiều thì CHƯA match", BO_QUA, async () => {
  const { raw, v } = await moKetNoi();
  try {
    const [a, b] = capId();
    const r = await recordSwipe(v, a, b, "like");
    assert.equal(r.matched, false);
    assert.equal(r.pairKey, pairKey(a, b));
  } finally {
    await raw.quit();
  }
});

test("hai chiều thì match, và pairKey giống hệt nhau", BO_QUA, async () => {
  const { raw, v } = await moKetNoi();
  try {
    const [a, b] = capId();
    const r1 = await recordSwipe(v, a, b, "like");
    const r2 = await recordSwipe(v, b, a, "like");

    assert.equal(r1.matched, false);
    assert.equal(r2.matched, true);
    // Bất biến #1 của CLAUDE.md: pairKey chỉ có MỘT biểu diễn `min:max`. Hai
    // lượt vuốt ngược chiều nhau phải ra cùng một khoá, nếu không thì Kafka
    // partition, Scylla partition và khoá Valkey trỏ vào ba chỗ khác nhau.
    assert.equal(r1.pairKey, r2.pairKey);
  } finally {
    await raw.quit();
  }
});

test("like LẶP LẠI không tạo match lần hai", BO_QUA, async () => {
  // Chống gửi nudge hai lần: `createdMatch` chỉ được đúng ở ĐÚNG lượt tạo ra
  // match. Bấm lại (mạng chập, người dùng bấm hai lần) không được sinh thêm
  // một thông báo "hai bạn đã kết nối".
  const { raw, v } = await moKetNoi();
  try {
    const [a, b] = capId();
    await recordSwipe(v, a, b, "like");
    const lan1 = await recordSwipe(v, b, a, "like");
    const lan2 = await recordSwipe(v, b, a, "like");

    assert.equal(lan1.createdMatch, true);
    assert.equal(lan2.createdMatch, false, "lượt thứ hai KHÔNG được tạo match lần nữa");
  } finally {
    await raw.quit();
  }
});

test("ĐUA hai chiều: đúng MỘT bên được báo là người tạo match", BO_QUA, async () => {
  /*
   * Đây là bài quan trọng nhất trong file, và là bài duy nhất không thể viết
   * bằng con giả.
   *
   * Bắn hai lượt like ngược chiều nhau đi CÙNG LÚC, không await lần lượt. Nếu
   * script Lua không nguyên tử thì kết quả sẽ là 2 (cả hai cùng thấy mình tạo
   * match ⇒ hai thông báo, hai hàng trong bảng `matches`) hoặc 0 (cả hai cùng
   * đọc trước khi bên kia ghi ⇒ hai người thích nhau mà không ai biết).
   *
   * Chạy nhiều cặp để một lần may mắn không qua mặt được bài test: với một
   * cặp, một cài đặt hỏng vẫn có xác suất đáng kể ra đúng.
   */
  const { raw, v } = await moKetNoi();
  try {
    for (let i = 0; i < 40; i++) {
      const [a, b] = capId();
      const [ra, rb] = await Promise.all([
        recordSwipe(v, a, b, "like"),
        recordSwipe(v, b, a, "like"),
      ]);
      const soNguoiTao = Number(ra.createdMatch) + Number(rb.createdMatch);
      assert.equal(
        soNguoiTao,
        1,
        `cặp ${i}: phải có ĐÚNG một bên tạo match, đang có ${soNguoiTao}`,
      );
    }
  } finally {
    await raw.quit();
  }
});

test("pass không ghi gì, nên không bao giờ tạo match", BO_QUA, async () => {
  const { raw, v } = await moKetNoi();
  try {
    const [a, b] = capId();
    const r = await recordSwipe(v, a, b, "pass");
    assert.equal(r.matched, false);
    // Bên kia like sau đó cũng không được match: lượt pass đã không để lại gì.
    const r2 = await recordSwipe(v, b, a, "like");
    assert.equal(r2.matched, false);
  } finally {
    await raw.quit();
  }
});

test("hoàn tác gỡ được like chưa thành match", BO_QUA, async () => {
  const { raw, v } = await moKetNoi();
  try {
    const [a, b] = capId();
    await recordSwipe(v, a, b, "like");
    const u = await undoSwipe(v, a, b);
    assert.equal(u.undone, true);

    // Đã gỡ thật: bên kia like bây giờ vẫn chưa match.
    const r = await recordSwipe(v, b, a, "like");
    assert.equal(r.matched, false, "like cũ phải đã bị xoá khỏi Valkey");
  } finally {
    await raw.quit();
  }
});

test("KHÔNG hoàn tác được sau khi đã match", BO_QUA, async () => {
  /*
   * Match là sự kiện của HAI người. Cho một bên lặng lẽ rút lại nghĩa là người
   * kia đã nhận thông báo, có thể đã mở khung chat, rồi cuộc trò chuyện biến
   * mất mà không có lời giải thích nào. Huỷ kết nối là một hành động khác, có
   * tên khác, và người kia biết được.
   */
  const { raw, v } = await moKetNoi();
  try {
    const [a, b] = capId();
    await recordSwipe(v, a, b, "like");
    await recordSwipe(v, b, a, "like");

    const u = await undoSwipe(v, a, b);
    assert.equal(u.undone, false);
    assert.equal(u.reason, "matched");
  } finally {
    await raw.quit();
  }
});
