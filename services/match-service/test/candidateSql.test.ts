import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCandidateQuery,
  rowToUserVector,
  rowToPreferences,
  effectiveMaxDistanceKm,
  parseVector,
  birthDateRange,
  cellToDb,
  cellFromDb,
  buildProfileQuery,
  MAX_PROFILES,
  DEFAULT_PREFS,
  type CandidateRow,
} from "../src/candidateSql.js";

/* ===========================================================================
 * Tầng kết nối Postgres — phần THUẦN TUÝ.
 *
 * Chỗ này test được vì nó không mở kết nối nào: dựng câu SQL và đổi hàng thành
 * UserVector đều là hàm nhận giá trị, trả giá trị. Phần còn lại (pg.Pool) mỏng
 * đúng vài dòng — đẩy logic ra khỏi vỏ I/O chính là để phần KHÔNG test được co
 * lại nhỏ nhất có thể.
 * =========================================================================== */

const CELLS = [111n, 222n];

/* ------------------------------------------------------------- dựng câu SQL */

test("truy vấn lọc theo đúng danh sách ô S2 được truyền vào", () => {
  const q = buildCandidateQuery(CELLS, { viewerId: 1n }, 100);
  assert.match(q!.text, /s2_cell_l8 = ANY/);
  assert.deepEqual(q!.values[0], ["111", "222"], "bigint phải thành chuỗi, pg không nhận BigInt");
});

/* ---------------------------------------------------------------- ô S2 ↔ BIGINT */

test("ô S2 vượt max BIGINT vẫn ghi được — đây là ô THẬT của Hà Nội", () => {
  // cellId({lat:21.01, lng:105.81}, 8) trả đúng giá trị này. Nó LỚN HƠN
  // 9223372036854775807 (max BIGINT có dấu), nên ghi thẳng là
  // "ERROR: value out of range for type bigint" — hơn nửa số ô S2 hợp lệ
  // không lưu được, và chỉ lộ ra khi thật sự INSERT.
  const hanoi = 9223372036854829799n;
  assert.ok(hanoi > 9223372036854775807n, "tiền đề: ô này vượt max BIGINT");
  const stored = cellToDb(hanoi);
  assert.ok(stored.startsWith("-"), "phải thành số âm khi đọc theo kiểu có dấu");
  assert.equal(cellFromDb(stored), hanoi, "vòng đi–về phải khít tuyệt đối");
});

test("ô S2 nhỏ hơn 2^63 đi qua không đổi", () => {
  assert.equal(cellToDb(111n), "111");
  assert.equal(cellFromDb("111"), 111n);
});

test("ô S2 level 12 (gần 2^64) cũng khít", () => {
  const l12 = 13835058055295985581n;
  assert.equal(cellFromDb(cellToDb(l12)), l12);
});

test("truy vấn đổi ô sang dạng có dấu trước khi gửi xuống Postgres", () => {
  const q = buildCandidateQuery([9223372036854829799n], { viewerId: 1n }, 100);
  assert.deepEqual(q!.values[0], ["-9223372036854721817"]);
});

test("không có ô nào thì KHÔNG dựng truy vấn — trả null để người gọi thoát sớm", () => {
  assert.equal(buildCandidateQuery([], { viewerId: 1n }, 100), null);
});

test("luôn loại người đã xoá, bị khoá, và chính người đang xem", () => {
  const q = buildCandidateQuery(CELLS, { viewerId: 42n }, 100);
  assert.match(q!.text, /u\.status = 0/);
  assert.match(q!.text, /u\.deleted_at IS NULL/);
  assert.match(q!.text, /u\.user_id <> /);
  assert.ok(q!.values.includes("42"), "id người xem phải đi vào tham số");
});

test("luôn đòi có ít nhất một ảnh ĐÃ DUYỆT", () => {
  const q = buildCandidateQuery(CELLS, { viewerId: 1n }, 100);
  // Ảnh chưa duyệt không hiển thị công khai. Nếu không lọc ở đây, thẻ vẫn bị
  // bỏ lúc hydrate hồ sơ — deck 30 thẻ về tay người dùng còn 11 cái.
  assert.match(q!.text, /moderation = 1/);
});

test("người bị chặn (hai chiều) không bao giờ vào deck", () => {
  const q = buildCandidateQuery(CELLS, { viewerId: 7n }, 100);
  assert.match(q!.text, /blocks/);
});

test("không khai giới tính mong muốn thì KHÔNG thêm điều kiện giới tính", () => {
  const q = buildCandidateQuery(CELLS, { viewerId: 1n }, 100);
  assert.doesNotMatch(q!.text, /p\.gender/);
});

test("có khai giới tính mong muốn thì lọc theo mảng đó", () => {
  const q = buildCandidateQuery(CELLS, { viewerId: 1n, wantGenders: [1, 2] }, 100);
  assert.match(q!.text, /p\.gender = ANY/);
  assert.ok(q!.values.some((v) => Array.isArray(v) && v.length === 2 && v[0] === 1));
});

test("limit bị chặn trên — một uid bịa ra không kéo được cả bảng về", () => {
  const q = buildCandidateQuery(CELLS, { viewerId: 1n }, 10_000_000);
  assert.ok(q!.values.includes(2000), `limit phải bị kẹp, nhận được ${String(q!.values)}`);
});

test("chỉ lọc khoảng cách khi BIẾT vị trí người xem", () => {
  const khong = buildCandidateQuery(CELLS, { viewerId: 1n, maxDistanceKm: 25 }, 100);
  assert.doesNotMatch(khong!.text, /ST_DWithin/, "không có toạ độ thì không có gì để đo");

  const co = buildCandidateQuery(
    CELLS,
    { viewerId: 1n, maxDistanceKm: 25, viewerLoc: { lat: 21.0, lng: 105.8 } },
    100,
  );
  assert.match(co!.text, /ST_DWithin/);
  assert.ok(co!.values.includes(25_000), "PostGIS geography đo bằng MÉT, không phải km");
});

/* ------------------------------------------------ tuổi ↔ ngày sinh (đảo chiều) */

test("tuổi LỚN NHẤT cho ra ngày sinh SỚM NHẤT — quan hệ đảo chiều", () => {
  // Đây là chỗ dễ sai nhất cả file: age_max = 40 nghĩa là "sinh SAU" mốc 40 năm
  // trước, tức birth_date >= mốc đó. Viết xuôi tay là lọc ngược, và không có gì
  // sập — chỉ là deck toàn người ngoài khoảng tuổi.
  const today = new Date("2026-08-15T00:00:00Z");
  const r = birthDateRange(25, 40, today);
  assert.ok(r.earliest < r.latest, "sinh sớm nhất phải trước sinh muộn nhất");
  assert.equal(r.earliest, "1986-08-15", "40 tuổi ⇒ sinh sớm nhất là 40 năm trước");
  assert.equal(r.latest, "2001-08-15", "25 tuổi ⇒ sinh muộn nhất là 25 năm trước");
});

test("khoảng tuổi đi vào truy vấn dưới dạng ngày sinh, không phải số tuổi", () => {
  const q = buildCandidateQuery(CELLS, { viewerId: 1n, ageMin: 25, ageMax: 40 }, 100);
  assert.match(q!.text, /birth_date/);
  assert.doesNotMatch(
    q!.text,
    /EXTRACT\(YEAR/,
    "đừng tính tuổi trong WHERE — index trên birth_date sẽ thành vô dụng",
  );
});

/* ------------------------------------------------------------ parse embedding */

test("pgvector trả về CHUỖI, phải parse chứ không dùng thẳng", () => {
  assert.deepEqual(parseVector("[0.1,-0.2,0.3]"), [0.1, -0.2, 0.3]);
});

test("embedding rỗng hoặc null cho ra mảng rỗng, không ném lỗi", () => {
  assert.deepEqual(parseVector(null), []);
  assert.deepEqual(parseVector(""), []);
  assert.deepEqual(parseVector("[]"), []);
});

test("embedding đã là mảng thì giữ nguyên (driver có thể đã đăng ký parser)", () => {
  assert.deepEqual(parseVector([1, 2]), [1, 2]);
});

test("real[] in ra {..} chứ không [..] — parse được CẢ HAI", () => {
  // Schema dev (db/dev/no-vector.mjs) đổi embedding sang real[] vì máy này không
  // cài được pgvector. Hai kiểu cột in ra hai định dạng text khác nhau, và nếu
  // parser chỉ biết một kiểu thì mọi embedding ở dev thành NaN — im lặng, vì
  // ranking vẫn chạy và chỉ cho ra điểm sai.
  assert.deepEqual(parseVector("{0.5,-0.25}"), [0.5, -0.25]);
  assert.deepEqual(parseVector("{}"), []);
});

/* ------------------------------------------------------------- đổi hàng → vector */

const ROW: CandidateRow = {
  // Snowflake ID thật: 19 chữ số, VƯỢT Number.MAX_SAFE_INTEGER.
  user_id: "7301234567890123456",
  embedding: "[0.5,0.5]",
  interests: ["Cà phê"],
  lifestyle: ["Dậy sớm"],
  intent: ["Hẹn hò nghiêm túc"],
  community: "Cầu Giấy",
  lat: 21.03,
  lng: 105.8,
  days_since_active: 3,
  is_new_user: false,
};

test("user_id giữ nguyên độ chính xác — Number() sẽ làm hỏng Snowflake ID", () => {
  const u = rowToUserVector(ROW, 0);
  assert.equal(u.userId, 7301234567890123456n);
  assert.ok(
    !Number.isSafeInteger(Number(ROW.user_id)),
    "tiền đề của test: id này thật sự vượt 2^53, nên Number() mất chính xác",
  );
});

test("community null thành chuỗi rỗng, không thành 'null'", () => {
  const u = rowToUserVector({ ...ROW, community: null }, 0);
  assert.equal(u.community, "");
});

test("thiếu toạ độ thì loc là 0,0 — và đó là lý do lọc khoảng cách phải chạy ở SQL", () => {
  const u = rowToUserVector({ ...ROW, lat: null, lng: null }, 0);
  assert.deepEqual(u.loc, { lat: 0, lng: 0 });
});

test("impressionsToday đến từ NGOÀI hàng — Postgres không giữ con số đó", () => {
  // Bộ đếm hiển thị/ngày nằm ở Valkey; bảng `profiles` không có cột này. Truyền
  // vào chứ không bịa 0 âm thầm: 0 nghĩa là "chưa ai thấy hôm nay", và đó là
  // đầu vào tắt cơ chế chặn "vua sắc đẹp" trong ranking.
  assert.equal(rowToUserVector(ROW, 137).impressionsToday, 137);
});

test("mảng TEXT[] rỗng từ Postgres không thành undefined", () => {
  const u = rowToUserVector({ ...ROW, interests: [], lifestyle: [], intent: [] }, 0);
  assert.deepEqual(u.interests, []);
  assert.deepEqual(u.lifestyle, []);
  assert.deepEqual(u.intent, []);
});

/* ------------------------------------------------------------ tiêu chí kết nối */

test("chưa có hàng preferences thì dùng mặc định, không nổ", () => {
  // Người vừa đăng ký xong có `users` + `profiles` nhưng chưa chắc có
  // `preferences` — LEFT JOIN trả null cho cả bốn cột.
  assert.deepEqual(rowToPreferences(null), DEFAULT_PREFS);
  assert.deepEqual(rowToPreferences({}), DEFAULT_PREFS);
});

test("preferences đọc đủ bốn trường từ hàng", () => {
  const p = rowToPreferences({
    want_genders: [2],
    age_min: 24,
    age_max: 33,
    max_distance_km: 15,
  });
  assert.deepEqual(p, { wantGenders: [2], ageMin: 24, ageMax: 33, maxDistanceKm: 15 });
});

test("want_genders null thành mảng rỗng — nghĩa là KHÔNG lọc, không phải lọc rỗng", () => {
  // Khác biệt này quan trọng: [] ⇒ buildCandidateQuery bỏ hẳn điều kiện giới
  // tính. Nếu hiểu nhầm thành "lọc theo tập rỗng" thì deck luôn trống.
  assert.deepEqual(rowToPreferences({ want_genders: null }).wantGenders, []);
});

test("client THU HẸP được bán kính nhưng KHÔNG nới rộng", () => {
  assert.equal(effectiveMaxDistanceKm(50, 10), 10, "thu hẹp: nghe theo client");
  assert.equal(effectiveMaxDistanceKm(50, 500), 50, "nới rộng: giữ theo cài đặt của người dùng");
  assert.equal(effectiveMaxDistanceKm(50, undefined), 50, "không khai: dùng cài đặt");
});

test("bán kính client gửi rác không làm hỏng bộ lọc", () => {
  assert.equal(effectiveMaxDistanceKm(50, Number.NaN), 50);
  assert.equal(effectiveMaxDistanceKm(50, -5), 1, "âm bị kẹp về sàn 1 km, không thành 0 hay âm");
});

test("hydrate hồ sơ: rỗng thì không đi Postgres", () => {
  assert.equal(buildProfileQuery([]), null);
});

test("hydrate CHỈ lấy ảnh đã duyệt, và lấy ảnh vị trí nhỏ nhất còn duyệt", () => {
  const q = buildProfileQuery(["1", "2"]);
  assert.match(q!.text, /moderation = 1/);
  assert.match(q!.text, /LEFT JOIN LATERAL/, "JOIN thường sẽ làm biến mất người có ảnh 0 đang chờ duyệt");
  assert.match(q!.text, /ORDER BY position LIMIT 1/);
});

test("hydrate loại người đã xoá hoặc bị khoá", () => {
  const q = buildProfileQuery(["1"]);
  assert.match(q!.text, /u\.status = 0/);
  assert.match(q!.text, /u\.deleted_at IS NULL/);
});

test("tuổi tính bằng age(), không trừ năm — sinh 31/12 trừ năm là sai gần một tuổi", () => {
  assert.match(buildProfileQuery(["1"])!.text, /age\(p\.birth_date\)/);
});

test("lô bị kẹp ở MAX_PROFILES", () => {
  const q = buildProfileQuery(Array.from({ length: 500 }, (_, i) => String(i)));
  assert.equal((q!.values[0] as string[]).length, MAX_PROFILES);
});
