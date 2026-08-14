/**
 * Hợp đồng HTTP giữa app và backend.
 *
 * Khai báo endpoint TRƯỚC, cài đặt sau. Hai lý do:
 *   1. Nhìn một chỗ là biết app cần server cung cấp những gì.
 *   2. Bản demo và bản thật buộc phải cùng một hình dạng dữ liệu, nên demo
 *      không trôi dạt khỏi thực tế.
 *
 * TRẠNG THÁI BACKEND HÔM NAY (services/match-service/src/server.ts):
 *   CÓ    GET  /v1/deck?uid=&limit=&max_km=
 *   CÓ    POST /v1/swipe
 *   CHƯA  OTP, hồ sơ, tin nhắn, báo cáo, đồng ý
 *
 * Chỗ thiếu lớn nhất: `/v1/deck` trả `user_id` + `p_match` + `breakdown`, KHÔNG
 * trả tên/tuổi/ảnh. Đó là đúng chức năng — match-service là service XẾP HẠNG,
 * không phải kho hồ sơ. Nhưng thẻ vuốt cần tên và ảnh, nên phải có bước hydrate
 * riêng (`/v1/profiles`). Tách như vậy còn cần thiết vì lý do kiểm duyệt: ảnh
 * CHƯA DUYỆT không được hiển thị công khai, và cổng chặn đó thuộc về service hồ
 * sơ chứ không phải service xếp hạng.
 */
import type { Card, SwipeAction } from "./components/SwipeDeck";
import type { Message, NotificationItem } from "./screens/SocialScreens";
import { currentSession, type ConsentPurpose } from "./session";

export const ENDPOINTS = {
  requestOtp: "/v1/auth/otp/request",
  verifyOtp: "/v1/auth/otp/verify",
  deck: "/v1/deck",
  swipe: "/v1/swipe",
  /** Hydrate hồ sơ theo lô. CHỈ trả ảnh đã duyệt. */
  profiles: "/v1/profiles",
  matches: "/v1/matches",
  messages: (matchId: string) => `/v1/matches/${matchId}/messages`,
  notifications: "/v1/me/notifications",
  notificationsRead: "/v1/me/notifications/read",
  report: "/v1/reports",
  block: (userId: string) => `/v1/users/${userId}/block`,
  unmatch: (matchId: string) => `/v1/matches/${matchId}`,
  consent: "/v1/me/consents",
} as const;

/** Chỉ số hiển thị trên thẻ và màn ăn mừng. */
export interface Breakdown {
  interest: number;
  personality: number;
  location: number;
}

export interface DeckCard extends Card {
  /** P(A→B) × P(B→A). Dùng để XẾP HẠNG, không dùng để hiển thị — xem displayPercent(). */
  pMatch: number;
  breakdown: Breakdown;
  commonPoints: { label: string; value: string }[];
}

export interface SwipeResult {
  matched: boolean;
  /**
   * `min:max`. MỘT biểu diễn duy nhất — xem bất biến số 1 trong CLAUDE.md.
   * Đây cũng chính là `matchId` dùng làm tham số route `/chat/[matchId]`: cặp
   * người dùng chỉ có một khoá, nên hội thoại cũng chỉ có một URL.
   */
  pairKey: string;
}

/** Một dòng trong danh sách "Kết đôi". Đủ để vẽ danh sách, không hơn. */
export interface MatchSummary {
  /** = pairKey. Xem SwipeResult.pairKey. */
  matchId: string;
  peerUserId: string;
  peerName: string;
  peerPhotoUrl: string;
  lastMessage: string | null;
  lastAt: number;
  unread: number;
}

export interface Api {
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<{ userId: string; token: string } | null>;
  fetchDeck(limit: number): Promise<DeckCard[]>;
  swipe(toUserId: string, action: SwipeAction): Promise<SwipeResult>;
  fetchMatches(): Promise<MatchSummary[]>;
  fetchMessages(matchId: string): Promise<Message[]>;
  sendMessage(matchId: string, body: string): Promise<Message>;
  fetchNotifications(): Promise<NotificationItem[]>;
  markNotificationsRead(): Promise<void>;
  report(userId: string, code: number, detail: string): Promise<void>;
  block(userId: string): Promise<void>;
  unmatch(matchId: string): Promise<void>;
  setConsent(purpose: ConsentPurpose, granted: boolean, policyVersion: string): Promise<void>;
}

/**
 * Khoá cặp theo bất biến số 1: `min:max`.
 *
 * PHẢI so sánh bằng BigInt, KHÔNG bằng chuỗi. So chuỗi cho `"10" < "9"` là đúng
 * theo thứ tự từ điển nhưng sai theo thứ tự số: cặp (9, 10) sẽ ra `"10:9"` ở
 * client và `"9:10"` ở server. Hai khoá cho cùng một cặp là đúng cái mà bất biến
 * số 1 sinh ra để ngăn — và `CHECK (user_a < user_b)` trong PostgreSQL không bắt
 * được, vì xét riêng thì cả hai hàng đều hợp lệ.
 *
 * Bản gốc: services/match-service/src/pairKey.ts. Hàm này phải khớp với nó
 * từng bit; ở đây là bản sao vì app không import được code của service.
 */
export function pairKeyOf(a: string, b: string): string {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? `${x}:${y}` : `${y}:${x}`;
}

/**
 * `p_match` là TÍCH của hai xác suất, nên một cặp rất hợp nhau vẫn ra ~0.25.
 * Đem chia trực tiếp thành "25%" là nói dối người dùng theo hướng bi quan, và
 * làm hỏng chính tín hiệu mình muốn truyền. Con số 80% trong Figma là điểm
 * TỔNG HỢP từ breakdown, không phải p_match.
 *
 * Quy tắc: p_match dùng để SẮP XẾP, breakdown dùng để HIỂN THỊ. Đừng trộn.
 */
export function displayPercent(b: Breakdown): number {
  return Math.round((b.interest + b.personality + b.location) / 3);
}

export const API_BASE = process.env["EXPO_PUBLIC_API_BASE"] ?? "";
export const IS_DEMO = API_BASE === "";

/* ===========================================================================
 * Bản HTTP
 * =========================================================================== */

class HttpApi implements Api {
  constructor(private readonly base: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const { token } = currentSession();
    const res = await fetch(this.base + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ""));
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async requestOtp(phone: string): Promise<void> {
    await this.call(ENDPOINTS.requestOtp, { method: "POST", body: JSON.stringify({ phone }) });
  }

  async verifyOtp(phone: string, code: string) {
    try {
      const r = await this.call<{ user_id: string; token: string }>(ENDPOINTS.verifyOtp, {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      return { userId: r.user_id, token: r.token };
    } catch (e) {
      // Mã sai là 401 — đó là câu trả lời hợp lệ, không phải sự cố.
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  }

  async fetchDeck(limit: number): Promise<DeckCard[]> {
    const { userId } = currentSession();
    if (!userId) return [];

    const ranked = await this.call<DeckResponse>(
      `${ENDPOINTS.deck}?uid=${encodeURIComponent(userId)}&limit=${limit}`,
    );
    if (ranked.cards.length === 0) return [];

    // Hydrate hồ sơ theo LÔ, không phải N lần gọi. Một deck 30 thẻ mà gọi 30
    // lần thì mạng 4G ở VN sẽ cho thấy ngay vì sao đó là ý tồi.
    const ids = ranked.cards.map((c) => c.user_id);
    const profiles = await this.call<{ profiles: ProfileDto[] }>(ENDPOINTS.profiles, {
      method: "POST",
      body: JSON.stringify({ user_ids: ids }),
    });
    const byId = new Map(profiles.profiles.map((p) => [p.user_id, p]));

    return ranked.cards.flatMap((c) => {
      const p = byId.get(c.user_id);
      // Không có hồ sơ (bị chặn, đã xoá, ảnh chưa duyệt) ⇒ BỎ thẻ, không dựng
      // thẻ rỗng. Thẻ không ảnh còn tệ hơn thẻ thiếu.
      if (!p) return [];
      return [toDeckCard(c, p)];
    });
  }

  async swipe(toUserId: string, action: SwipeAction): Promise<SwipeResult> {
    const { userId } = currentSession();
    const r = await this.call<{ matched: boolean; pair_key: string }>(ENDPOINTS.swipe, {
      method: "POST",
      body: JSON.stringify({ from: userId, to: toUserId, action }),
    });
    return { matched: r.matched, pairKey: r.pair_key };
  }

  async fetchMatches(): Promise<MatchSummary[]> {
    const r = await this.call<{ matches: MatchDto[] }>(ENDPOINTS.matches);
    return r.matches.map((m) => ({
      matchId: m.match_id,
      peerUserId: m.peer.user_id,
      peerName: m.peer.name,
      peerPhotoUrl: m.peer.photo_url,
      lastMessage: m.last_message ?? null,
      lastAt: m.last_at,
      unread: m.unread,
    }));
  }

  async fetchMessages(matchId: string): Promise<Message[]> {
    const r = await this.call<{ messages: MessageDto[] }>(ENDPOINTS.messages(matchId));
    return r.messages.map(toMessage);
  }

  async fetchNotifications(): Promise<NotificationItem[]> {
    const r = await this.call<{ items: NotificationItem[] }>(ENDPOINTS.notifications);
    return r.items;
  }

  async markNotificationsRead(): Promise<void> {
    await this.call(ENDPOINTS.notificationsRead, { method: "POST" });
  }

  async sendMessage(matchId: string, body: string): Promise<Message> {
    const r = await this.call<MessageDto>(ENDPOINTS.messages(matchId), {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    return toMessage(r);
  }

  async report(userId: string, code: number, detail: string): Promise<void> {
    await this.call(ENDPOINTS.report, {
      method: "POST",
      body: JSON.stringify({ reported_user_id: userId, reason: code, detail }),
    });
  }

  async block(userId: string): Promise<void> {
    await this.call(ENDPOINTS.block(userId), { method: "POST" });
  }

  async unmatch(matchId: string): Promise<void> {
    await this.call(ENDPOINTS.unmatch(matchId), { method: "DELETE" });
  }

  async setConsent(purpose: ConsentPurpose, granted: boolean, policyVersion: string): Promise<void> {
    await this.call(ENDPOINTS.consent, {
      method: "POST",
      body: JSON.stringify({ purpose, granted, policy_version: policyVersion }),
    });
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}`);
  }
}

interface DeckResponse {
  cards: {
    user_id: string;
    p_match: number;
    breakdown: Breakdown;
    common_points: {
      shared_interests: string[];
      shared_lifestyle: string[];
      same_community: boolean;
      shared_intent: string[];
    };
  }[];
}

interface ProfileDto {
  user_id: string;
  name: string;
  age: number;
  /** Nhãn khu vực đã làm mờ ("Cầu Giấy · cách 3 km"). KHÔNG BAO GIỜ là toạ độ. */
  community: string;
  photo_url: string;
  topics: string[];
}

interface MatchDto {
  match_id: string;
  peer: { user_id: string; name: string; photo_url: string };
  last_message?: string;
  last_at: number;
  unread: number;
}

interface MessageDto {
  id: string;
  body: string;
  from_me: boolean;
  at: number;
}

function toDeckCard(c: DeckResponse["cards"][number], p: ProfileDto): DeckCard {
  const points: { label: string; value: string }[] = [];
  if (c.common_points.shared_interests.length > 0) {
    points.push({ label: "Sở thích chung", value: c.common_points.shared_interests.join(", ") });
  }
  if (c.common_points.shared_lifestyle.length > 0) {
    points.push({ label: "Lối sống", value: c.common_points.shared_lifestyle.join(", ") });
  }
  if (c.common_points.shared_intent.length > 0) {
    points.push({ label: "Cùng ý định", value: c.common_points.shared_intent.join(", ") });
  }
  return {
    userId: p.user_id,
    name: p.name,
    age: p.age,
    community: p.community,
    photoUrl: p.photo_url,
    topics: p.topics,
    matchPercent: displayPercent(c.breakdown),
    pMatch: c.p_match,
    breakdown: c.breakdown,
    commonPoints: points,
  };
}

function toMessage(m: MessageDto): Message {
  return { id: m.id, body: m.body, fromMe: m.from_me, at: m.at, status: "sent" };
}

/* ===========================================================================
 * Bản demo — chạy được khi chưa có backend
 *
 * Không phải đồ trang trí: nó là thứ giúp bản build EAS mở lên là dùng được,
 * và giúp test luồng UI mà không cần dựng hạ tầng. Dữ liệu SINH TẤT ĐỊNH từ
 * một seed cố định, nên hai lần chạy cho cùng một bộ thẻ — bug tái hiện được.
 * =========================================================================== */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  "Linh", "Trang", "Ngọc", "Hà", "Mai", "Thu", "Vy", "Anh", "Quỳnh", "Hương",
  "Nam", "Minh", "Khoa", "Tuấn", "Duy", "Sơn", "Hải", "Long", "Phong", "Bình",
];
const AREAS = ["Cầu Giấy", "Ba Đình", "Đống Đa", "Hai Bà Trưng", "Thanh Xuân", "Tây Hồ"];
const TOPICS = [
  "Chạy bộ", "Cà phê", "Đọc sách", "Nghe nhạc", "Du lịch", "Nấu ăn", "Gym",
  "Chụp ảnh", "Xem phim", "Yoga", "Leo núi", "Đạp xe",
];
const LIFESTYLE = ["Dậy sớm", "Không hút thuốc", "Nuôi thú cưng", "Ăn chay"];
const INTENTS = ["Hẹn hò nghiêm túc", "Tìm hiểu từ từ", "Kết bạn trước"];

class DemoApi implements Api {
  private readonly rnd = mulberry32(20260814);
  private seq = 0;
  private readonly threads = new Map<string, Message[]>();
  /**
   * Thẻ đã phát ra, tra theo userId. Bản HTTP không cần cái này (server biết ai
   * là ai); bản demo cần, vì `swipe()` chỉ nhận `toUserId` mà danh sách kết đôi
   * lại phải hiện tên và ảnh. Giữ đúng chữ ký của Api quan trọng hơn sự tiện
   * tay — chữ ký lệch thì demo sẽ trôi khỏi bản thật lúc nào không biết.
   */
  private readonly issued = new Map<string, DeckCard>();
  private readonly matches = new Map<string, MatchSummary>();
  private readonly notifications: NotificationItem[] = [];

  async requestOtp(): Promise<void> {
    await sleep(400);
  }

  async verifyOtp(_phone: string, code: string) {
    await sleep(500);
    // Bản demo nhận mọi mã 6 số. Ràng buộc độ dài giữ nguyên để luồng "mã sai"
    // vẫn test được — bỏ hẳn kiểm tra thì nhánh đó không bao giờ chạy.
    if (!/^\d{6}$/.test(code)) return null;
    return { userId: "1", token: "demo-token" };
  }

  async fetchDeck(limit: number): Promise<DeckCard[]> {
    await sleep(600);
    return Array.from({ length: limit }, () => {
      const c = this.card();
      this.issued.set(c.userId, c);
      return c;
    });
  }

  async swipe(toUserId: string, action: SwipeAction): Promise<SwipeResult> {
    await sleep(180);
    const me = currentSession().userId ?? "1";
    const pairKey = pairKeyOf(me, toUserId);
    // ~22% like thành match — đủ để thấy màn ăn mừng khi thử, không nhiều tới
    // mức mất ý nghĩa.
    const matched = action !== "pass" && this.rnd() < 0.22;
    if (matched) {
      const c = this.issued.get(toUserId);
      const at = Date.now();
      this.matches.set(pairKey, {
        matchId: pairKey,
        peerUserId: toUserId,
        peerName: c?.name ?? "Bạn mới",
        peerPhotoUrl: c?.photoUrl ?? "",
        lastMessage: null,
        lastAt: at,
        unread: 0,
      });
      this.notifications.unshift({
        id: `n_${++this.seq}`,
        kind: "match",
        title: `Bạn và ${c?.name ?? "một người"} đã kết đôi`,
        body: "Gửi lời chào trước đi — người nhắn trước thường được trả lời.",
        at,
        read: false,
      });
    }
    return { matched, pairKey };
  }

  async fetchMatches(): Promise<MatchSummary[]> {
    await sleep(300);
    return [...this.matches.values()].sort((a, b) => b.lastAt - a.lastAt);
  }

  async fetchMessages(matchId: string): Promise<Message[]> {
    await sleep(300);
    return this.threads.get(matchId) ?? [];
  }

  async sendMessage(matchId: string, body: string): Promise<Message> {
    await sleep(250);
    const at = Date.now();
    const m: Message = { id: `m_${++this.seq}`, body, fromMe: true, at, status: "sent" };
    this.threads.set(matchId, [...(this.threads.get(matchId) ?? []), m]);
    const match = this.matches.get(matchId);
    if (match) this.matches.set(matchId, { ...match, lastMessage: body, lastAt: at });
    return m;
  }

  async fetchNotifications(): Promise<NotificationItem[]> {
    await sleep(250);
    return [...this.notifications];
  }

  async markNotificationsRead(): Promise<void> {
    await sleep(120);
    this.notifications.forEach((n, i) => {
      this.notifications[i] = { ...n, read: true };
    });
  }

  async report(): Promise<void> {
    await sleep(300);
  }
  async block(): Promise<void> {
    await sleep(300);
  }
  async unmatch(matchId: string): Promise<void> {
    await sleep(300);
    this.matches.delete(matchId);
    this.threads.delete(matchId);
  }
  async setConsent(): Promise<void> {
    await sleep(120);
  }

  private card(): DeckCard {
    const r = this.rnd;
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
    const id = String(1000 + ++this.seq);
    const breakdown: Breakdown = {
      interest: 40 + Math.floor(r() * 60),
      personality: 40 + Math.floor(r() * 60),
      location: 40 + Math.floor(r() * 60),
    };
    const topics = [...new Set([pick(TOPICS), pick(TOPICS), pick(TOPICS)])];
    return {
      userId: id,
      name: pick(NAMES),
      age: 20 + Math.floor(r() * 15),
      community: `${pick(AREAS)} · cách ${1 + Math.floor(r() * 12)} km`,
      // Ảnh giữ chỗ tất định theo id, không gọi mạng ngoài.
      photoUrl: `https://picsum.photos/seed/${id}/720/1080`,
      topics,
      matchPercent: displayPercent(breakdown),
      pMatch: Number((r() * 0.4 + 0.1).toFixed(4)),
      breakdown,
      commonPoints: [
        { label: "Sở thích chung", value: topics.join(", ") },
        { label: "Lối sống", value: pick(LIFESTYLE) },
        { label: "Cùng ý định", value: pick(INTENTS) },
      ],
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Một thực thể duy nhất cho cả app. */
export const api: Api = IS_DEMO ? new DemoApi() : new HttpApi(API_BASE);
