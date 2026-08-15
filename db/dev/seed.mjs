#!/usr/bin/env node
/**
 * Nạp hồ sơ DEV vào Postgres.
 *
 * ─── Vì sao SINH tại chỗ chứ không lấy từ randomuser.me ───────────────────
 * Đây là app hẹn hò Việt Nam. Một bộ dữ liệu giả quốc tế cho ra "Emily Johnson,
 * Software Engineer, Sydney" — đúng hình dạng nhưng sai toàn bộ nội dung, và
 * dữ liệu sai kiểu đó làm hỏng chính thứ nó sinh ra để kiểm: chữ Việt có dấu
 * dài hơn, tên có ba phần, quận huyện có ý nghĩa xếp deck. Sinh tại chỗ còn bỏ
 * được một phụ thuộc mạng khỏi bước dựng môi trường.
 *
 * ─── Vì sao import `cellId` thay vì tự tính ───────────────────────────────
 * `s2_cell_l8` là KHOÁ GEOSHARD trên đường nóng. Service dựng shard từ các ô có
 * trong bảng (`loadCellLoads`), rồi `shardsForRadius` chọn shard theo vị trí
 * người xem. Nếu seed tính ô bằng công thức khác `geo.ts`, hai bên nói về hai
 * hệ toạ độ khác nhau: truy vấn chạy, không lỗi, deck luôn rỗng.
 *
 * ─── Dữ liệu là TỔNG HỢP ──────────────────────────────────────────────────
 * Họ tên ghép từ danh sách cố định, SĐT thuộc dải +8490000xxxx không tồn tại,
 * ảnh trỏ picsum.photos theo id, toạ độ rải quanh Hà Nội theo công thức tất
 * định. Không có gì ở đây là người thật.
 *
 * Dùng:
 *   node db/dev/seed.mjs "postgresql://datting@127.0.0.1:5432/datting" 300
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
const count = Number(process.argv[3] ?? 300);
if (!url) {
  console.error("dùng: node db/dev/seed.mjs <DATABASE_URL> [số hồ sơ]");
  process.exit(1);
}

/** Tất định: hai lần chạy cho cùng một bộ dữ liệu, nên bug tái hiện được. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------------------------------------- danh xưng
 * Tên Việt có BA phần: họ + đệm + tên gọi. Ghép đủ ba phần chứ không chỉ tên
 * gọi, vì độ dài chuỗi là thứ làm vỡ bố cục — "Nguyễn Thị Khánh Huyền" dài gấp
 * ba "Linh", và thẻ vuốt phải chịu được cả hai.
 */
const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ",
  "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"];
const DEM_NU = ["Thị", "Ngọc", "Thu", "Minh", "Thanh", "Phương", "Hoài", "Bảo", "Khánh", "Diệu"];
const DEM_NAM = ["Văn", "Hữu", "Đức", "Quang", "Minh", "Trung", "Anh", "Bá", "Xuân", "Tiến"];
const TEN_NU = ["Linh", "Trang", "Ngọc", "Hà", "Mai", "Thu", "Vy", "Anh", "Quỳnh", "Hương",
  "Chi", "Nhung", "Thảo", "Yến", "Trâm", "Ly", "Hằng", "Uyên", "Nga", "Loan"];
const TEN_NAM = ["Nam", "Minh", "Khoa", "Tuấn", "Duy", "Sơn", "Hải", "Long", "Phong", "Bình",
  "Đạt", "Hùng", "Kiên", "Thắng", "Trung", "Việt", "Dũng", "Cường", "Quân", "Hoàng"];

const QUAN = ["Cầu Giấy", "Ba Đình", "Đống Đa", "Hai Bà Trưng", "Thanh Xuân",
  "Tây Hồ", "Hoàn Kiếm", "Long Biên", "Nam Từ Liêm", "Hà Đông"];

const NGHE = ["Lập trình viên", "Nhân viên marketing", "Giáo viên tiếng Anh", "Kế toán",
  "Thiết kế đồ hoạ", "Kiến trúc sư", "Điều dưỡng", "Hướng dẫn viên du lịch",
  "Nhân viên ngân hàng", "Barista", "Nhiếp ảnh gia", "Biên tập viên",
  "Kỹ sư xây dựng", "Dược sĩ", "Huấn luyện viên thể hình", "Chủ quán cà phê",
  "Nhân viên kinh doanh", "Bác sĩ thú y", "Phiên dịch", "Học viên cao học"];

const SO_THICH = ["Chạy bộ", "Cà phê", "Đọc sách", "Nghe nhạc", "Du lịch", "Nấu ăn",
  "Gym", "Chụp ảnh", "Xem phim", "Yoga", "Leo núi", "Đạp xe", "Cầu lông",
  "Boardgame", "Vẽ", "Làm bánh", "Bơi", "Guitar"];
const LOI_SONG = ["Dậy sớm", "Thức khuya", "Không hút thuốc", "Thỉnh thoảng uống",
  "Nuôi thú cưng", "Ăn chay", "Tập đều", "Ở một mình"];
const Y_DINH = ["Hẹn hò nghiêm túc", "Tìm hiểu từ từ", "Kết bạn trước"];

/**
 * Câu giới thiệu ghép từ CHÍNH sở thích và nghề của hồ sơ đó.
 *
 * Câu rời rạc kiểu "Xin chào, rất vui được làm quen" đọc như spam và không thử
 * được gì; câu có nội dung riêng mới cho thấy bố cục vỡ ở đâu khi chữ dài.
 */
function bio(rnd, { nghe, soThich, quan, yDinh }) {
  const mau = [
    `${nghe}. Cuối tuần thường ${soThich[0].toLowerCase()} quanh ${quan}. ${yDinh}.`,
    `Đang làm ${nghe.toLowerCase()}. Mê ${soThich.slice(0, 2).join(" và ").toLowerCase()}. Tìm người hợp gu để đi cà phê.`,
    `${soThich[0]} là cách mình xả stress sau giờ làm. ${yDinh}, không vội.`,
    `${nghe} ở ${quan}. Không giỏi nói về bản thân — cứ nhắn rồi biết.`,
    `Thích ${soThich.join(", ").toLowerCase()}. Ưu tiên gặp ngoài đời hơn nhắn tin hàng tháng.`,
  ];
  return mau[Math.floor(rnd() * mau.length)];
}

const pool = new Pool({ connectionString: url });
const rnd = mulberry32(20260815);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const pickN = (xs, n) => {
  const out = new Set();
  while (out.size < Math.min(n, xs.length)) out.add(pick(xs));
  return [...out];
};

const client = await pool.connect();
try {
  await client.query("BEGIN");
  // Chạy lại được nhiều lần. CASCADE vì profiles/photos/preferences đều tham
  // chiếu users.
  await client.query("TRUNCATE users CASCADE");

  let anhChoDuyet = 0;

  for (let i = 1; i <= count; i++) {
    // Snowflake-ish: 19 chữ số, VƯỢT 2^53. Cố ý — chứng minh tầng kết nối giữ
    // đúng độ chính xác BIGINT chứ không đi qua Number().
    const id = (7301234567890000000n + BigInt(i)).toString();

    const nu = i % 2 === 0;
    const gender = nu ? 2 : 1;
    const hoTen = `${pick(HO)} ${pick(nu ? DEM_NU : DEM_NAM)} ${pick(nu ? TEN_NU : TEN_NAM)}`;

    const lat = 21.0 + (i % 40) * 0.01;
    const lng = 105.8 + (i % 37) * 0.01;
    const loc = { lat, lng };
    // S2 cell id là 64-bit KHÔNG DẤU, cột BIGINT là CÓ DẤU. Xem cellToDb.
    const cell8 = cellToDb(cellId(loc, 8));
    const cell12 = cellToDb(cellId(loc, 12));

    // Tuổi dồn về 22–32 rồi thưa dần tới 45: gần phân bố thật của người dùng
    // dating app, và nhờ vậy bộ lọc tuổi mới có gì để lọc.
    const tuoi = 22 + Math.floor(Math.pow(rnd(), 1.9) * 24);
    const birth = new Date(Date.UTC(2026 - tuoi, i % 12, 1 + (i % 27)))
      .toISOString()
      .slice(0, 10);

    const quan = pick(QUAN);
    const nghe = pick(NGHE);
    const soThich = pickN(SO_THICH, 3 + Math.floor(rnd() * 3));
    const loiSong = pickN(LOI_SONG, 2 + Math.floor(rnd() * 2));
    const yDinh = pickN(Y_DINH, 1 + Math.floor(rnd() * 2));
    const gioiThieu = bio(rnd, { nghe, soThich, quan, yDinh: yDinh[0] });

    const emb = Array.from({ length: 8 }, (_, k) => Math.sin(i * (k + 1) * 0.37));
    const norm = Math.hypot(...emb);

    // 3–6 ảnh. Ảnh vị trí 0 LUÔN đã duyệt, vì truy vấn ứng viên đòi ít nhất một
    // ảnh duyệt — không có thì hồ sơ biến mất khỏi deck và rất mất công truy.
    const soAnh = 3 + Math.floor(rnd() * 4);
    const daXacMinh = rnd() < 0.35;
    const hoanThien = Math.min(100, 45 + soAnh * 6 + soThich.length * 3 + (gioiThieu ? 12 : 0));

    await client.query(
      `INSERT INTO users (user_id, phone_e164, status, created_at, last_active_at)
       VALUES ($1::bigint, $2, 0,
               now() - ($3 || ' days')::interval,
               now() - ($4 || ' hours')::interval)`,
      [
        id,
        `+8490000${String(i).padStart(4, "0")}`,
        String(i % 60),
        // Hoạt động gần đây dồn về vài giờ qua, đuôi kéo tới 2 tuần —
        // `daysSinceActive` là đầu vào của ranking nên nó phải có độ tản.
        String(Math.floor(Math.pow(rnd(), 2) * 336)),
      ],
    );

    await client.query(
      `INSERT INTO profiles
         (user_id, display_name, birth_date, gender, bio, community, job_title,
          lifestyle, interests, intent, completeness, verified_photo,
          geo, s2_cell_l8, s2_cell_l12, embedding)
       VALUES ($1::bigint, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               ST_MakePoint($13, $14)::geography, $15::bigint, $16::bigint, $17::real[])`,
      [
        id, hoTen, birth, gender, gioiThieu, quan, nghe,
        loiSong, soThich, yDinh, hoanThien, daXacMinh,
        lng, lat, cell8, cell12, emb.map((v) => v / norm),
      ],
    );

    await client.query(
      `INSERT INTO preferences
         (user_id, want_genders, age_min, age_max, max_distance_km, interest_tags)
       VALUES ($1::bigint, $2, $3, $4, $5, $6)`,
      [
        id,
        // Đa số tìm giới còn lại; một phần tìm cả hai. Trường này SUY RA được
        // xu hướng tính dục (NĐ13) nên nó phải có độ tản thật để bộ lọc và
        // đường xử lý dữ liệu nhạy cảm được thử đúng.
        rnd() < 0.12 ? [1, 2] : [nu ? 1 : 2],
        Math.max(18, tuoi - 4 - Math.floor(rnd() * 4)),
        tuoi + 3 + Math.floor(rnd() * 8),
        [5, 10, 25, 50, 100][Math.floor(rnd() * 5)],
        pickN(soThich, 2),
      ],
    );

    for (let p = 0; p < soAnh; p++) {
      // Vị trí 0 luôn duyệt; các ảnh sau ~12% còn chờ, để hàng đợi kiểm duyệt
      // có việc thật mà xử lý.
      const choDuyet = p > 0 && rnd() < 0.12;
      if (choDuyet) anhChoDuyet++;
      await client.query(
        `INSERT INTO photos (photo_id, user_id, position, cdn_key, blurhash, moderation, moderated_at)
         VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7)`,
        [
          // KHÔNG suy ra từ user_id: Snowflake đã ≈7,3·10^18, nhân 10 là vượt
          // max BIGINT (9,22·10^18) — đúng cái bẫy đã gặp với ô S2. photo_id
          // chỉ cần DUY NHẤT, không cần mã hoá chủ sở hữu.
          String(i * 10 + p),
          id,
          p,
          `https://picsum.photos/seed/${i}${p}/720/1080`,
          "L6PZfSi_.AyE_3t7t7R**0o#DgR4",
          choDuyet ? 0 : 1,
          choDuyet ? null : new Date().toISOString(),
        ],
      );
    }
  }

  await client.query("COMMIT");
  console.log(
    `đã nạp ${count} hồ sơ — họ tên đủ ba phần, nghề, giới thiệu, 3–6 ảnh mỗi người.\n` +
      `${anhChoDuyet} ảnh còn chờ duyệt (moderation=0) để hàng đợi kiểm duyệt có việc thật.`,
  );
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
