#!/usr/bin/env node
/**
 * Nạp dữ liệu DEV vào Postgres.
 *
 * ─── Vì sao import `cellId` thay vì tự tính ───────────────────────────────
 * `s2_cell_l8` là KHOÁ GEOSHARD trên đường nóng. Service dựng shard từ các ô có
 * trong bảng (`loadCellLoads`), rồi `shardsForRadius` chọn shard theo vị trí
 * người xem. Nếu seed tính ô bằng một công thức khác với `geo.ts`, hai bên sẽ
 * nói về hai hệ toạ độ khác nhau: truy vấn chạy, không lỗi, và deck luôn rỗng.
 * Nên script này dùng ĐÚNG hàm đã biên dịch của service.
 *
 * ─── Dữ liệu là TỔNG HỢP ──────────────────────────────────────────────────
 * Tên lấy từ danh sách cố định, SĐT thuộc dải +8490000xxxx không tồn tại, toạ
 * độ rải quanh Hà Nội theo công thức tất định. Không có gì ở đây là người thật.
 *
 * Mỗi hồ sơ có đúng một ảnh `moderation = 1`: truy vấn ứng viên ĐÒI ít nhất một
 * ảnh đã duyệt, nên seed thiếu ảnh duyệt sẽ cho deck rỗng — lỗi rất mất thời
 * gian để tìm nếu không biết trước.
 *
 * Dùng:
 *   node db/dev/seed.mjs "postgresql://datting@127.0.0.1:5432/datting" 200
 */
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const svc = join(here, "..", "..", "services", "match-service");
const require = createRequire(join(svc, "package.json"));
const { Pool } = require("pg");
const { cellId } = await import(pathToFileURL(join(svc, "dist", "src", "geo.js")).href);
const { cellToDb } = await import(pathToFileURL(join(svc, "dist", "src", "candidateSql.js")).href);

const url = process.argv[2] ?? process.env["DATABASE_URL"];
const count = Number(process.argv[3] ?? 200);
if (!url) {
  console.error("dùng: node db/dev/seed.mjs <DATABASE_URL> [số hồ sơ]");
  process.exit(1);
}

/** Cùng bộ sinh tất định với DemoApi — hai bên so sánh được với nhau. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["Linh", "Trang", "Ngọc", "Hà", "Mai", "Thu", "Vy", "Anh", "Quỳnh", "Hương",
  "Nam", "Minh", "Khoa", "Tuấn", "Duy", "Sơn", "Hải", "Long", "Phong", "Bình"];
const AREAS = ["Cầu Giấy", "Ba Đình", "Đống Đa", "Hai Bà Trưng", "Thanh Xuân", "Tây Hồ"];
const TOPICS = ["Chạy bộ", "Cà phê", "Đọc sách", "Nghe nhạc", "Du lịch", "Nấu ăn", "Gym",
  "Chụp ảnh", "Xem phim", "Yoga", "Leo núi", "Đạp xe"];
const LIFESTYLE = ["Dậy sớm", "Không hút thuốc", "Nuôi thú cưng", "Ăn chay", "Thức khuya"];
const INTENTS = ["Hẹn hò nghiêm túc", "Tìm hiểu từ từ", "Kết bạn trước"];

const pool = new Pool({ connectionString: url });
const rnd = mulberry32(20260815);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];

const client = await pool.connect();
try {
  await client.query("BEGIN");
  // Dọn trước: script chạy lại được nhiều lần. CASCADE vì profiles/photos/
  // preferences đều tham chiếu users.
  await client.query("TRUNCATE users CASCADE");

  for (let i = 1; i <= count; i++) {
    // Snowflake-ish: 19 chữ số, VƯỢT 2^53. Cố ý — đây là thứ chứng minh tầng
    // kết nối giữ đúng độ chính xác BIGINT chứ không đi qua Number().
    const id = (7301234567890000000n + BigInt(i)).toString();
    const lat = 21.0 + (i % 40) * 0.01;
    const lng = 105.8 + (i % 37) * 0.01;
    const loc = { lat, lng };
    // S2 cell id là 64-bit KHÔNG DẤU, cột BIGINT là CÓ DẤU. Xem cellToDb.
    const cell8 = cellToDb(cellId(loc, 8));
    const cell12 = cellToDb(cellId(loc, 12));
    const age = 20 + Math.floor(rnd() * 15);
    const birth = new Date(Date.UTC(2026 - age, i % 12, 1 + (i % 27)))
      .toISOString()
      .slice(0, 10);
    const interests = [...new Set([pick(TOPICS), pick(TOPICS), pick(TOPICS)])];
    const emb = Array.from({ length: 8 }, (_, k) => Math.sin(i * (k + 1) * 0.37));
    const norm = Math.hypot(...emb);

    await client.query(
      `INSERT INTO users (user_id, phone_e164, status, created_at, last_active_at)
       VALUES ($1::bigint, $2, 0, now() - ($3 || ' days')::interval, now() - ($4 || ' days')::interval)`,
      [id, `+8490000${String(i).padStart(4, "0")}`, String(i % 30), String(i % 14)],
    );

    await client.query(
      `INSERT INTO profiles
         (user_id, display_name, birth_date, gender, community, lifestyle, interests, intent,
          completeness, verified_photo, geo, s2_cell_l8, s2_cell_l12, embedding)
       VALUES ($1::bigint, $2, $3::date, $4, $5, $6, $7, $8, $9, $10,
               ST_MakePoint($11, $12)::geography, $13::bigint, $14::bigint, $15::real[])`,
      [
        id, pick(NAMES), birth, (i % 2) + 1, pick(AREAS),
        [pick(LIFESTYLE), pick(LIFESTYLE)], interests, INTENTS.slice(0, (i % 3) + 1),
        60 + (i % 40), i % 3 === 0,
        lng, lat, cell8, cell12, emb.map((v) => v / norm),
      ],
    );

    await client.query(
      `INSERT INTO preferences (user_id, want_genders, age_min, age_max, max_distance_km)
       VALUES ($1::bigint, $2, 18, 99, 50)`,
      [id, [1, 2]],
    );

    // moderation = 1 (đã duyệt). Truy vấn ứng viên ĐÒI điều này.
    await client.query(
      `INSERT INTO photos (photo_id, user_id, position, cdn_key, moderation, moderated_at)
       VALUES ($1::bigint, $2::bigint, 0, $3, 1, now())`,
      [id, id, `seed/${i}.jpg`],
    );
  }

  await client.query("COMMIT");
  console.log(`đã nạp ${count} hồ sơ (mỗi hồ sơ 1 ảnh đã duyệt, 1 hàng preferences)`);
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
