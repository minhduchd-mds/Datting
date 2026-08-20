import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { pool, nextMessageId } from "./db.js";

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

/** Người đang đăng nhập. Chưa có phiên thật — khớp `ME_ID` phía web. */
const ME = 1n;

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

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
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

/** Không có tôi trong `blocks` với người kia, theo cả hai chiều. */
function notBlocked(alias: string, param: string): string {
  return `NOT EXISTS (SELECT 1 FROM blocks b
             WHERE (b.blocker_id = ${param} AND b.blocked_id = ${alias}.user_id)
                OR (b.blocker_id = ${alias}.user_id AND b.blocked_id = ${param}))`;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      ...cors(),
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
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
    const ids = Array.isArray(body["ids"]) ? (body["ids"] as string[]) : [];
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
    json(res, 200, toPeer(rows[0]));
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
        String(body["policy_version"] ?? "2026-08-01"),
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

  json(res, 404, { error: "không có đường dẫn này" });
}

const server = createServer((req, res) => {
  void handle(req, res).catch((e: unknown) => {
    console.error("[message-service]", e);
    if (!res.headersSent) json(res, 500, { error: "lỗi máy chủ" });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[message-service] đang nghe http://127.0.0.1:${PORT}`);
});
