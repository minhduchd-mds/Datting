import { pool, nextMessageId } from "./db.js";

/**
 * Phòng nhiều người, ví xu, và quà tặng.
 *
 * Toàn bộ phần đụng tới TIỀN nằm trong file này, không rải ra các route. Lý do
 * không phải gọn gàng: mỗi chỗ tự cộng trừ xu là một chỗ có thể quên khoá hàng
 * ví, và hậu quả của việc quên đó là xu tự sinh ra, hoặc biến mất khỏi tài
 * khoản của người đã trả tiền thật.
 */

/** Trần tin nhắn mỗi người trong một phòng, tính theo cửa sổ 10 giây. */
const RATE_WINDOW_S = 10;
const RATE_MAX_MSG = 5;

/* ───────────────────────────────────────────────────────── phòng ─────── */

export interface RoomRow {
  room_id: string;
  owner_id: string;
  title: string;
  topic: string | null;
  member_count: number;
  max_members: number;
  status: number;
  last_msg_at: Date;
}

/**
 * Danh sách/tìm phòng.
 *
 * `q` rỗng ⇒ phòng sôi động nhất. Có `q` ⇒ tìm theo tên bằng trigram
 * (`idx_rooms_search`). Dùng `%` (similarity) chứ không chỉ `ILIKE '%…%'`:
 * `ILIKE` với ký tự đại diện ở ĐẦU chuỗi không dùng được index nào nên nó quét
 * toàn bảng, và nó không khớp được "ca phe" với "Cà phê". Giữ `ILIKE` làm
 * nhánh phụ để chuỗi quá ngắn (trigram cần ít nhất 3 ký tự) vẫn tìm được.
 */
export async function listRooms(q: string, limit: number): Promise<RoomRow[]> {
  if (q.trim() === "") {
    const r = await pool.query<RoomRow>(
      `SELECT room_id::text, owner_id::text, title, topic, member_count, max_members,
              status, last_msg_at
         FROM rooms WHERE status = 0
         ORDER BY last_msg_at DESC LIMIT $1`,
      [limit],
    );
    return r.rows;
  }
  const r = await pool.query<RoomRow>(
    `SELECT room_id::text, owner_id::text, title, topic, member_count, max_members,
            status, last_msg_at
       FROM rooms
      WHERE status = 0 AND (title % $1 OR title ILIKE '%' || $1 || '%')
      ORDER BY similarity(title, $1) DESC, last_msg_at DESC
      LIMIT $2`,
    [q.trim(), limit],
  );
  return r.rows;
}

export async function createRoom(
  owner: bigint,
  title: string,
  topic: string,
  maxMembers: number,
): Promise<string> {
  const id = nextMessageId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO rooms (room_id, owner_id, title, topic, max_members)
            VALUES ($1, $2, $3, NULLIF($4, ''), $5)`,
      [id, owner.toString(), title, topic, maxMembers],
    );
    // Chủ phòng vào phòng ngay, role 2. Không làm việc này thì có một phòng
    // không ai ở, kể cả người vừa tạo ra nó.
    await client.query(`INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 2)`, [
      id,
      owner.toString(),
    ]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return id;
}

export type JoinResult = { ok: true } | { ok: false; reason: string };

/**
 * Vào phòng.
 *
 * Kiểm trần người TRONG cùng một câu lệnh với việc thêm hàng, không phải đọc
 * rồi ghi: hai người bấm vào cùng lúc ở phòng còn đúng một chỗ thì cả hai đều
 * đọc thấy "còn chỗ" và cả hai cùng vào.
 *
 * `INSERT ... SELECT ... WHERE` giải quyết bằng một câu: điều kiện được đánh
 * giá tại thời điểm ghi. `ON CONFLICT DO NOTHING` lo trường hợp vào lại phòng
 * mình đang ở (mở hai tab) — đó không phải lỗi.
 */
export async function joinRoom(roomId: string, user: bigint): Promise<JoinResult> {
  const r = await pool.query(
    `INSERT INTO room_members (room_id, user_id, role)
     SELECT $1, $2, 0 FROM rooms
      WHERE room_id = $1 AND status = 0 AND member_count < max_members
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [roomId, user.toString()],
  );
  if (r.rowCount === 1) return { ok: true };

  // Không thêm được: hoặc đã ở trong phòng, hoặc phòng đầy/đóng. Phân biệt để
  // thông báo nói đúng chuyện — "phòng đã đầy" và "bạn đã ở trong phòng" là
  // hai tình huống khác hẳn nhau với người dùng.
  const co = await pool.query(`SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`, [
    roomId,
    user.toString(),
  ]);
  if (co.rowCount === 1) return { ok: true };

  const p = await pool.query<{ status: number; day: boolean }>(
    `SELECT status, (member_count >= max_members) AS day FROM rooms WHERE room_id = $1`,
    [roomId],
  );
  const row = p.rows[0];
  if (!row) return { ok: false, reason: "Phòng không tồn tại." };
  if (row.status === 2) return { ok: false, reason: "Phòng đã bị tạm dừng." };
  if (row.status === 1) return { ok: false, reason: "Phòng đã đóng." };
  return { ok: false, reason: "Phòng đã đầy." };
}

export async function leaveRoom(roomId: string, user: bigint): Promise<void> {
  await pool.query(`DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`, [
    roomId,
    user.toString(),
  ]);
}

export type PostResult = { ok: true; messageId: string } | { ok: false; reason: string };

/**
 * Gửi tin vào phòng.
 *
 * Ba cổng, theo thứ tự rẻ tới đắt: có ở trong phòng không · có bị tắt tiếng
 * không · có gửi quá nhanh không.
 *
 * Giới hạn tốc độ nằm ở đây chứ không phải "để sau". Một tin xấu trong phòng
 * 200 người chạm tới 200 người ngay lập tức, mà đội kiểm duyệt là MỘT người
 * (CLAUDE.md). Không có trần thì một tài khoản rác làm ngập phòng nhanh hơn
 * bất kỳ ai có thể phản ứng.
 *
 * Đếm bằng PostgreSQL là đủ ở quy mô hiện tại và đúng tuyệt đối. Khi lượng
 * tăng thì chỗ đúng cho bộ đếm này là Valkey (như `impressionKey` của
 * match-service): nó không cần bền vững — mất bộ đếm chỉ nghĩa là cửa sổ đó
 * rộng ra một chút.
 */
export async function postMessage(
  roomId: string,
  user: bigint,
  body: string,
): Promise<PostResult> {
  const m = await pool.query<{ muted: boolean }>(
    `SELECT (muted_until IS NOT NULL AND muted_until > now()) AS muted
       FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, user.toString()],
  );
  const mem = m.rows[0];
  if (!mem) return { ok: false, reason: "Bạn chưa vào phòng này." };
  if (mem.muted) return { ok: false, reason: "Bạn đang bị tắt tiếng trong phòng." };

  const c = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM room_messages
      WHERE room_id = $1 AND sender_id = $2
        AND created_at > now() - make_interval(secs => $3)`,
    [roomId, user.toString(), RATE_WINDOW_S],
  );
  if (Number(c.rows[0]?.n ?? 0) >= RATE_MAX_MSG) {
    return { ok: false, reason: "Bạn đang gửi quá nhanh. Chờ vài giây rồi thử lại." };
  }

  const id = nextMessageId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO room_messages (room_id, message_id, sender_id, body) VALUES ($1, $2, $3, $4)`,
      [roomId, id, user.toString(), body],
    );
    // `last_msg_at` là thứ xếp hạng danh sách phòng. Cập nhật trong CÙNG giao
    // dịch: tách ra thì một phòng có tin mới vẫn tụt hạng khi lệnh thứ hai hỏng.
    await client.query(`UPDATE rooms SET last_msg_at = now() WHERE room_id = $1`, [roomId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { ok: true, messageId: id };
}

/* ──────────────────────────────────────────────────────────── ví ─────── */

/** Số dư. Đọc từ bản sao có khoá; sổ cái mới là nguồn để đối soát. */
export async function balanceOf(user: bigint): Promise<number> {
  const r = await pool.query<{ balance: string }>(
    `SELECT balance::text FROM wallets WHERE user_id = $1`,
    [user.toString()],
  );
  return Number(r.rows[0]?.balance ?? 0);
}

/**
 * Cộng xu sau khi thanh toán thành công.
 *
 * `idemKey` là bắt buộc, không phải tuỳ chọn. Webhook của cổng thanh toán GỬI
 * LẠI khi không nhận được 200 — đó là hành vi đúng của họ, không phải sự cố.
 * Không chống trùng thì một lần trả tiền cộng xu nhiều lần.
 *
 * Trả về `false` khi đã ghi rồi. Đó là THÀNH CÔNG dưới góc nhìn của người gọi:
 * kết quả mong muốn đã đạt được. Ném lỗi ở đây sẽ khiến cổng thanh toán tưởng
 * hỏng và gửi lại mãi.
 */
export async function creditCoins(
  user: bigint,
  coins: number,
  reason: number,
  idemKey: string,
  refId: string | null,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Ví phải tồn tại trước khi khoá được nó.
    await client.query(`INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
      user.toString(),
    ]);
    await client.query(`SELECT 1 FROM wallets WHERE user_id = $1 FOR UPDATE`, [user.toString()]);

    const ins = await client.query(
      `INSERT INTO coin_ledger (entry_id, user_id, delta, reason, ref_id, idem_key)
            VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (idem_key) DO NOTHING`,
      [nextMessageId(), user.toString(), coins, reason, refId, idemKey],
    );
    if (ins.rowCount === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `UPDATE wallets SET balance = balance + $2, updated_at = now() WHERE user_id = $1`,
      [user.toString(), coins],
    );
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/* ────────────────────────────────────────────────────── quà tặng ─────── */

export interface GiftRow {
  gift_id: number;
  code: string;
  name: string;
  price: number;
  glyph: string;
}

export async function giftCatalog(): Promise<GiftRow[]> {
  const r = await pool.query<GiftRow>(
    `SELECT gift_id, code, name, price, glyph FROM gift_catalog
      WHERE active ORDER BY sort_order`,
  );
  return r.rows;
}

export type GiftResult =
  | { ok: true; giftEventId: string; spent: number; earned: number; balance: number }
  | { ok: false; reason: string };

/**
 * Tặng quà trong phòng.
 *
 * ─── Vì sao khoá hai ví theo THỨ TỰ ID tăng dần ──────────────────────────
 * Giao dịch này khoá hai hàng ví. A tặng B trong khi B tặng A: nếu mỗi bên
 * khoá "ví mình trước, ví người kia sau" thì A giữ khoá A và chờ khoá B, còn B
 * giữ khoá B và chờ khoá A — deadlock. Postgres phát hiện và huỷ một bên, nên
 * nó biểu hiện thành lỗi ngẫu nhiên lúc tải cao: đúng loại lỗi không tái hiện
 * được khi ngồi đi tìm.
 *
 * Chữa bằng cách sắp xếp: LUÔN khoá theo `user_id` tăng dần, bất kể ai tặng
 * ai. Cùng một ý với bất biến `pairKey = min:max` của CLAUDE.md — có một thứ
 * tự chuẩn duy nhất thì không vòng chờ nào hình thành được.
 *
 * ─── Vì sao chốt giá vào `gift_events` ───────────────────────────────────
 * `unit_price` và `earn_rate` được sao chép vào sự kiện. Catalog là bảng sống;
 * không chốt thì báo cáo tháng trước tự đổi số khi hôm nay ai đó chỉnh giá.
 */
export async function sendGift(
  roomId: string,
  from: bigint,
  to: bigint,
  giftId: number,
  qty: number,
): Promise<GiftResult> {
  if (from === to) return { ok: false, reason: "Không thể tự tặng chính mình." };
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
    return { ok: false, reason: "Số lượng không hợp lệ." };
  }

  const g = await pool.query<{ price: number; earn_rate: number }>(
    `SELECT price, earn_rate FROM gift_catalog WHERE gift_id = $1 AND active`,
    [giftId],
  );
  const gift = g.rows[0];
  if (!gift) return { ok: false, reason: "Món quà này không còn." };

  // Cả hai phải Ở TRONG phòng. Tặng cho người không có mặt thì hiệu ứng quà
  // hiện ra cho một cái tên không ai thấy.
  const mem = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM room_members
      WHERE room_id = $1 AND user_id = ANY($2::bigint[])`,
    [roomId, [from.toString(), to.toString()]],
  );
  if (Number(mem.rows[0]?.n ?? 0) !== 2) {
    return { ok: false, reason: "Cả hai người phải đang ở trong phòng." };
  }

  const cost = gift.price * qty;
  const earned = Math.floor((cost * gift.earn_rate) / 100);
  const eventId = nextMessageId();

  // Thứ tự khoá chuẩn — xem chú thích deadlock ở trên.
  const [truoc, sau] = from < to ? [from, to] : [to, from];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO wallets (user_id) VALUES ($1), ($2) ON CONFLICT DO NOTHING`,
      [truoc.toString(), sau.toString()],
    );
    await client.query(
      `SELECT 1 FROM wallets WHERE user_id IN ($1, $2) ORDER BY user_id FOR UPDATE`,
      [truoc.toString(), sau.toString()],
    );

    const bal = await client.query<{ balance: string }>(
      `SELECT balance::text FROM wallets WHERE user_id = $1`,
      [from.toString()],
    );
    if (Number(bal.rows[0]?.balance ?? 0) < cost) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "Không đủ xu." };
    }

    await client.query(
      `INSERT INTO gift_events
         (gift_event_id, room_id, from_user, to_user, gift_id, qty, unit_price, earn_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [eventId, roomId, from.toString(), to.toString(), giftId, qty, gift.price, gift.earn_rate],
    );

    // Hai dòng sổ cái: trừ người tặng, cộng người nhận. `idem_key` để NULL —
    // đây không phải webhook gửi lại được; mỗi lần bấm tặng là một sự kiện mới.
    await client.query(
      `INSERT INTO coin_ledger (entry_id, user_id, delta, reason, ref_id)
            VALUES ($1, $2, $3, 2, $4), ($5, $6, $7, 3, $4)`,
      [nextMessageId(), from.toString(), -cost, eventId, nextMessageId(), to.toString(), earned],
    );
    await client.query(
      `UPDATE wallets SET balance = balance - $2, updated_at = now() WHERE user_id = $1`,
      [from.toString(), cost],
    );
    await client.query(
      `UPDATE wallets SET balance = balance + $2, updated_at = now() WHERE user_id = $1`,
      [to.toString(), earned],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return { ok: true, giftEventId: eventId, spent: cost, earned, balance: await balanceOf(from) };
}

/* ───────────────────────────────────────────────── gói nâng cấp ─────── */

/**
 * Gói còn hạn của một người, hoặc `null`.
 *
 * Trả về gói XA HẠN NHẤT chứ không phải gói mới nhất: mua thêm khi đang còn
 * hạn thì hai gói cùng sống, và quyền lợi phải theo cái kết thúc sau.
 */
export async function activeTier(user: bigint): Promise<{ tier: string; expiresAt: Date } | null> {
  const r = await pool.query<{ tier: string; expires_at: Date }>(
    `SELECT tier, expires_at FROM subscriptions
      WHERE user_id = $1 AND expires_at > now()
      ORDER BY expires_at DESC LIMIT 1`,
    [user.toString()],
  );
  const row = r.rows[0];
  return row ? { tier: row.tier, expiresAt: row.expires_at } : null;
}

/**
 * Kích hoạt gói sau khi đã thanh toán.
 *
 * CỘNG DỒN thời hạn thay vì đặt lại từ hôm nay: mua tiếp khi còn 20 ngày mà
 * đặt lại thành "30 ngày kể từ hôm nay" là NUỐT MẤT 20 ngày người dùng đã trả
 * tiền. Nối tiếp từ mốc hết hạn hiện có mới đúng.
 */
export async function grantTier(
  user: bigint,
  tier: string,
  days: number,
  paymentId: string | null,
): Promise<Date> {
  const r = await pool.query<{ expires_at: Date }>(
    `INSERT INTO subscriptions (sub_id, user_id, tier, started_at, expires_at, payment_id)
     SELECT $1, $2, $3, now(),
            COALESCE(
              (SELECT max(expires_at) FROM subscriptions
                WHERE user_id = $2 AND tier = $3 AND expires_at > now()),
              now()
            ) + make_interval(days => $4),
            $5
     RETURNING expires_at`,
    [nextMessageId(), user.toString(), tier, days, paymentId],
  );
  return r.rows[0]!.expires_at;
}
