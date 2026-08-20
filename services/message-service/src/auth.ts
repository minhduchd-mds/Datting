import { createHash, createHmac, randomInt, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { pool, nextMessageId } from "./db.js";

/**
 * Đăng nhập bằng SĐT + OTP.
 *
 * Danh tính của Datting CHỈ có một đường: số điện thoại đã xác thực. Không mật
 * khẩu, không email, không login MXH (thêm login MXH ⇒ App Store 4.8 bắt buộc
 * có "Sign in with Apple" ngang hàng — đó là quyết định sản phẩm, không phải
 * một dòng code). Nghĩa là file này LÀ toàn bộ cơ chế xác thực: mọi thứ khác
 * trong sản phẩm đứng trên nó.
 */

/** Mã sống 5 phút. Đủ để đọc SMS, không đủ để một tin nhắn cũ còn giá trị. */
const OTP_TTL_S = 300;

/**
 * Trần số lần nhập sai.
 *
 * Đây mới là thứ làm nên an toàn, không phải độ dài mã: mã 6 chữ số chỉ có một
 * triệu khả năng, không có trần thì một script dò hết trong vài giây. Tăng mã
 * lên 8 chữ số mà bỏ trần vẫn thua.
 */
const OTP_MAX_ATTEMPTS = 5;

/** Chờ giữa hai lần gửi. Xem chú thích chống dội tin nhắn ở `0007`. */
const OTP_RESEND_WAIT_S = 60;

/** Phiên sống 30 ngày. */
const TOKEN_TTL_S = 30 * 24 * 3600;

/**
 * Khoá băm mã OTP.
 *
 * Có khoá bí mật thì bảng tra cứu dựng sẵn vô dụng — không gian mã chỉ có một
 * triệu phần tử nên SHA-256 trần bị dò ngược trong vài giây. Giá trị mặc định
 * dưới đây CHỈ dùng cho máy dev; production phải đặt biến môi trường.
 */
const OTP_PEPPER = process.env["OTP_PEPPER"] ?? "dev-pepper-doi-truoc-khi-len-that";

/**
 * Trả mã OTP thẳng trong phản hồi HTTP.
 *
 * Đây là một LỖ HỔNG nếu bật ở production: ai gọi được endpoint xin mã cũng
 * đọc luôn được mã của số điện thoại người khác, tức là chiếm được mọi tài
 * khoản mà không cần chạm vào SMS. Nó tồn tại vì máy dev không có nhà mạng.
 *
 * Hai lớp khoá: phải bật tường minh, VÀ không bao giờ có tác dụng khi
 * `NODE_ENV=production`. Lớp thứ hai để một biến môi trường đặt nhầm không thể
 * biến thành sự cố.
 */
const DEV_ECHO =
  process.env["OTP_DEV_ECHO"] === "1" && process.env["NODE_ENV"] !== "production";

/**
 * Chuẩn hoá SĐT Việt Nam về E.164.
 *
 * Phải chuẩn hoá TRƯỚC khi chạm database: `users.phone_e164` là UNIQUE, nên
 * `0912345678` và `+84912345678` không chuẩn hoá sẽ thành HAI tài khoản của
 * cùng một người — và người đó sẽ không hiểu vì sao tin nhắn của mình biến mất.
 */
export function normalizePhoneVN(raw: string): string | null {
  const s = raw.replace(/[\s.()-]/g, "");
  if (/^0\d{9}$/.test(s)) return "+84" + s.slice(1);
  if (/^84\d{9}$/.test(s)) return "+" + s;
  if (/^\+84\d{9}$/.test(s)) return s;
  return null;
}

function hashCode(phone: string, code: string): string {
  return createHmac("sha256", OTP_PEPPER).update(phone + ":" + code).digest("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * `randomInt` của node:crypto, KHÔNG phải `Math.random()`.
 *
 * `Math.random()` là bộ sinh giả ngẫu nhiên đoán trước được: quan sát vài giá
 * trị là suy ra được trạng thái trong và dự đoán mã tiếp theo. Với thứ đứng
 * giữa người lạ và tài khoản của người khác thì đó là khác biệt duy nhất cần
 * quan tâm.
 */
function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type RequestOtpResult =
  | { ok: true; resendAfterS: number; devCode?: string }
  | { ok: false; reason: string; retryAfterS?: number };

export async function requestOtp(rawPhone: string): Promise<RequestOtpResult> {
  const phone = normalizePhoneVN(rawPhone);
  if (!phone) return { ok: false, reason: "Số điện thoại không hợp lệ." };

  // Chặn gửi lại quá dày. Kiểm TRƯỚC khi sinh mã: sinh rồi mới từ chối là đã
  // vô hiệu hoá mã người dùng đang cầm trong tay.
  const cu = await pool.query<{ con_lai: number }>(
    `SELECT CEIL(EXTRACT(EPOCH FROM (sent_at + make_interval(secs => $2) - now())))::int AS con_lai
       FROM otp_challenges WHERE phone_e164 = $1`,
    [phone, OTP_RESEND_WAIT_S],
  );
  const conLai = cu.rows[0]?.con_lai ?? 0;
  if (conLai > 0) {
    return { ok: false, reason: "Vui lòng đợi trước khi gửi lại.", retryAfterS: conLai };
  }

  const code = newCode();
  await pool.query(
    `INSERT INTO otp_challenges (phone_e164, code_hash, expires_at, attempts, sent_at)
          VALUES ($1, $2, now() + make_interval(secs => $3), 0, now())
     ON CONFLICT (phone_e164) DO UPDATE
        SET code_hash  = EXCLUDED.code_hash,
            expires_at = EXCLUDED.expires_at,
            -- Đặt lại bộ đếm: đây là một thách thức MỚI. Không đặt lại thì một
            -- người gõ sai 5 lần bị khoá vĩnh viễn khỏi số của chính mình.
            attempts   = 0,
            sent_at    = now()`,
    [phone, hashCode(phone, code), OTP_TTL_S],
  );

  // Ở dev không có nhà mạng. In ra log của server — log thì chỉ người đang chạy
  // service đọc được, còn trả về qua HTTP thì cả internet đọc được.
  console.log(`[auth] OTP cho ${phone}: ${code} (hết hạn sau ${OTP_TTL_S}s)`);

  return DEV_ECHO
    ? { ok: true, resendAfterS: OTP_RESEND_WAIT_S, devCode: code }
    : { ok: true, resendAfterS: OTP_RESEND_WAIT_S };
}

export type VerifyOtpResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: string };

export async function verifyOtp(rawPhone: string, code: string): Promise<VerifyOtpResult> {
  const phone = normalizePhoneVN(rawPhone);
  if (!phone) return { ok: false, reason: "Số điện thoại không hợp lệ." };

  const r = await pool.query<{ code_hash: string; attempts: number; het_han: boolean }>(
    `SELECT code_hash, attempts, (expires_at <= now()) AS het_han
       FROM otp_challenges WHERE phone_e164 = $1`,
    [phone],
  );
  const ch = r.rows[0];

  /*
   * Một thông điệp DUY NHẤT cho mọi kiểu hỏng ở dưới.
   *
   * "Số này chưa xin mã" và "mã sai" là hai câu khác nhau, và khác nhau đó tự
   * nó là một rò rỉ: gọi endpoint này hàng loạt là dò ra được số nào có tài
   * khoản trên một app hẹn hò. Với một số người, chỉ riêng việc "có tài khoản"
   * đã là thông tin họ không muốn ai biết.
   */
  const SAI = { ok: false as const, reason: "Mã không đúng hoặc đã hết hạn." };

  if (!ch || ch.het_han) return SAI;
  if (ch.attempts >= OTP_MAX_ATTEMPTS) return SAI;

  const mong = Buffer.from(ch.code_hash, "hex");
  const thuc = Buffer.from(hashCode(phone, code), "hex");
  // `timingSafeEqual` ném lỗi khi lệch độ dài, mà độ dài luôn bằng nhau vì cả
  // hai đều là SHA-256 — trừ khi hàng trong DB hỏng. Kiểm cho chắc.
  const dung = mong.length === thuc.length && timingSafeEqual(mong, thuc);

  if (!dung) {
    await pool.query(
      `UPDATE otp_challenges SET attempts = attempts + 1 WHERE phone_e164 = $1`,
      [phone],
    );
    return SAI;
  }

  // Đúng mã ⇒ thách thức chết ngay. Không xoá thì một mã dùng lại được nhiều
  // lần trong 5 phút còn lại.
  await pool.query(`DELETE FROM otp_challenges WHERE phone_e164 = $1`, [phone]);

  const u = await pool.query<{ user_id: string; status: number; da_xoa: boolean }>(
    `SELECT user_id::text, status, (deleted_at IS NOT NULL) AS da_xoa
       FROM users WHERE phone_e164 = $1`,
    [phone],
  );
  const cu2 = u.rows[0];
  let userId: string;

  if (!cu2) {
    // Đăng ký và đăng nhập là CÙNG một luồng: người dùng không phải tự biết
    // mình đã có tài khoản hay chưa.
    userId = nextMessageId();
    await pool.query(`INSERT INTO users (user_id, phone_e164) VALUES ($1, $2)`, [userId, phone]);
  } else {
    userId = cu2.user_id;
    if (cu2.status === 3) return { ok: false, reason: "Tài khoản này đã bị khoá." };

    if (cu2.da_xoa) {
      /*
       * Khôi phục tài khoản đang trong 30 ngày xoá mềm.
       *
       * `phone_e164` UNIQUE vẫn có hiệu lực với hàng đã xoá mềm — đó là CHỦ Ý
       * của `0001_init.sql`, để chặn xoá-rồi-tạo-lại nhằm né lệnh cấm. Lệnh
       * cấm đã bị chặn ở nhánh `status = 3` phía trên, nên tài khoản tự xoá
       * (không bị cấm) quay lại trong cửa sổ 30 ngày là đúng nghĩa "xoá mềm".
       * Từ chối ở đây sẽ khoá người ta ra ngoài suốt 30 ngày mà không có
       * đường nào vào lại.
       */
      await pool.query(`UPDATE users SET deleted_at = NULL, status = 0 WHERE user_id = $1`, [
        userId,
      ]);
      console.log(`[auth] khôi phục tài khoản xoá mềm ${userId}`);
    }
    await pool.query(`UPDATE users SET last_active_at = now() WHERE user_id = $1`, [userId]);
  }

  // 32 byte ngẫu nhiên mật mã. Server chỉ giữ băm — chuỗi thô này tồn tại đúng
  // một lần, trong phản hồi ngay dưới đây.
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO auth_tokens (token_hash, user_id, expires_at)
          VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [hashToken(token), userId, TOKEN_TTL_S],
  );

  return { ok: true, userId, token };
}

/**
 * Người dùng đứng sau một request, theo header `Authorization: Bearer`.
 *
 * ─── Ba kết quả, KHÔNG phải hai ────────────────────────────────────────────
 * Bản đầu trả `bigint | null` và người gọi rơi về người dùng mặc định khi
 * `null`. Đo thử thì thấy hậu quả: gửi `Bearer khong-phai-token-that` lại đọc
 * được hồ sơ của user 1.
 *
 * Gộp "không gửi token" với "token sai" là một lỗi LỘ DỮ LIỆU, không phải một
 * chi tiết gọn gàng. Phiên hết hạn sẽ âm thầm biến thành một người khác, và
 * người dùng thấy tin nhắn, kết nối, lượt thích của người đó — không có gì
 * trên màn hình báo rằng mình đã rơi ra khỏi phiên.
 *
 *   "vo-danh"  — KHÔNG có header. Người gọi được phép dùng đường lùi dev.
 *   "hong"     — CÓ header nhưng token sai/hết hạn. Phải 401, tuyệt đối không
 *                rơi về ai cả.
 *   "ok"       — token hợp lệ.
 */
export type Caller =
  | { kind: "vo-danh" }
  | { kind: "hong" }
  | { kind: "ok"; userId: bigint };

export async function userFromRequest(req: IncomingMessage): Promise<Caller> {
  const h = req.headers["authorization"];
  // Không có header ⇒ vô danh. Có header mà rỗng/sai dạng ⇒ hỏng: người gọi
  // ĐỊNH gửi token, nên im lặng bỏ qua là che mất một lỗi thật của họ.
  if (h === undefined) return { kind: "vo-danh" };
  if (typeof h !== "string" || !h.startsWith("Bearer ")) return { kind: "hong" };
  const token = h.slice(7).trim();
  if (token === "") return { kind: "hong" };

  const r = await pool.query<{ user_id: string }>(
    `UPDATE auth_tokens SET last_used_at = now()
      WHERE token_hash = $1 AND expires_at > now()
      RETURNING user_id::text`,
    [hashToken(token)],
  );
  const id = r.rows[0]?.user_id;
  return id === undefined ? { kind: "hong" } : { kind: "ok", userId: BigInt(id) };
}

/** Đăng xuất thiết bị hiện tại. Thu hồi THẬT, không chỉ quên ở phía client. */
export async function revokeToken(req: IncomingMessage): Promise<void> {
  const h = req.headers["authorization"];
  if (typeof h !== "string" || !h.startsWith("Bearer ")) return;
  await pool.query(`DELETE FROM auth_tokens WHERE token_hash = $1`, [hashToken(h.slice(7).trim())]);
}
