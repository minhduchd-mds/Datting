// Đuôi `.ts` chứ không phải `.js` — file này KHÔNG đi qua tsc, nó được Node
// chạy thẳng bằng type-stripping (`--experimental-strip-types`). Quy ước `.js`
// của repo đúng cho mã đã build; ở đây `db.js` chưa tồn tại lúc chạy.
import { pool } from "./db.ts";
// Dùng lại đúng bộ 30 hồ sơ tổng hợp của bản web thay vì bịa bộ thứ hai: hai bộ
// dữ liệu mẫu là hai bộ sẽ lệch nhau, và khi đó không phân biệt được lỗi thật
// với lệch dữ liệu. Import xuyên package chỉ chấp nhận được vì đây là script
// nạp dữ liệu DEV, không phải mã chạy trong service.
import { PROFILES } from "../../../apps/web/src/data/profiles.ts";

/**
 * Nạp dữ liệu dev vào CSDL THẬT.
 *
 * Idempotent: chạy lại không nhân đôi. Mọi id do ứng dụng sinh vì không bảng nào
 * trong `0001_init.sql` có cột tự tăng.
 *
 * Người dùng số 1 là "tôi" — khớp `ME_ID` phía web và `ME` trong `server.ts`.
 */

const ME = 1;

/** `birth_date` là cột thật; tuổi là giá trị DẪN XUẤT. Lưu ngày sinh, không lưu tuổi. */
function birthDateFor(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // ── người dùng "tôi" ────────────────────────────────────────────────
    await c.query(
      `INSERT INTO users (user_id, phone_e164, status) VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [ME, "+84900000001"],
    );
    await c.query(
      `INSERT INTO profiles (user_id, display_name, birth_date, gender, bio, community,
                             job_title, lifestyle, interests, intent, completeness,
                             verified_photo, s2_cell_l8, s2_cell_l12)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (user_id) DO NOTHING`,
      [ME, "Đỗ Minh Đức", birthDateFor(28), 0,
       "Thích những cuộc trò chuyện đi xa hơn câu chào.",
       "Cầu Giấy", "Kỹ sư phần mềm", ["Dậy sớm"],
       ["Cầu lông", "Chạy bộ", "Cà phê"], ["Hẹn hò nghiêm túc"], 70, true, 1000, 1000],
    );

    // ── 30 hồ sơ ────────────────────────────────────────────────────────
    let matches = 0;
    for (const p of PROFILES) {
      const uid = Number(p.userId);

      await c.query(
        `INSERT INTO users (user_id, phone_e164, status) VALUES ($1, $2, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [uid, `+849${String(uid).padStart(8, "0")}`],
      );

      await c.query(
        `INSERT INTO profiles (user_id, display_name, birth_date, gender, bio, community,
                               job_title, lifestyle, interests, intent, completeness,
                               verified_photo, s2_cell_l8, s2_cell_l12)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (user_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           community    = EXCLUDED.community,
           job_title    = EXCLUDED.job_title,
           interests    = EXCLUDED.interests,
           updated_at   = now()`,
        [uid, p.name, birthDateFor(p.age), p.gender, p.bio, p.community, p.jobTitle,
         p.lifestyle, p.interests, [p.intent], 60 + (uid % 40), p.verified,
         1000 + (uid % 8), 100000 + uid],
      );

      // Ảnh ĐÃ DUYỆT (`moderation = 1`) — ảnh chưa duyệt không hiển thị công
      // khai, đó là ràng buộc chặn của cả sản phẩm chứ không phải cờ trang trí.
      await c.query(
        `INSERT INTO photos (photo_id, user_id, position, cdn_key, moderation, moderated_at)
              VALUES ($1, $2, 0, $3, 1, now())
         ON CONFLICT (user_id, position) DO UPDATE SET cdn_key = EXCLUDED.cdn_key`,
        [uid * 10, uid, p.photoUrl],
      );

      // ── thư viện ảnh ────────────────────────────────────────────────
      // `photos` đã đỡ được tối đa 6 ảnh/người từ 0001 (`position 0..5`,
      // UNIQUE(user_id, position)) — chỉ là chưa ai nạp quá một tấm.
      //
      // Tấm cuối CỐ Ý để `moderation = 0` (chờ duyệt) ở một phần người dùng:
      // nhờ vậy nhìn thấy được ngay rằng ảnh chưa duyệt KHÔNG lọt ra công khai.
      // Một bộ dữ liệu mẫu toàn ảnh đã duyệt sẽ không bao giờ chứng minh được
      // cái hàng rào đó có hoạt động hay không.
      const soAnh = 2 + (uid % 3); // 2..4 tấm
      for (let pos = 1; pos < soAnh; pos++) {
        const choDuyet = pos === soAnh - 1 && uid % 3 === 0;
        await c.query(
          `INSERT INTO photos (photo_id, user_id, position, cdn_key, moderation, moderated_at)
                VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, position) DO UPDATE
                  SET cdn_key = EXCLUDED.cdn_key, moderation = EXCLUDED.moderation`,
          [uid * 10 + pos, uid, pos, `${p.photoUrl}&v=${pos}`,
           choDuyet ? 0 : 1, choDuyet ? null : new Date()],
        );
      }

      // ── liên kết mạng xã hội ────────────────────────────────────────
      // `visibility = 1` (chỉ sau khi kết nối) cho tất cả — đó là mặc định an
      // toàn, và cũng là thứ cần có dữ liệu để kiểm được rào ở service.
      if (uid % 2 === 0) {
        const handle = p.name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/đ/g, "d")
          .split(" ")
          .slice(-2)
          .join(".");
        for (const platform of [0, 1]) {
          await c.query(
            `INSERT INTO profile_links (user_id, platform, handle, visibility)
                  VALUES ($1, $2, $3, 1)
             ON CONFLICT (user_id, platform) DO UPDATE SET handle = EXCLUDED.handle`,
            [uid, platform, handle],
          );
        }
      }

      // Kết nối cho những người `id % 4 == 0` — khớp đúng quy tắc match tất định
      // trong `server.ts`, nên bấm "kết nối" ở deck cho ra cùng kết quả.
      if (uid % 4 === 0) {
        const a = Math.min(ME, uid);
        const b = Math.max(ME, uid);
        await c.query(
          `INSERT INTO matches (pair_key, user_a, user_b) VALUES ($1, $2, $3)
           ON CONFLICT (pair_key) DO NOTHING`,
          [`${a}:${b}`, a, b],
        );
        matches++;
      }
    }

    // ── lượt thích đến (màn "Chờ") ──────────────────────────────────────
    // Người `id % 4 == 1` đã thích tôi mà tôi chưa quyết. Cố ý KHÔNG trùng với
    // tập match (`% 4 == 0`): một người vừa đang chờ vừa đã kết nối là mâu
    // thuẫn trạng thái, và đó đúng là loại lỗi mà dữ liệu mẫu cẩu thả sinh ra.
    let likes = 0;
    for (const p of PROFILES) {
      const uid = Number(p.userId);
      if (uid % 4 !== 1) continue;
      const kind = uid % 3; // 0 hồ sơ · 1 ảnh · 2 câu trả lời
      const label =
        kind === 1
          ? "Ảnh thứ nhất của bạn"
          : kind === 2
            ? "Câu trả lời của bạn"
            : "Hồ sơ của bạn";
      await c.query(
        `INSERT INTO incoming_likes (to_user_id, from_user_id, liked_kind, liked_label)
              VALUES ($1, $2, $3, $4)
         ON CONFLICT (to_user_id, from_user_id) DO NOTHING`,
        [ME, uid, kind, label],
      );
      likes++;
    }

    // ── giới thiệu (màn "Giới thiệu") ───────────────────────────────────
    // Người `id % 4 == 2` được một người khác giới thiệu cho tôi.
    let intros = 0;
    for (const p of PROFILES) {
      const uid = Number(p.userId);
      if (uid % 4 !== 2) continue;
      // Người giới thiệu là một hồ sơ KHÁC trong bộ — không phải tôi, không
      // phải chính người được giới thiệu.
      const introducer = 2001 + ((uid + 3) % PROFILES.length);
      if (introducer === uid) continue;
      await c.query(
        `INSERT INTO introductions (intro_id, introducer_id, subject_id, target_id, note, status)
              VALUES ($1, $2, $3, $4, $5, 0)
         ON CONFLICT (intro_id) DO NOTHING`,
        [uid * 100, introducer, uid, ME, `Hai bạn cùng thích ${p.interests[0] ?? "đi cà phê"}.`],
      );
      intros++;
    }

    await c.query("COMMIT");
    console.log(
      `nạp xong: 1 + ${PROFILES.length} người dùng, ${matches} kết nối, ` +
        `${likes} lượt thích đang chờ, ${intros} lời giới thiệu`,
    );
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

await main();
