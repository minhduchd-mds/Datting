import type { LatLng } from "./geo.js";
import type { UserVector } from "./ranking.js";

/**
 * Tầng kết nối Postgres — phần THUẦN TUÝ.
 *
 * File này KHÔNG import `pg` và không mở kết nối nào. Nó chỉ dựng câu SQL và
 * đổi hàng trả về thành `UserVector`. Lý do tách như vậy: không có Postgres
 * chạy ở máy dev lúc viết, nên thứ duy nhất còn kiểm chứng được là logic — và
 * logic ở đây có đúng ba cái bẫy im lặng, cả ba đều không làm sập gì cả:
 *
 *   1. `user_id` là Snowflake 64-bit. `pg` trả BIGINT về dạng CHUỖI đúng vì lý
 *      do đó; `Number()` nó là mất chính xác từ 2^53 trở lên.
 *   2. Tuổi và ngày sinh ĐẢO CHIỀU nhau. `age_max` lớn ⇒ `birth_date` sớm.
 *   3. `ST_DWithin` trên `geography` đo bằng MÉT. Truyền km vào là lọc bán
 *      kính nhỏ hơn 1000 lần, và deck chỉ trống chứ không báo lỗi.
 *
 * Vỏ I/O nằm ở `pgSource.ts` và mỏng đúng mức không còn gì để test.
 */

/** Hàng thô đúng như truy vấn dưới đây trả về. */
export interface CandidateRow {
  /** BIGINT → chuỗi. Xem bẫy số 1. */
  user_id: string;
  /** pgvector trả text `"[0.1,0.2]"` trừ khi đăng ký type parser. */
  embedding: string | number[] | null;
  interests: string[];
  lifestyle: string[];
  intent: string[];
  community: string | null;
  lat: number | null;
  lng: number | null;
  days_since_active: number;
  is_new_user: boolean;
}

export interface CandidateFilter {
  viewerId: bigint;
  /** Chỉ có khi người xem đã đồng ý chia sẻ vị trí (NĐ13). Thiếu ⇒ bỏ lọc bán kính. */
  viewerLoc?: LatLng;
  wantGenders?: number[];
  ageMin?: number;
  ageMax?: number;
  maxDistanceKm?: number;
}

export interface Query {
  text: string;
  values: unknown[];
}

/**
 * Trần số ứng viên kéo về trong MỘT lượt truy hồi.
 *
 * Tầng 1 của pipeline nhắm ~1.000 ứng viên; 2.000 là chỗ thở. Có trần vì
 * `limit` đến từ query string của client (`/v1/deck?limit=`): không kẹp thì
 * `?limit=9999999` là một lượt quét toàn bảng do người lạ đặt hàng.
 */
export const MAX_CANDIDATES = 2000;

/** Ai tạo tài khoản trong 7 ngày gần nhất thì còn tính là "người mới". */
const NEW_USER_DAYS = 7;

/**
 * Khoảng ngày sinh tương ứng một khoảng tuổi.
 *
 * ĐẢO CHIỀU: người 40 tuổi sinh SỚM hơn người 25 tuổi. Nên `ageMax` cho ra
 * `earliest`, còn `ageMin` cho ra `latest`. Viết xuôi tay là lọc ngược, deck ra
 * toàn người ngoài khoảng tuổi, và không có lỗi nào được in ra.
 *
 * Lọc theo `birth_date` chứ không tính tuổi trong `WHERE`: `EXTRACT(YEAR FROM
 * age(birth_date))` là biểu thức trên cột, index sẽ không dùng được.
 */
export function birthDateRange(
  ageMin: number,
  ageMax: number,
  today: Date,
): { earliest: string; latest: string } {
  return { earliest: isoMinusYears(today, ageMax), latest: isoMinusYears(today, ageMin) };
}

function isoMinusYears(d: Date, years: number): string {
  const month = d.getUTCMonth();
  const t = new Date(Date.UTC(d.getUTCFullYear() - years, month, d.getUTCDate()));
  // 29/2 lùi về một năm không nhuận: JS tự đẩy sang 1/3. Kéo lại 28/2 —
  // lệch một ngày về phía CHẶT hơn thay vì lỏng hơn.
  if (t.getUTCMonth() !== month) t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
}

/**
 * Truy vấn Tầng 1 (truy hồi) cho một tập ô S2.
 *
 * Trả `null` khi không có ô nào: không ô thì không ứng viên, và
 * `= ANY('{}')` là một lượt đi Postgres chắc chắn về tay không.
 *
 * `ORDER BY p.updated_at DESC` khớp đúng `idx_profiles_shard
 * (s2_cell_l8, updated_at DESC)` — đổi thứ tự này là mất index.
 */
export function buildCandidateQuery(
  cells: readonly bigint[],
  f: CandidateFilter,
  limit: number,
  today: Date = new Date(),
): Query | null {
  if (cells.length === 0) return null;

  const values: unknown[] = [
    // bigint[] → string[]: `pg` không serialise BigInt, nó ném TypeError.
    cells.map((c) => c.toString()),
    f.viewerId.toString(),
  ];
  const p = (v: unknown): string => `$${values.push(v)}`;

  const where: string[] = [
    "p.s2_cell_l8 = ANY($1::bigint[])",
    "u.status = 0",
    "u.deleted_at IS NULL",
    "u.user_id <> $2::bigint",
    // Ảnh chưa duyệt không hiển thị công khai. Lọc ở ĐÂY chứ không để tầng
    // hydrate bỏ thẻ: bỏ ở đó nghĩa là deck 30 thẻ về tay người dùng còn 11.
    "EXISTS (SELECT 1 FROM photos ph WHERE ph.user_id = p.user_id AND ph.moderation = 1)",
    // Chặn là HAI CHIỀU. Người bị chặn cũng không được thấy người chặn mình —
    // nếu không, họ suy ra được là mình bị chặn, và đó là thông tin ta không nợ.
    `NOT EXISTS (
       SELECT 1 FROM blocks b
       WHERE (b.blocker_id = $2::bigint AND b.blocked_id = p.user_id)
          OR (b.blocker_id = p.user_id AND b.blocked_id = $2::bigint)
     )`,
  ];

  if (f.wantGenders && f.wantGenders.length > 0) {
    where.push(`p.gender = ANY(${p(f.wantGenders)}::smallint[])`);
  }

  if (f.ageMin !== undefined || f.ageMax !== undefined) {
    const r = birthDateRange(f.ageMin ?? 18, f.ageMax ?? 99, today);
    where.push(`p.birth_date BETWEEN ${p(r.earliest)}::date AND ${p(r.latest)}::date`);
  }

  // Không biết người xem ở đâu thì không có gì để đo. Lặng lẽ bỏ lọc bán kính
  // đúng hơn là lấy một toạ độ mặc định — (0,0) nằm giữa Đại Tây Dương.
  if (f.viewerLoc && f.maxDistanceKm !== undefined) {
    const lng = p(f.viewerLoc.lng);
    const lat = p(f.viewerLoc.lat);
    // geography ⇒ MÉT. Xem bẫy số 3.
    const met = p(Math.round(f.maxDistanceKm * 1000));
    where.push(`ST_DWithin(p.geo, ST_MakePoint(${lng}, ${lat})::geography, ${met})`);
  }

  const k = p(Math.max(1, Math.min(MAX_CANDIDATES, Math.floor(limit))));

  return {
    text: `SELECT u.user_id::text                                            AS user_id,
       p.embedding::text                                            AS embedding,
       p.interests,
       p.lifestyle,
       p.intent,
       p.community,
       ST_Y(p.geo::geometry)                                        AS lat,
       ST_X(p.geo::geometry)                                        AS lng,
       GREATEST(0, EXTRACT(DAY FROM now() - u.last_active_at))::int  AS days_since_active,
       (u.created_at > now() - INTERVAL '${NEW_USER_DAYS} days')     AS is_new_user
  FROM profiles p
  JOIN users u ON u.user_id = p.user_id
 WHERE ${where.join("\n   AND ")}
 ORDER BY p.updated_at DESC
 LIMIT ${k}`,
    values,
  };
}

/* ===========================================================================
 * TIÊU CHÍ KẾT NỐI (bảng `preferences`)
 *
 * ⚠ `want_genders` SUY RA ĐƯỢC xu hướng tính dục ⇒ dữ liệu nhạy cảm theo
 *   NĐ13/2023, ngang hàng với vị trí. Hệ quả kỹ thuật: nó chỉ được đến từ
 *   DATABASE, không bao giờ từ query string. Cho client ghi đè trường này là
 *   mở đúng một đường liệt kê người dùng theo xu hướng — người gọi API chỉ cần
 *   thử từng giá trị rồi đọc deck trả về.
 * =========================================================================== */

export interface Preferences {
  wantGenders: number[];
  ageMin: number;
  ageMax: number;
  maxDistanceKm: number;
}

/** Khớp DEFAULT của bảng `preferences` trong 0001_init.sql. */
export const DEFAULT_PREFS: Preferences = {
  wantGenders: [],
  ageMin: 18,
  ageMax: 99,
  maxDistanceKm: 50,
};

export interface PreferencesRow {
  want_genders: number[] | null;
  age_min: number | null;
  age_max: number | null;
  max_distance_km: number | null;
}

/**
 * Hàng `preferences` → `Preferences`.
 *
 * Nhận `null` vì truy vấn dùng LEFT JOIN: người vừa đăng ký có `users` và
 * `profiles` nhưng chưa chắc đã có hàng preferences.
 *
 * `wantGenders: []` nghĩa là KHÔNG LỌC giới tính, không phải "lọc theo tập
 * rỗng". `buildCandidateQuery` bỏ hẳn điều kiện khi mảng rỗng — hiểu nhầm chỗ
 * này thì deck luôn trống và không có gì báo tại sao.
 */
export function rowToPreferences(row: Partial<PreferencesRow> | null | undefined): Preferences {
  if (!row) return { ...DEFAULT_PREFS };
  return {
    wantGenders: row.want_genders ?? DEFAULT_PREFS.wantGenders,
    ageMin: row.age_min ?? DEFAULT_PREFS.ageMin,
    ageMax: row.age_max ?? DEFAULT_PREFS.ageMax,
    maxDistanceKm: row.max_distance_km ?? DEFAULT_PREFS.maxDistanceKm,
  };
}

/**
 * Bán kính thực dùng cho một lượt gọi deck.
 *
 * Client được phép THU HẸP (thanh trượt "trong vòng 5 km" ở màn lọc) nhưng
 * KHÔNG được nới rộng quá cài đặt đã lưu. Khác `want_genders` ở chỗ đây không
 * phải dữ liệu nhạy cảm — nhưng vẫn là cài đặt của người dùng, và một tham số
 * URL không nên ghi đè được thứ họ đã tự chọn trong app.
 *
 * Giá trị rác (NaN, âm) rơi về cài đặt hoặc sàn 1 km, không bao giờ thành 0:
 * bán kính 0 cho deck rỗng vĩnh viễn mà không lỗi nào được in ra.
 */
export function effectiveMaxDistanceKm(stored: number, requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return stored;
  return Math.max(1, Math.min(stored, Math.floor(requested)));
}

/**
 * pgvector trả về text dạng `"[0.1,-0.2]"`.
 *
 * Chấp nhận cả mảng sẵn, phòng khi ai đó đăng ký type parser cho OID của
 * `vector` — lúc đó driver trả mảng và hàm này phải không phá nó.
 */
export function parseVector(v: string | number[] | null | undefined): number[] {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  const body = v.trim().replace(/^\[|\]$/g, "");
  if (body === "") return [];
  return body.split(",").map(Number);
}

/**
 * Hàng Postgres → `UserVector`.
 *
 * `impressionsToday` KHÔNG đến từ hàng: Postgres không có cột đó (bộ đếm hiển
 * thị theo ngày sống ở Valkey). Nhận qua tham số thay vì mặc định 0 âm thầm —
 * 0 nghĩa là "hôm nay chưa ai thấy người này", và đó chính là đầu vào làm tắt
 * cơ chế chặn "vua sắc đẹp" trong `ranking.ts`.
 */
export function rowToUserVector(row: CandidateRow, impressionsToday: number): UserVector {
  return {
    userId: BigInt(row.user_id),
    embedding: parseVector(row.embedding),
    interests: row.interests ?? [],
    lifestyle: row.lifestyle ?? [],
    intent: row.intent ?? [],
    community: row.community ?? "",
    loc: { lat: row.lat ?? 0, lng: row.lng ?? 0 },
    daysSinceActive: row.days_since_active,
    impressionsToday,
    isNewUser: row.is_new_user,
  };
}
