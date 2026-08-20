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

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      ...cors(),
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
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
    const { rows } = await pool.query<{
      user_id: string; display_name: string; birth_date: Date; community: string | null;
      job_title: string | null; cdn_key: string | null; interests: string[];
    }>(
      `SELECT p.user_id::text, p.display_name, p.birth_date, p.community, p.job_title,
              p.interests,
              (SELECT ph.cdn_key FROM photos ph
                WHERE ph.user_id = p.user_id AND ph.moderation = ${PHOTO_APPROVED}
                ORDER BY ph.position LIMIT 1) AS cdn_key
         FROM profiles p WHERE p.user_id = ANY($1::bigint[])`,
      [ids],
    );
    // Tuổi tính TỪ ngày sinh, không lưu tuổi — `birth_date` là cột thật, tuổi là
    // giá trị dẫn xuất. Lưu tuổi là bảo đảm nó sai sau đúng một năm.
    const age = (d: Date) => Math.floor((Date.now() - d.getTime()) / 31_557_600_000);
    json(res, 200, {
      profiles: rows.map((r) => ({
        user_id: r.user_id,
        name: r.display_name,
        age: age(r.birth_date),
        community: r.community ?? "",
        job_title: r.job_title ?? undefined,
        photo_url: r.cdn_key ?? "",
        topics: r.interests.slice(0, 4),
      })),
    });
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
