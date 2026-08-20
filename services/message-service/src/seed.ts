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

    await c.query("COMMIT");
    console.log(`nạp xong: 1 + ${PROFILES.length} người dùng, ${matches} kết nối`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

await main();
