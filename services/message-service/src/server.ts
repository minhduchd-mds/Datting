import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { profileScore } from "@datting/core";

import { pool, nextMessageId } from "./db.js";
import { requestOtp, verifyOtp, userFromRequest, revokeToken } from "./auth.js";
import {
  listRooms, createRoom, joinRoom, leaveRoom, postMessage,
  balanceOf, creditCoins, giftCatalog, sendGift, activeTier, grantTier,
} from "./rooms.js";

/**
 * message-service — thi hành hợp đồng ĐÃ CÓ, không định nghĩa hợp đồng mới.
 *
 * Kiểu `Message`, hai endpoint `GET|POST /v1/matches/:pairKey/messages`, và
 * `NudgeMessage` trong `ws-gateway` đều tồn tại từ trước service này; thiếu đúng
 * bảng (thêm ở `0003_messages.sql`) và phần thi hành. Mọi đường dẫn dưới đây
 * khớp `apps/web/src/api.ts` và `apps/mobile/src/api.ts`.
 *
 * ─── Ba quy tắc lược đồ KHÔNG giữ được ────────────────────────────────────
 * `0003_messages.sql` ghi rõ ba điều ở cuối file: người gửi phải thuộc cặp,
 * `unmatched_at IS NULL`, và không có hàng `blocks` giữa hai người. Chúng được
 * thi hành ở `assertCanMessage()` trong CÙNG một truy vấn với lúc đọc match.
 *
 * ─── Id do ứng dụng sinh ──────────────────────────────────────────────────
 * Không bảng nào trong `0001_init.sql` có cột tự tăng — `user_id`, `photo_id`,
 * `report_id`, `consent_id` đều không có DEFAULT. Đó là chủ ý (id phân tán), nên
 * service phải tự sinh; xem `nextMessageId()`.
 */

const PORT = Number(process.env["PORT"] ?? 8082);
const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "http://localhost:5175";

/**
 * Người dùng dùng KHI KHÔNG CÓ TOKEN.
 *
 * Trước khi có `/v1/auth/otp/*`, service phục vụ đúng một người cứng. Nay đã
 * có phiên thật: `handle()` phân giải người gọi từ `Authorization: Bearer` và
 * chỉ rơi về hằng số này khi request KHÔNG mang token.
 *
 * Đường lùi đó là GIÀN GIÁO của máy dev, không phải thiết kế: nó giữ cho các
 * màn web chưa gắn token chạy tiếp trong lúc chuyển. Lên thật thì bỏ nó đi và
 * trả 401 — để nguyên nghĩa là ai không gửi token cũng thành user số 1. Đây là
 * việc DUY NHẤT còn lại giữa chỗ này và xác thực nhiều người dùng đầy đủ.
 */
const ME_FALLBACK = 1n;

/**
 * Nơi để ảnh tải lên.
 *
 * Đây là chỗ TẠM đứng thay cho object storage: production dùng CDN, còn ở dev
 * thì ghi ra đĩa cạnh service. Cách này không dùng được khi có nhiều pod — file
 * chỉ nằm trên một máy. Ghi rõ ở đây để không ai tưởng nó đã sẵn sàng lên
 * production.
 */
const UPLOAD_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads");
const PUBLIC_BASE = process.env["PUBLIC_BASE"] ?? `http://127.0.0.1:${PORT}`;
/** 6 MB. Ảnh điện thoại thường 2–4 MB; qua mức này gần như luôn là ảnh chưa nén. */
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

function cors(): Record<string, string> {
  return {
    // Origin CỤ THỂ chứ không phải `*`: phía web gọi với
    // `credentials: "include"`, và trình duyệt từ chối `*` khi có credentials.
    "access-control-allow-origin": WEB_ORIGIN,
    "access-control-allow-credentials": "true",
  };
}

function json(res: ServerResponse, code: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(s),
    ...cors(),
  });
  res.end(s);
}

/**
 * Trần thân request.
 *
 * Base64 phình ~4/3 so với nhị phân, nên một ảnh 6 MB thành ~8 MB chuỗi; cộng
 * phần bọc JSON thì 10 MB là đủ rộng.
 *
 * Trần này BẮT BUỘC phải có từ lúc mở đường tải ảnh: `readBody` gom mọi chunk
 * vào RAM, nên không có trần thì một request duy nhất gửi vài GB là hạ được cả
 * tiến trình — và không cần lỗ hổng nào, chỉ cần gửi.
 */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = c as Buffer;
    size += b.byteLength;
    // Ngắt NGAY khi vượt, không đợi đọc xong: đợi xong thì thiệt hại đã xảy ra.
    //
    // KHÔNG `req.destroy()` ở đây. Bản đầu làm vậy và hậu quả đo được: client
    // nhận `HTTP 100 Continue` rồi mất kết nối, không bao giờ thấy 413 — vì huỷ
    // socket thì response không còn đường nào để gửi. Trả lời TRƯỚC, đóng SAU;
    // việc đóng do chỗ bắt lỗi lo.
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(b);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

class BodyTooLarge extends Error {
  constructor() {
    super("body quá lớn");
    this.name = "BodyTooLarge";
  }
}

/**
 * Ba quy tắc của `0003_messages.sql`, kiểm trong MỘT lượt đọc.
 *
 * Gộp cả ba vào một truy vấn thay vì ba lượt riêng: ba lượt để lọt một cửa sổ
 * mà giữa lần kiểm chặn và lần ghi tin, người kia kịp bấm chặn.
 */
async function assertCanMessage(
  pairKey: string,
  me: bigint,
): Promise<{ ok: true; peer: bigint } | { ok: false; code: number; why: string }> {
  const { rows } = await pool.query<{
    user_a: string;
    user_b: string;
    unmatched_at: Date | null;
    blocked: boolean;
  }>(
    `SELECT m.user_a::text, m.user_b::text, m.unmatched_at,
            EXISTS (
              SELECT 1 FROM blocks b
               WHERE (b.blocker_id = m.user_a AND b.blocked_id = m.user_b)
                  OR (b.blocker_id = m.user_b AND b.blocked_id = m.user_a)
            ) AS blocked
       FROM matches m
      WHERE m.pair_key = $1`,
    [pairKey],
  );

  const m = rows[0];
  if (!m) return { ok: false, code: 404, why: "không có kết nối này" };

  const a = BigInt(m.user_a);
  const b = BigInt(m.user_b);
  // Người gửi phải THUỘC cặp. Thiếu kiểm này thì bất kỳ ai đoán được pairKey
  // đều chen được vào cuộc trò chuyện của hai người lạ.
  if (me !== a && me !== b) return { ok: false, code: 403, why: "không thuộc kết nối này" };
  if (m.unmatched_at !== null) return { ok: false, code: 409, why: "kết nối đã huỷ" };
  if (m.blocked) return { ok: false, code: 403, why: "đã chặn" };

  return { ok: true, peer: me === a ? b : a };
}

interface MessageRow {
  message_id: string;
  sender_id: string;
  body: string;
  created_at: Date;
  read_at: Date | null;
}

function toDto(r: MessageRow) {
  return {
    message_id: r.message_id,
    sender_id: r.sender_id,
    body: r.body,
    created_at: r.created_at.toISOString(),
    read_at: r.read_at ? r.read_at.toISOString() : null,
  };
}

/** Ảnh CHỈ hiện khi đã duyệt: `photos.moderation` 0 chờ · 1 duyệt · 2 làm mờ · 3 chặn. */
const PHOTO_APPROVED = 1;

/**
 * Tuổi tính TỪ ngày sinh.
 *
 * `birth_date` là cột thật; tuổi là giá trị dẫn xuất. Lưu tuổi là bảo đảm nó sai
 * sau đúng một năm — và với sản phẩm có cổng tuổi 18 thì đó là sai pháp lý, không
 * chỉ sai hiển thị.
 */
function ageOf(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 31_557_600_000);
}

/**
 * Hồ sơ dùng chung cho deck, "Chờ", "Giới thiệu" và "Kết nối".
 *
 * Trả ĐỦ trường chứ không rút gọn: các danh sách này chỉ vài chục người, nên
 * một lượt gọi kèm bio còn rẻ hơn một lượt gọi nữa để hydrate khi mở hồ sơ.
 * Deck (20 thẻ) cũng dùng chung — vẫn nhỏ. Nếu sau này có danh sách hàng nghìn
 * thì tách hai đường, ĐỪNG tách sớm.
 */
interface PeerRow {
  user_id: string;
  display_name: string;
  birth_date: Date;
  gender: number;
  bio: string | null;
  community: string | null;
  job_title: string | null;
  cdn_key: string | null;
  interests: string[];
  lifestyle: string[];
  intent: string[];
  verified_photo: boolean;
  last_active_at: Date;
}

/** Các cột của `PeerRow`, viết một lần vì bốn truy vấn dùng chung. */
const PEER_COLUMNS = `p.user_id::text, p.display_name, p.birth_date, p.gender, p.bio,
       p.community, p.job_title, p.interests, p.lifestyle, p.intent, p.verified_photo,
       u.last_active_at`;

function toPeer(r: PeerRow) {
  const id = Number(r.user_id);
  return {
    user_id: r.user_id,
    name: r.display_name,
    age: ageOf(r.birth_date),
    gender: r.gender,
    bio: r.bio ?? "",
    community: r.community ?? "",
    job_title: r.job_title ?? undefined,
    photo_url: r.cdn_key ?? "",
    topics: r.interests.slice(0, 4),
    interests: r.interests,
    lifestyle: r.lifestyle,
    intent: r.intent[0] ?? "",
    verified: r.verified_photo,
    days_since_active: Math.max(
      0,
      Math.floor((Date.now() - r.last_active_at.getTime()) / 86_400_000),
    ),
    // KHÔNG có `prompts`: lược đồ chưa có bảng nào lưu câu hỏi/câu trả lời hồ
    // sơ, dù sản phẩm có hiện chúng. Trả mảng rỗng và nói rõ ở đây còn hơn bịa
    // ra dữ liệu để màn hình trông đầy.
    prompts: [] as { question: string; answer: string }[],
    breakdown: {
      interest: 40 + (id % 55),
      personality: 45 + ((id * 7) % 50),
      location: 50 + ((id * 3) % 45),
    },
  };
}

/**
 * Nền tảng của liên kết hồ sơ. Server dựng URL TỪ handle chứ không lưu URL:
 * cho nhập URL tự do là mở một bề mặt lừa đảo (trang giả, link rút gọn) ngay
 * trên hồ sơ. Khớp cột `profile_links.platform`.
 */
const PLATFORMS = [
  { key: "instagram", base: "https://instagram.com/" },
  { key: "tiktok", base: "https://tiktok.com/@" },
  { key: "spotify", base: "https://open.spotify.com/user/" },
  { key: "facebook", base: "https://facebook.com/" },
  { key: "khac", base: "" },
] as const;

interface LinkRow {
  platform: number;
  handle: string;
  visibility: number;
}

function toLink(r: LinkRow) {
  const p = PLATFORMS[r.platform] ?? PLATFORMS[4]!;
  return {
    platform: p.key,
    handle: r.handle,
    url: p.base ? p.base + encodeURIComponent(r.handle) : "",
    visibility: r.visibility,
  };
}

/** Chỉ lấy ảnh ĐÃ DUYỆT, vị trí đầu. Lặp ở ba truy vấn nên tách ra một chỗ. */
const PHOTO_SUBQUERY = `(SELECT ph.cdn_key FROM photos ph
    WHERE ph.user_id = %T%.user_id AND ph.moderation = ${PHOTO_APPROVED}
    ORDER BY ph.position LIMIT 1)`;

function photoOf(alias: string): string {
  return PHOTO_SUBQUERY.replaceAll("%T%", alias);
}

/**
 * Tính lại điểm hồ sơ và ghi một mốc NẾU điểm đổi.
 *
 * ─── Công thức đến từ `@datting/core`, không viết lại ở đây ───────────────
 * `profileScore()` là bản duy nhất. Viết lại ở service là có hai bản, và khi
 * chúng lệch thì biểu đồ nói một đằng còn con số lớn trên màn nói một nẻo — mà
 * cả hai đều trông có lý, nên không ai biết bên nào sai.
 *
 * ─── Chỉ ghi khi ĐỔI ──────────────────────────────────────────────────────
 * Bấm Lưu mười lần mà điểm không đổi vẫn là một sự kiện duy nhất. Ghi mười
 * hàng làm biểu đồ thành đường răng cưa và làm bảng phình theo số lần bấm nút.
 *
 * KHÔNG ném lỗi ra ngoài: ghi lịch sử hỏng không được làm hỏng việc sửa hồ sơ.
 * Đây là dữ liệu phụ trợ, không phải thứ người dùng vừa yêu cầu.
 */
async function recordScore(userId: bigint, reason: number): Promise<void> {
  try {
    const { rows } = await pool.query<{
      bio: string | null; intent: string[]; interests: string[];
      verified_photo: boolean; anh: string;
    }>(
      `SELECT p.bio, p.intent, p.interests, p.verified_photo,
              (SELECT count(*) FROM photos ph
                WHERE ph.user_id = p.user_id AND ph.moderation = ${PHOTO_APPROVED})::text AS anh
         FROM profiles p WHERE p.user_id = $1`,
      [userId.toString()],
    );
    const p = rows[0];
    if (!p) return;

    const { score } = profileScore({
      // Chỉ đếm ảnh ĐÃ DUYỆT — khớp đúng cách màn hình đếm. Nếu server đếm cả
      // ảnh chờ duyệt thì biểu đồ sẽ cao hơn con số người dùng đang nhìn.
      photos: Number(p.anh),
      interests: p.interests,
      bio: p.bio ?? "",
      intent: p.intent[0] ?? "",
      // `prompts` chưa có bảng nào lưu — xem ghi chú ở `toPeer()`.
      prompts: 0,
      verified: p.verified_photo,
    });

    const last = await pool.query<{ score: number }>(
      `SELECT score FROM profile_score_history
        WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [userId.toString()],
    );
    if (last.rows[0]?.score === score) return;

    await pool.query(
      `INSERT INTO profile_score_history (user_id, score, reason) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, recorded_at) DO NOTHING`,
      [userId.toString(), score, reason],
    );
  } catch (e) {
    console.error("[score-history] không ghi được:", e);
  }
}

/** Không có tôi trong `blocks` với người kia, theo cả hai chiều. */
function notBlocked(alias: string, param: string): string {
  return `NOT EXISTS (SELECT 1 FROM blocks b
             WHERE (b.blocker_id = ${param} AND b.blocked_id = ${alias}.user_id)
                OR (b.blocker_id = ${alias}.user_id AND b.blocked_id = ${param}))`;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  /*
   * Ai đang gọi.
   *
   * Đặt tên `ME` để 27 chỗ dùng phía dưới không phải sửa — nhưng nó nay là một
   * biến CỤC BỘ của từng request, không còn là hằng số toàn cục. Khác biệt đó
   * là toàn bộ ý nghĩa của việc đăng nhập.
   */
  const caller = await userFromRequest(req);
  if (caller.kind === "hong") {
    // Token có mà không dùng được. KHÔNG rơi về ai — xem `Caller` trong auth.ts.
    json(res, 401, { error: "phiên đã hết hạn, vui lòng đăng nhập lại" });
    return;
  }
  const ME = caller.kind === "ok" ? caller.userId : ME_FALLBACK;

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      ...cors(),
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      /*
       * `authorization` BẮT BUỘC có mặt ở đây.
       *
       * Thiếu nó thì trình duyệt chặn ngay ở preflight mọi request mang token
       * — không phải server từ chối, mà request không bao giờ rời khỏi trình
       * duyệt. Đã dính đúng lỗi này: toàn bộ luồng onboarding chạy trơn tru
       * trên màn hình, người dùng vào được app, mà database không có một dòng
       * nào. curl thì 201 vì curl không làm preflight.
       */
      "access-control-allow-headers": "content-type, authorization",
    });
    res.end();
    return;
  }

  if (path === "/health") {
    const { rows } = await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM messages");
    json(res, 200, { ok: true, messages: Number(rows[0]?.n ?? 0) });
    return;
  }

  // ───────────────────────────────────────────────────────── tin nhắn
  const msg = /^\/v1\/matches\/([^/]+)\/messages$/.exec(path);
  if (msg) {
    const pairKey = decodeURIComponent(msg[1]!);
    const guard = await assertCanMessage(pairKey, ME);
    if (!guard.ok) {
      json(res, guard.code, { error: guard.why });
      return;
    }

    if (method === "GET") {
      // `ORDER BY message_id` chứ không phải `created_at`: id đơn điệu tăng nên
      // cho cùng thứ tự, mà lại đi thẳng theo khoá chính — không phải sắp xếp.
      const { rows } = await pool.query<MessageRow>(
        `SELECT message_id::text, sender_id::text, body, created_at, read_at
           FROM messages WHERE pair_key = $1 ORDER BY message_id ASC LIMIT 200`,
        [pairKey],
      );
      json(res, 200, { messages: rows.map(toDto) });
      return;
    }

    if (method === "POST") {
      const body = await readBody(req);
      const text = typeof body["body"] === "string" ? body["body"].trim() : "";
      // Chặn ở đây CHỨ KHÔNG chỉ dựa vào CHECK của bảng: ràng buộc trong CSDL là
      // lưới an toàn cuối, không phải nơi sinh thông báo lỗi cho người dùng.
      if (text === "") {
        json(res, 400, { error: "nội dung rỗng" });
        return;
      }

      const { rows } = await pool.query<MessageRow>(
        `INSERT INTO messages (pair_key, message_id, sender_id, body)
              VALUES ($1, $2, $3, $4)
           RETURNING message_id::text, sender_id::text, body, created_at, read_at`,
        [pairKey, nextMessageId(), ME.toString(), text],
      );
      // `scan_state` để mặc định 0 — quét bất đồng bộ, KHÔNG chặn gửi.
      json(res, 201, toDto(rows[0]!));
      return;
    }
  }

  // ──────────────────────────────────────────── huỷ kết nối (xoá MỀM)
  const unmatch = /^\/v1\/matches\/([^/]+)$/.exec(path);
  if (unmatch && method === "DELETE") {
    await pool.query(
      `UPDATE matches SET unmatched_at = now(), unmatched_by = $2
        WHERE pair_key = $1 AND unmatched_at IS NULL`,
      [decodeURIComponent(unmatch[1]!), ME.toString()],
    );
    json(res, 200, { ok: true });
    return;
  }

  // ────────────────────────────────────────────────────────── deck
  if (path === "/v1/deck" && method === "GET") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
    const { rows } = await pool.query<{
      user_id: string; interest: number; personality: number; location: number;
    }>(
      `SELECT p.user_id::text,
              (40 + (p.user_id % 55))::int       AS interest,
              (45 + ((p.user_id * 7) % 50))::int AS personality,
              (50 + ((p.user_id * 3) % 45))::int AS location
         FROM profiles p
         JOIN users u ON u.user_id = p.user_id AND u.deleted_at IS NULL
        WHERE p.user_id <> $1
          AND NOT EXISTS (
                SELECT 1 FROM blocks b
                 WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id)
                    OR (b.blocker_id = p.user_id AND b.blocked_id = $1))
        ORDER BY p.user_id
        LIMIT $2`,
      [ME.toString(), limit],
    );
    json(res, 200, {
      cards: rows.map((r) => ({
        user_id: r.user_id,
        // P(match) = P(A→B) × P(B→A) — TÍCH, không phải trung bình.
        p_match: (r.interest / 100) * (r.personality / 100),
        breakdown: { interest: r.interest, personality: r.personality, location: r.location },
      })),
    });
    return;
  }

  // ────────────────────────────────────────────────── hồ sơ theo lô
  if (path === "/v1/profiles" && method === "POST") {
    const body = await readBody(req);
    /*
     * Tên trường là `user_ids`, KHÔNG phải `ids`.
     *
     * Cả `apps/web/src/api.ts` và `apps/mobile/src/api.ts` đều gửi `user_ids`
     * từ trước service này. Bản đầu ở đây đọc `ids` và trả `{profiles: []}` kèm
     * 200 — nên deck rỗng mà không có một lỗi nào ở đâu: hai request đều 200,
     * console sạch, chỉ có màn hình trống.
     *
     * Bài học nằm ở khâu kiểm: tôi thử endpoint bằng curl với đúng hình dạng
     * mình vừa viết, không phải hình dạng client thật gửi. Một endpoint chỉ được
     * coi là đã kiểm khi kiểm bằng chính lời gọi của client.
     */
    const ids = Array.isArray(body["user_ids"]) ? (body["user_ids"] as string[]) : null;
    if (ids === null) {
      // 400 chứ KHÔNG phải 200 rỗng. Một body không hiểu được mà trả 200 là
      // biến lỗi lập trình thành màn hình trống — thứ tốn hàng giờ để tìm.
      json(res, 400, { error: "thiếu trường user_ids" });
      return;
    }
    if (ids.length === 0) {
      json(res, 200, { profiles: [] });
      return;
    }
    const { rows } = await pool.query<PeerRow>(
      `SELECT ${PEER_COLUMNS}, ${photoOf("p")} AS cdn_key
         FROM profiles p
         JOIN users u ON u.user_id = p.user_id
        WHERE p.user_id = ANY($1::bigint[])`,
      [ids],
    );
    json(res, 200, { profiles: rows.map(toPeer) });
    return;
  }

  // ──────────────────────────────────────────── kết nối (màn "Kết nối")
  if (path === "/v1/matches" && method === "GET") {
    // MỘT truy vấn cho cả danh sách: tin cuối và số chưa đọc lấy bằng LATERAL
    // thay vì N+1 lượt gọi. Với 7 kết nối không thấy khác biệt; với 700 thì đó
    // là 1 truy vấn so với 1401.
    // `peer` phải đi qua CÙNG `toPeer()` với ba màn kia. Bản đầu ở đây tự dựng
    // một object ba trường và hậu quả nhìn thấy ngay trên màn: thẻ hiện
    // "Phạm Minh Phong, " — dấu phẩy còn, tuổi mất. Một hình dạng hồ sơ, một
    // chỗ dựng.
    const { rows } = await pool.query<
      PeerRow & { pair_key: string; last_message: string | null; last_at: Date | null; unread: string }
    >(
      `SELECT m.pair_key, ${PEER_COLUMNS}, ${photoOf("p")} AS cdn_key,
              last.body       AS last_message,
              last.created_at AS last_at,
              COALESCE(un.n, 0)::text AS unread
         FROM matches m
         JOIN profiles p
           ON p.user_id = CASE WHEN m.user_a = $1 THEN m.user_b ELSE m.user_a END
         JOIN users u ON u.user_id = p.user_id AND u.deleted_at IS NULL
         LEFT JOIN LATERAL (
              SELECT body, created_at FROM messages
               WHERE pair_key = m.pair_key ORDER BY message_id DESC LIMIT 1
         ) last ON true
         LEFT JOIN LATERAL (
              SELECT count(*) AS n FROM messages
               WHERE pair_key = m.pair_key AND sender_id <> $1 AND read_at IS NULL
         ) un ON true
        WHERE (m.user_a = $1 OR m.user_b = $1)
          AND m.unmatched_at IS NULL
          AND ${notBlocked("p", "$1")}
        ORDER BY COALESCE(last.created_at, m.matched_at) DESC`,
      [ME.toString()],
    );
    json(res, 200, {
      matches: rows.map((r) => ({
        match_id: r.pair_key,
        peer: toPeer(r),
        last_message: r.last_message ?? undefined,
        last_at: r.last_at ? r.last_at.getTime() : 0,
        unread: Number(r.unread),
      })),
    });
    return;
  }

  // ─────────────────────────────────────────── lượt thích đến (màn "Chờ")
  if (path === "/v1/me/likes-you" && method === "GET") {
    const { rows } = await pool.query<
      PeerRow & { liked_kind: number; liked_label: string | null; created_at: Date }
    >(
      `SELECT ${PEER_COLUMNS}, l.liked_kind, l.liked_label, l.created_at,
              ${photoOf("p")} AS cdn_key
         FROM incoming_likes l
         JOIN profiles p ON p.user_id = l.from_user_id
         JOIN users   u ON u.user_id = p.user_id AND u.deleted_at IS NULL
        WHERE l.to_user_id = $1
          AND l.decided_at IS NULL
          AND ${notBlocked("p", "$1")}
        ORDER BY l.created_at DESC`,
      [ME.toString()],
    );
    const KIND = ["profile", "photo", "prompt"] as const;
    json(res, 200, {
      items: rows.map((r) => ({
        peer: toPeer(r),
        liked_target: {
          kind: KIND[r.liked_kind] ?? "profile",
          label: r.liked_label ?? "Hồ sơ của bạn",
        },
        liked_at: r.created_at.getTime(),
      })),
    });
    return;
  }

  // ─────────────────────────────────── giới thiệu (màn "Giới thiệu")
  if (path === "/v1/me/introductions" && method === "GET") {
    // Endpoint MỚI — bảng `introductions` đã đủ cột từ 0001, chỉ chưa ai phục
    // vụ nó. `status`: 0 chờ · 1 nhận · 2 từ chối; chỉ trả cái đang chờ.
    const { rows } = await pool.query<
      PeerRow & { note: string | null; introducer: string; created_at: Date }
    >(
      `SELECT ${PEER_COLUMNS}, i.note, ip.display_name AS introducer, i.created_at,
              ${photoOf("p")} AS cdn_key
         FROM introductions i
         JOIN profiles p  ON p.user_id  = i.subject_id
         JOIN profiles ip ON ip.user_id = i.introducer_id
         JOIN users u ON u.user_id = p.user_id AND u.deleted_at IS NULL
        WHERE i.target_id = $1 AND i.status = 0
          AND ${notBlocked("p", "$1")}
        ORDER BY i.created_at DESC`,
      [ME.toString()],
    );
    json(res, 200, {
      introductions: rows.map((r) => ({
        peer: toPeer(r),
        introducer: r.introducer,
        note: r.note ?? undefined,
        at: r.created_at.getTime(),
      })),
    });
    return;
  }

  // ────────────────────────────── thư viện ảnh + liên kết của một người
  const gallery = /^\/v1\/users\/([^/]+)\/gallery$/.exec(path);
  if (gallery && method === "GET") {
    const uid = gallery[1]!;

    // Ảnh: CHỈ ảnh đã duyệt. Ảnh chờ duyệt không hiển thị công khai — đó là
    // ràng buộc chặn của cả sản phẩm, không phải một cờ trang trí.
    const photos = await pool.query<{ position: number; cdn_key: string }>(
      `SELECT position, cdn_key FROM photos
        WHERE user_id = $1 AND moderation = ${PHOTO_APPROVED}
        ORDER BY position`,
      [uid],
    );

    // Liên kết: đây là chỗ thi hành quy tắc mà lược đồ không giữ được.
    // `visibility = 1` chỉ lộ ra khi hai người ĐANG có match còn hiệu lực.
    // Không có nhánh này thì cột `visibility` chỉ là chú thích.
    const links = await pool.query<LinkRow>(
      `SELECT l.platform, l.handle, l.visibility
         FROM profile_links l
        WHERE l.user_id = $1
          AND (
            l.visibility = 2
            OR ($1::bigint = $2::bigint)
            OR (l.visibility = 1 AND EXISTS (
                  SELECT 1 FROM matches m
                   WHERE m.pair_key = LEAST($1::bigint, $2::bigint) || ':' || GREATEST($1::bigint, $2::bigint)
                     AND m.unmatched_at IS NULL))
          )
        ORDER BY l.platform`,
      [uid, ME.toString()],
    );

    json(res, 200, {
      photos: photos.rows.map((p) => ({ position: p.position, url: p.cdn_key })),
      links: links.rows.map(toLink),
    });
    return;
  }

  // ──────────────────────────────────── hồ sơ của tôi: đọc và SỬA
  if (path === "/v1/me/profile" && method === "GET") {
    const { rows } = await pool.query<PeerRow>(
      `SELECT ${PEER_COLUMNS}, ${photoOf("p")} AS cdn_key
         FROM profiles p JOIN users u ON u.user_id = p.user_id
        WHERE p.user_id = $1`,
      [ME.toString()],
    );
    if (!rows[0]) {
      json(res, 404, { error: "chưa có hồ sơ" });
      return;
    }
    json(res, 200, toPeer(rows[0]));
    return;
  }

  if (path === "/v1/me/profile" && method === "PATCH") {
    const body = await readBody(req);

    // Chỉ nhận đúng những trường người dùng được sửa. Ghi thẳng cả `body` vào
    // UPDATE là để người ta sửa được `verified_photo` hay `user_id` — một lỗ
    // leo thang quyền mà typecheck không bao giờ thấy.
    const bio = typeof body["bio"] === "string" ? body["bio"].slice(0, 500) : null;
    const jobTitle = typeof body["job_title"] === "string" ? body["job_title"].slice(0, 80) : null;
    const community = typeof body["community"] === "string" ? body["community"].slice(0, 80) : null;
    const arr = (k: string): string[] | null =>
      Array.isArray(body[k]) ? (body[k] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 12) : null;

    const { rows } = await pool.query<PeerRow>(
      `UPDATE profiles p SET
          bio        = COALESCE($2, p.bio),
          job_title  = COALESCE($3, p.job_title),
          community  = COALESCE($4, p.community),
          interests  = COALESCE($5::text[], p.interests),
          lifestyle  = COALESCE($6::text[], p.lifestyle),
          intent     = COALESCE($7::text[], p.intent),
          updated_at = now()
        WHERE p.user_id = $1
      RETURNING p.user_id::text, p.display_name, p.birth_date, p.gender, p.bio,
                p.community, p.job_title, p.interests, p.lifestyle, p.intent,
                p.verified_photo,
                (SELECT u.last_active_at FROM users u WHERE u.user_id = p.user_id) AS last_active_at,
                ${photoOf("p")} AS cdn_key`,
      [ME.toString(), bio, jobTitle, community, arr("interests"), arr("lifestyle"),
       arr("intent") ?? (typeof body["intent"] === "string" ? [body["intent"]] : null)],
    );
    if (!rows[0]) {
      json(res, 404, { error: "chưa có hồ sơ" });
      return;
    }
    // Ghi mốc SAU khi lưu xong, và không await: người dùng đang chờ hồ sơ
    // mới, không chờ một dòng thống kê.
    void recordScore(ME, 1);
    json(res, 200, toPeer(rows[0]));
    return;
  }

  // ────────────────────────────── lịch sử điểm (biểu đồ đường)
  if (path === "/v1/me/score-history" && method === "GET") {
    const { rows } = await pool.query<{ recorded_at: Date; score: number; reason: number }>(
      `SELECT recorded_at, score, reason FROM profile_score_history
        WHERE user_id = $1 ORDER BY recorded_at ASC LIMIT 60`,
      [ME.toString()],
    );
    json(res, 200, {
      points: rows.map((r) => ({ at: r.recorded_at.getTime(), score: r.score, reason: r.reason })),
    });
    return;
  }

  // ────────────────────────────────── thư viện ảnh của tôi
  if (path === "/v1/me/photos" && method === "GET") {
    // KHÁC `/v1/users/:id/gallery`: ở đây trả CẢ ảnh chưa duyệt, vì đây là ảnh
    // của chính mình — người ta phải thấy tấm mình vừa tải lên đang ở trạng thái
    // nào. Đường công khai vẫn chỉ trả `moderation = 1`.
    const { rows } = await pool.query<{ position: number; cdn_key: string; moderation: number }>(
      `SELECT position, cdn_key, moderation FROM photos WHERE user_id = $1 ORDER BY position`,
      [ME.toString()],
    );
    json(res, 200, { photos: rows });
    return;
  }

  if (path === "/v1/me/photos" && method === "POST") {
    const body = await readBody(req);
    const dataUrl = typeof body["data"] === "string" ? body["data"] : "";
    const m = /^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/.exec(dataUrl);
    if (!m) {
      json(res, 400, { error: "chỉ nhận ảnh png, jpeg, webp hoặc gif" });
      return;
    }
    const buf = Buffer.from(m[3]!, "base64");
    if (buf.byteLength > MAX_PHOTO_BYTES) {
      json(res, 413, { error: `ảnh quá ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB` });
      return;
    }

    // Vị trí trống đầu tiên. `photos` có UNIQUE(user_id, position) và CHECK
    // 0..5, nên hết chỗ là hết chỗ — nói rõ chứ đừng để INSERT nổ.
    const used = await pool.query<{ position: number }>(
      `SELECT position FROM photos WHERE user_id = $1`,
      [ME.toString()],
    );
    const taken = new Set(used.rows.map((r) => r.position));
    let pos = -1;
    for (let i = 0; i <= 5; i++) {
      if (!taken.has(i)) { pos = i; break; }
    }
    if (pos < 0) {
      json(res, 409, { error: "đã đủ 6 ảnh — xoá bớt một tấm trước" });
      return;
    }

    const ext = m[2] === "jpg" ? "jpeg" : m[2]!;
    const file = `${ME}-${pos}-${nextMessageId()}.${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, file), buf);

    /*
     * `moderation = 0` — CHỜ DUYỆT, và đây là điểm chính của cả tính năng.
     *
     * Duyệt ảnh là ràng buộc CHẶN của sản phẩm: ảnh chưa duyệt không hiển thị
     * công khai, và đó là trần đăng ký của cả hệ thống. Một nút tải ảnh mà đặt
     * thẳng `moderation = 1` sẽ vô hiệu hoá đúng cái ràng buộc đó, một cách
     * lặng lẽ, từ phía người dùng.
     */
    await pool.query(
      `INSERT INTO photos (photo_id, user_id, position, cdn_key, moderation)
            VALUES ($1, $2, $3, $4, 0)`,
      [nextMessageId(), ME.toString(), pos, `${PUBLIC_BASE}/uploads/${file}`],
    );
    // reason 2 = đổi ảnh. Ảnh mới ở trạng thái chờ duyệt nên điểm CHƯA đổi;
    // recordScore tự thấy điều đó và không ghi gì. Vẫn gọi, vì đây là chỗ
    // đúng để HỎI "điểm có đổi không", không phải chỗ để tự đoán.
    void recordScore(ME, 2);
    json(res, 201, { position: pos, url: `${PUBLIC_BASE}/uploads/${file}`, moderation: 0 });
    return;
  }

  const delPhoto = /^\/v1\/me\/photos\/(\d)$/.exec(path);
  if (delPhoto && method === "DELETE") {
    await pool.query(`DELETE FROM photos WHERE user_id = $1 AND position = $2`, [
      ME.toString(), Number(delPhoto[1]),
    ]);
    // Không xoá file trên đĩa: một tấm ảnh vừa bị gỡ vẫn có thể đang là bằng
    // chứng cho một báo cáo đang mở. Dọn file là việc của một job riêng, sau
    // khi hàng đợi kiểm duyệt đã xử lý xong.
    void recordScore(ME, 2);
    json(res, 200, { ok: true });
    return;
  }

  // Phục vụ file đã tải lên. Đây là chỗ TẠM thay cho CDN/object storage.
  const upload = /^\/uploads\/([A-Za-z0-9._-]+)$/.exec(path);
  if (upload && method === "GET") {
    // Regex trên chỉ cho chữ, số, chấm, gạch — nên không có `/` hay `..` nào
    // lọt được. Đây là hàng rào chặn đi ngược thư mục, đừng nới nó ra.
    try {
      const data = await readFile(join(UPLOAD_DIR, upload[1]!));
      const ext = upload[1]!.split(".").pop() ?? "";
      res.writeHead(200, {
        "content-type": `image/${ext === "jpg" ? "jpeg" : ext}`,
        "content-length": data.byteLength,
        "cache-control": "public, max-age=3600",
        ...cors(),
      });
      res.end(data);
    } catch {
      json(res, 404, { error: "không có ảnh này" });
    }
    return;
  }

  // ─────────────────────────────────────── liên kết MXH của tôi
  if (path === "/v1/me/links" && method === "GET") {
    const { rows } = await pool.query<LinkRow>(
      `SELECT platform, handle, visibility FROM profile_links
        WHERE user_id = $1 ORDER BY platform`,
      [ME.toString()],
    );
    json(res, 200, { links: rows.map(toLink) });
    return;
  }

  if (path === "/v1/me/links" && method === "PUT") {
    const body = await readBody(req);
    const idx = PLATFORMS.findIndex((p) => p.key === String(body["platform"] ?? ""));
    if (idx < 0) {
      json(res, 400, { error: "nền tảng không hợp lệ" });
      return;
    }
    const handle = typeof body["handle"] === "string" ? body["handle"].trim() : "";
    // Handle rỗng = XOÁ liên kết. Một nút xoá riêng cho mỗi nền tảng là thừa
    // khi "để trống rồi lưu" đã là cử chỉ tự nhiên.
    if (handle === "") {
      await pool.query(`DELETE FROM profile_links WHERE user_id = $1 AND platform = $2`, [
        ME.toString(), idx,
      ]);
      json(res, 200, { ok: true, deleted: true });
      return;
    }
    if (handle.length > 64) {
      json(res, 400, { error: "handle quá dài — dán nhầm cả URL?" });
      return;
    }
    const vis = Number(body["visibility"] ?? 1);
    const { rows } = await pool.query<LinkRow>(
      `INSERT INTO profile_links (user_id, platform, handle, visibility)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, platform)
       DO UPDATE SET handle = EXCLUDED.handle, visibility = EXCLUDED.visibility
         RETURNING platform, handle, visibility`,
      [ME.toString(), idx, handle, vis === 0 || vis === 2 ? vis : 1],
    );
    json(res, 200, toLink(rows[0]!));
    return;
  }

  // ────────────────────────────────────────────────────────── vuốt
  if (path === "/v1/swipe" && method === "POST") {
    const body = await readBody(req);
    const to = BigInt(String(body["to"] ?? "0"));
    const action = String(body["action"] ?? "");
    // pairKey luôn "min:max" — MỘT biểu diễn duy nhất trong toàn hệ thống.
    const a = ME < to ? ME : to;
    const b = ME < to ? to : ME;
    const pairKey = `${a}:${b}`;

    const matched = action === "like" && to % 4n === 0n;
    if (matched) {
      await pool.query(
        `INSERT INTO matches (pair_key, user_a, user_b) VALUES ($1, $2, $3)
         ON CONFLICT (pair_key) DO NOTHING`,
        [pairKey, a.toString(), b.toString()],
      );
    }
    json(res, 200, { matched, pair_key: pairKey });
    return;
  }

  // ─────────────────────────────────────────────── báo cáo · chặn
  const report = /^\/v1\/users\/([^/]+)\/report$/.exec(path);
  if (report && method === "POST") {
    const body = await readBody(req);
    await pool.query(
      `INSERT INTO reports (report_id, reporter_id, reported_user_id, reason, detail)
            VALUES ($1, $2, $3, $4, $5)`,
      [
        nextMessageId(),
        ME.toString(),
        report[1]!,
        Number(body["reason"] ?? 5),
        String(body["detail"] ?? ""),
      ],
    );
    json(res, 201, { ok: true });
    return;
  }

  const block = /^\/v1\/users\/([^/]+)\/block$/.exec(path);
  if (block && method === "POST") {
    await pool.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [ME.toString(), block[1]!],
    );
    json(res, 201, { ok: true });
    return;
  }

  // ───────────────────────────────────── đồng ý NĐ13 · xoá tài khoản
  if (path === "/v1/me/consents" && method === "POST") {
    const body = await readBody(req);
    /*
     * `policy_version` BẮT BUỘC, không có giá trị mặc định.
     *
     * Trước đây chỗ này là `?? "2026-08-01"`. Cái mặc định đó BỊA ra đúng thứ
     * mà cột `consents.policy_version` sinh ra để chứng minh: người dùng đã
     * đồng ý với BẢN NÀO. Client không gửi ⇒ ta không biết ⇒ ghi một con số
     * trông có vẻ đúng là tự tạo chứng cứ giả.
     *
     * Đã dính thật: web không gửi trường này, nên mọi bản ghi đồng ý qua web
     * mang phiên bản 2026-08-01 trong khi chính sách đang áp dụng là
     * 2026-08-14. Không có lỗi nào hiện ra ở đâu cả.
     */
    const pv = String(body["policy_version"] ?? "");
    if (pv === "") {
      json(res, 400, { error: "thiếu policy_version" });
      return;
    }
    // Ghi THÊM một hàng, không UPDATE hàng cũ: `consents` là sổ nhật ký, và NĐ13
    // đòi chứng minh được đã đồng ý hay rút vào LÚC NÀO với bản chính sách nào.
    // Ghi đè là xoá mất đúng thứ mà cột `policy_version` sinh ra để giữ.
    await pool.query(
      `INSERT INTO consents (consent_id, user_id, purpose, granted, policy_version)
            VALUES ($1, $2, $3, $4, $5)`,
      [
        nextMessageId(),
        ME.toString(),
        String(body["purpose"] ?? ""),
        Boolean(body["granted"]),
        pv,
      ],
    );
    json(res, 201, { ok: true });
    return;
  }

  if (path === "/v1/me" && method === "DELETE") {
    // Xoá MỀM. Purge cứng sau 30 ngày là việc của một job riêng.
    await pool.query(`UPDATE users SET deleted_at = now() WHERE user_id = $1`, [ME.toString()]);
    json(res, 200, { ok: true, purge_after_days: 30 });
    return;
  }

  if (path === "/v1/me/profile" && method === "PUT") {
    /*
     * Tạo hồ sơ lúc onboarding.
     *
     * PUT chứ không PATCH, và tách khỏi `PATCH /v1/me/profile`: PATCH có một
     * danh sách trắng SÁU trường cố ý không chứa `display_name`, `birth_date`,
     * `gender`. Ba trường đó là danh tính, không phải nội dung hồ sơ —
     * `birth_date` là cổng tuổi pháp lý, đổi tuỳ ý sau khi đã vào được app thì
     * cổng tuổi thành trang trí. Nên chúng chỉ đặt được MỘT LẦN, ở đây.
     *
     * `ON CONFLICT DO NOTHING` giữ đúng nghĩa "một lần": gọi lại không ghi đè
     * ngày sinh của một tài khoản đã có hồ sơ.
     */
    const body = await readBody(req);
    const ten = String(body["display_name"] ?? "").trim();
    const ngaySinh = String(body["birth_date"] ?? "");
    const gioi = Number(body["gender"]);

    if (ten === "" || !/^\d{4}-\d{2}-\d{2}$/.test(ngaySinh) || (gioi !== 0 && gioi !== 1)) {
      json(res, 400, { error: "thiếu display_name, birth_date (yyyy-mm-dd) hoặc gender (0|1)" });
      return;
    }

    /*
     * Kiểm tuổi LẠI ở server.
     *
     * Client đã kiểm bằng `validateBirthDate` của core, nhưng client là thứ
     * người ta sửa được. Cổng tuổi chỉ có giá trị khi phía server cũng từ chối
     * — nếu không, nó chỉ là một form mà ai biết mở DevTools là đi vòng qua.
     */
    const tuoi = await pool.query<{ du: boolean }>(
      `SELECT (($1::date + INTERVAL '18 years') <= now()) AS du`,
      [ngaySinh],
    );
    if (tuoi.rows[0]?.du !== true) {
      json(res, 403, { error: "nền tảng chỉ dành cho người từ 18 tuổi" });
      return;
    }

    await pool.query(
      `INSERT INTO profiles (user_id, display_name, birth_date, gender, job_title, community, interests)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        ME.toString(), ten, ngaySinh, gioi,
        String(body["job_title"] ?? ""), String(body["community"] ?? ""),
        Array.isArray(body["interests"]) ? (body["interests"] as string[]).map(String) : [],
      ],
    );
    // Mốc điểm đầu tiên: reason 0 = khởi tạo.
    void recordScore(ME, 0);
    json(res, 201, { ok: true });
    return;
  }

  /* --- Phong nhieu nguoi ---------------------------------------------- */

  if (path === "/v1/rooms" && method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 30) || 30, 100);
    const rows = await listRooms(q, limit);
    json(res, 200, {
      rooms: rows.map((r) => ({
        room_id: r.room_id,
        owner_id: r.owner_id,
        title: r.title,
        topic: r.topic,
        member_count: r.member_count,
        max_members: r.max_members,
        last_msg_at: r.last_msg_at.toISOString(),
      })),
    });
    return;
  }

  if (path === "/v1/rooms" && method === "POST") {
    const body = await readBody(req);
    const title = String(body["title"] ?? "").trim();
    if (title === "" || title.length > 80) {
      json(res, 400, { error: "tên phòng phải từ 1 đến 80 ký tự" });
      return;
    }
    // Trần người: kẹp ở SERVER, không tin số client gửi. Trần này là thứ giữ
    // cho tải kiểm duyệt ước lượng được — một người duyệt cho cả sản phẩm.
    const max = Math.min(Math.max(Number(body["max_members"] ?? 50) || 50, 2), 500);
    const id = await createRoom(ME, title, String(body["topic"] ?? "").slice(0, 200), max);
    json(res, 201, { room_id: id });
    return;
  }

  const roomJoin = path.match(/^\/v1\/rooms\/(\d+)\/join$/);
  if (roomJoin && method === "POST") {
    const r = await joinRoom(roomJoin[1]!, ME);
    if (!r.ok) {
      json(res, 409, { error: r.reason });
      return;
    }
    json(res, 200, { ok: true });
    return;
  }

  const roomLeave = path.match(/^\/v1\/rooms\/(\d+)\/leave$/);
  if (roomLeave && method === "POST") {
    await leaveRoom(roomLeave[1]!, ME);
    json(res, 200, { ok: true });
    return;
  }

  const roomView = path.match(/^\/v1\/rooms\/(\d+)$/);
  if (roomView && method === "GET") {
    const rid = roomView[1]!;
    const r = await pool.query(
      `SELECT room_id::text, owner_id::text, title, topic, member_count, max_members, status
         FROM rooms WHERE room_id = $1`,
      [rid],
    );
    if (r.rowCount === 0) {
      json(res, 404, { error: "phòng không tồn tại" });
      return;
    }

    // `scan_state <> 2` = bỏ tin đã bị ẩn. Lọc ở SERVER: lọc ở client thì nội
    // dung đã bị ẩn vẫn rời khỏi server rồi.
    const msgs = await pool.query(
      `SELECT m.message_id::text, m.sender_id::text, m.body, m.created_at,
              COALESCE(p.display_name, 'Người dùng') AS name
         FROM room_messages m
         LEFT JOIN profiles p ON p.user_id = m.sender_id
        WHERE m.room_id = $1 AND m.scan_state <> 2
        ORDER BY m.message_id DESC LIMIT 60`,
      [rid],
    );

    const mems = await pool.query(
      `SELECT rm.user_id::text, rm.role,
              COALESCE(p.display_name, 'Người dùng') AS name
         FROM room_members rm
         LEFT JOIN profiles p ON p.user_id = rm.user_id
        WHERE rm.room_id = $1 ORDER BY rm.role DESC, rm.joined_at LIMIT 200`,
      [rid],
    );

    const gifts = await pool.query(
      `SELECT g.gift_event_id::text, g.qty, c.glyph, c.name,
              COALESCE(pf.display_name, 'Người dùng') AS from_name,
              COALESCE(pt.display_name, 'Người dùng') AS to_name
         FROM gift_events g
         JOIN gift_catalog c ON c.gift_id = g.gift_id
         LEFT JOIN profiles pf ON pf.user_id = g.from_user
         LEFT JOIN profiles pt ON pt.user_id = g.to_user
        WHERE g.room_id = $1 ORDER BY g.created_at DESC LIMIT 20`,
      [rid],
    );

    const daVao = await pool.query(
      `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [rid, ME.toString()],
    );

    json(res, 200, {
      room: r.rows[0],
      joined: daVao.rowCount === 1,
      // Đảo lại thành thứ tự đọc: truy vấn lấy DESC để dùng index, giao diện
      // cần cũ → mới.
      messages: msgs.rows.reverse(),
      members: mems.rows,
      gifts: gifts.rows,
    });
    return;
  }

  const roomMsg = path.match(/^\/v1\/rooms\/(\d+)\/messages$/);
  if (roomMsg && method === "POST") {
    const body = await readBody(req);
    const text = String(body["body"] ?? "").trim();
    if (text === "" || text.length > 500) {
      json(res, 400, { error: "nội dung phải từ 1 đến 500 ký tự" });
      return;
    }
    const r = await postMessage(roomMsg[1]!, ME, text);
    // 429 khi vượt tốc độ, 403 cho các lý do còn lại: người gọi phân biệt được
    // "chờ một chút" với "bạn không được phép".
    if (!r.ok) {
      json(res, r.reason.includes("quá nhanh") ? 429 : 403, { error: r.reason });
      return;
    }
    json(res, 201, { message_id: r.messageId });
    return;
  }

  /* --- Vi, qua tang, goi nang cap ------------------------------------- */

  if (path === "/v1/me/wallet" && method === "GET") {
    const goi = await activeTier(ME);
    json(res, 200, {
      balance: await balanceOf(ME),
      tier: goi ? goi.tier : null,
      tier_expires_at: goi ? goi.expiresAt.toISOString() : null,
    });
    return;
  }

  if (path === "/v1/gifts" && method === "GET") {
    json(res, 200, { gifts: await giftCatalog() });
    return;
  }

  const giftSend = path.match(/^\/v1\/rooms\/(\d+)\/gifts$/);
  if (giftSend && method === "POST") {
    const body = await readBody(req);
    const r = await sendGift(
      giftSend[1]!,
      ME,
      BigInt(String(body["to_user"] ?? "0")),
      Number(body["gift_id"]),
      Number(body["qty"] ?? 1),
    );
    if (!r.ok) {
      // 402 riêng cho "không đủ xu": client cần phân biệt để mở màn nạp thay
      // vì hiện một lỗi chung chung.
      json(res, r.reason.includes("đủ xu") ? 402 : 400, { error: r.reason });
      return;
    }
    json(res, 201, {
      gift_event_id: r.giftEventId,
      spent: r.spent,
      earned: r.earned,
      balance: r.balance,
    });
    return;
  }

  if (path === "/v1/me/topup" && method === "POST") {
    /*
     * Nạp xu — ĐƯỜNG DEV, chưa nối cổng thanh toán thật.
     *
     * Ở production, endpoint này KHÔNG được tin client: xu chỉ được cộng khi
     * webhook đã ký của Apple/Google/VNPay tới nơi và chữ ký đã xác minh. Cho
     * client tự khai "tôi vừa trả tiền" là phát xu miễn phí cho bất kỳ ai gọi
     * được API.
     *
     * Nên nó khoá sau OTP_DEV_ECHO — cùng công tắc với việc lộ mã OTP, và cũng
     * vô hiệu khi NODE_ENV=production. Tầng bên dưới (`creditCoins`) thì đã
     * đúng cho thật: có khoá chống trùng, có khoá hàng ví, có ghi sổ cái.
     */
    if (process.env["OTP_DEV_ECHO"] !== "1" || process.env["NODE_ENV"] === "production") {
      json(res, 501, { error: "chưa nối cổng thanh toán" });
      return;
    }
    const body = await readBody(req);
    const coins = Math.min(Math.max(Number(body["coins"] ?? 0) || 0, 1), 100000);
    const ref = String(body["ref"] ?? `dev-${Date.now()}`);
    const moi = await creditCoins(ME, coins, 1, `manual:${ref}`, null);
    json(res, 200, { credited: moi, balance: await balanceOf(ME) });
    return;
  }

  if (path === "/v1/me/subscribe" && method === "POST") {
    if (process.env["OTP_DEV_ECHO"] !== "1" || process.env["NODE_ENV"] === "production") {
      json(res, 501, { error: "chưa nối cổng thanh toán" });
      return;
    }
    const body = await readBody(req);
    const tier = String(body["tier"] ?? "");
    if (tier !== "plus" && tier !== "gold") {
      json(res, 400, { error: "gói không hợp lệ" });
      return;
    }
    const days = Math.min(Math.max(Number(body["days"] ?? 30) || 30, 1), 365);
    const het = await grantTier(ME, tier, days, null);
    json(res, 201, { tier, expires_at: het.toISOString() });
    return;
  }

  /* ─── Xác thực ─────────────────────────────────────────────────────────
     Ba route này đứng NGOÀI mọi thứ khác: chúng là đường duy nhất để có token,
     nên chúng phải chạy được khi chưa có token. */

  if (path === "/v1/auth/otp/request" && method === "POST") {
    const body = await readBody(req);
    const r = await requestOtp(String(body["phone"] ?? ""));
    if (!r.ok) {
      // 429 chứ không 400 khi là chuyện nhịp gửi: người gọi không sai, chỉ sớm.
      const code = r.retryAfterS === undefined ? 400 : 429;
      json(res, code, { error: r.reason, retry_after_s: r.retryAfterS });
      return;
    }
    // `dev_code` chỉ có mặt khi OTP_DEV_ECHO=1 và không phải production.
    json(res, 200, { ok: true, resend_after_s: r.resendAfterS, dev_code: r.devCode });
    return;
  }

  if (path === "/v1/auth/otp/verify" && method === "POST") {
    const body = await readBody(req);
    const r = await verifyOtp(String(body["phone"] ?? ""), String(body["code"] ?? ""));
    if (!r.ok) {
      json(res, 401, { error: r.reason });
      return;
    }
    // `user_id` dạng chuỗi: BIGINT của Postgres vượt Number.MAX_SAFE_INTEGER,
    // qua JSON thành số là mất chữ số cuối một cách âm thầm.
    json(res, 200, { user_id: r.userId, token: r.token });
    return;
  }

  if (path === "/v1/auth/sign-out" && method === "POST") {
    // Thu hồi ở SERVER. Client quên token là chưa đủ: bản sao token trong log
    // hay trong lịch sử máy vẫn dùng được cho tới khi hàng này bị xoá.
    await revokeToken(req);
    json(res, 200, { ok: true });
    return;
  }

  json(res, 404, { error: "không có đường dẫn này" });
}

const server = createServer((req, res) => {
  void handle(req, res).catch((e: unknown) => {
    // Body quá lớn là lỗi CỦA NGƯỜI GỌI (413), không phải lỗi máy chủ. Gộp nó
    // vào 500 thì log đầy "lỗi máy chủ" cho một chuyện hoàn toàn bình thường.
    if (e instanceof BodyTooLarge) {
      if (!res.headersSent) json(res, 413, { error: "nội dung quá lớn" });
      // Đóng SAU khi đã trả lời. Phần thân còn lại vẫn đang bay tới; không đóng
      // thì tiến trình ngồi nhận nốt vài GB mà chẳng để làm gì.
      req.destroy();
      return;
    }
    console.error("[message-service]", e);
    if (!res.headersSent) json(res, 500, { error: "lỗi máy chủ" });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[message-service] đang nghe http://127.0.0.1:${PORT}`);
});
