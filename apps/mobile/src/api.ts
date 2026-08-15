/**
 * Hợp đồng HTTP giữa app và backend.
 *
 * V2.1 tiếp tục nguyên tắc: UI demo và bản HTTP dùng cùng shape. Tính năng
 * backend chưa có phải degrade rõ ràng, không dựng dữ liệu giả thành dữ liệu thật.
 */
import type { Card, SwipeAction } from "./components/SwipeDeck";
import type { ProfilePrompt } from "./profileStore";
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
  likesYou: "/v1/me/likes-you",
  conversationStarters: (matchId: string) => `/v1/matches/${matchId}/conversation-starters`,
  messages: (matchId: string) => `/v1/matches/${matchId}/messages`,
  notifications: "/v1/me/notifications",
  notificationsRead: "/v1/me/notifications/read",
  report: "/v1/reports",
  block: (userId: string) => `/v1/users/${userId}/block`,
  unmatch: (matchId: string) => `/v1/matches/${matchId}`,
  consent: "/v1/me/consents",
} as const;

export interface Breakdown {
  interest: number;
  personality: number;
  location: number;
}

export interface CommonPoint {
  label: string;
  value: string;
}

export interface DeckCard extends Card {
  pMatch: number;
  breakdown: Breakdown;
  commonPoints: CommonPoint[];
  prompts: ProfilePrompt[];
}

export interface SwipeResult {
  matched: boolean;
  /** `min:max` — một biểu diễn duy nhất cho một cặp. */
  pairKey: string;
}

export interface MatchSummary {
  matchId: string;
  peerUserId: string;
  peerName: string;
  peerPhotoUrl: string;
  lastMessage: string | null;
  lastAt: number;
  unread: number;
  commonPoints?: CommonPoint[];
}

export interface LikesYouItem extends DeckCard {
  likedTarget: {
    kind: "profile" | "photo" | "prompt";
    label: string;
  };
  likedAt: number;
}

export interface ConversationStarterInput {
  matchId: string;
  peerName: string;
  commonPoints?: CommonPoint[];
  likeContext?: { kind: string; label: string } | null;
}

export interface Api {
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<{ userId: string; token: string } | null>;
  fetchDeck(limit: number): Promise<DeckCard[]>;
  swipe(toUserId: string, action: SwipeAction): Promise<SwipeResult>;
  fetchMatches(): Promise<MatchSummary[]>;
  fetchLikesYou(): Promise<LikesYouItem[]>;
  conversationStarters(input: ConversationStarterInput): Promise<string[]>;
  fetchMessages(matchId: string): Promise<Message[]>;
  sendMessage(matchId: string, body: string): Promise<Message>;
  fetchNotifications(): Promise<NotificationItem[]>;
  markNotificationsRead(): Promise<void>;
  report(userId: string, code: number, detail: string): Promise<void>;
  block(userId: string): Promise<void>;
  unmatch(matchId: string): Promise<void>;
  setConsent(purpose: ConsentPurpose, granted: boolean, policyVersion: string): Promise<void>;
}

export function pairKeyOf(a: string, b: string): string {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? `${x}:${y}` : `${y}:${x}`;
}

/** p_match dùng để xếp hạng; breakdown dùng để hiển thị. */
export function displayPercent(b: Breakdown): number {
  return Math.round((b.interest + b.personality + b.location) / 3);
}

export const API_BASE = process.env["EXPO_PUBLIC_API_BASE"] ?? "";
export const IS_DEMO = API_BASE === "";

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

    const ids = ranked.cards.map((c) => c.user_id);
    const profiles = await this.call<{ profiles: ProfileDto[] }>(ENDPOINTS.profiles, {
      method: "POST",
      body: JSON.stringify({ user_ids: ids }),
    });
    const byId = new Map(profiles.profiles.map((p) => [p.user_id, p]));

    return ranked.cards.flatMap((c) => {
      const p = byId.get(c.user_id);
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
      commonPoints: toCommonPoints(m.common_points),
    }));
  }

  async fetchLikesYou(): Promise<LikesYouItem[]> {
    try {
      const r = await this.call<{ items: LikesYouDto[] }>(ENDPOINTS.likesYou);
      return r.items.map(toLikesYouItem);
    } catch (e) {
      // Profile/social service chưa rollout endpoint này: UI vẫn chạy và nói rõ
      // chưa có dữ liệu thay vì coi 404 là lỗi toàn màn hình.
      if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return [];
      throw e;
    }
  }

  async conversationStarters(input: ConversationStarterInput): Promise<string[]> {
    try {
      const r = await this.call<{ suggestions: string[] }>(ENDPOINTS.conversationStarters(input.matchId), {
        method: "POST",
        body: JSON.stringify({
          peer_name: input.peerName,
          common_points: input.commonPoints ?? [],
          like_context: input.likeContext ?? null,
        }),
      });
      const safe = r.suggestions.filter((x) => typeof x === "string" && x.trim()).slice(0, 3);
      return safe.length > 0 ? safe : starterFallback(input);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return starterFallback(input);
      throw e;
    }
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
  constructor(readonly status: number, readonly body: string) {
    super(`HTTP ${status}`);
  }
}

interface CommonPointsDto {
  shared_interests?: string[];
  shared_lifestyle?: string[];
  same_community?: boolean;
  shared_intent?: string[];
}

interface DeckResponse {
  cards: {
    user_id: string;
    p_match: number;
    breakdown: Breakdown;
    common_points: CommonPointsDto;
  }[];
}

interface ProfileDto {
  user_id: string;
  name: string;
  age: number;
  /** Nhãn khu vực đã làm mờ. Không bao giờ là toạ độ. */
  community: string;
  photo_url: string;
  topics: string[];
  prompts?: { id: string; question: string; answer: string }[];
}

interface MatchDto {
  match_id: string;
  peer: { user_id: string; name: string; photo_url: string };
  last_message?: string;
  last_at: number;
  unread: number;
  common_points?: CommonPointsDto;
}

interface LikesYouDto {
  peer: ProfileDto;
  p_match: number;
  breakdown: Breakdown;
  common_points?: CommonPointsDto;
  liked_target?: { kind: "profile" | "photo" | "prompt"; label: string };
  liked_at: number;
}

interface MessageDto {
  id: string;
  body: string;
  from_me: boolean;
  at: number;
}

function normalizePrompts(input: ProfileDto["prompts"]): ProfilePrompt[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p) => p && typeof p.id === "string" && typeof p.question === "string" && typeof p.answer === "string" && p.answer.trim())
    .slice(0, 3)
    .map((p) => ({ id: p.id, question: p.question, answer: p.answer }));
}

function toCommonPoints(input?: CommonPointsDto): CommonPoint[] {
  if (!input) return [];
  const points: CommonPoint[] = [];
  if ((input.shared_interests?.length ?? 0) > 0) {
    points.push({ label: "Sở thích chung", value: input.shared_interests!.join(", ") });
  }
  if ((input.shared_lifestyle?.length ?? 0) > 0) {
    points.push({ label: "Lối sống", value: input.shared_lifestyle!.join(", ") });
  }
  if ((input.shared_intent?.length ?? 0) > 0) {
    points.push({ label: "Cùng ý định", value: input.shared_intent!.join(", ") });
  }
  if (input.same_community) points.push({ label: "Khu vực", value: "Ở gần nhau" });
  return points;
}

function toDeckCard(c: DeckResponse["cards"][number], p: ProfileDto): DeckCard {
  return {
    userId: p.user_id,
    name: p.name,
    age: p.age,
    community: p.community,
    photoUrl: p.photo_url,
    topics: p.topics,
    prompts: normalizePrompts(p.prompts),
    matchPercent: displayPercent(c.breakdown),
    pMatch: c.p_match,
    breakdown: c.breakdown,
    commonPoints: toCommonPoints(c.common_points),
  };
}

function toLikesYouItem(dto: LikesYouDto): LikesYouItem {
  const p = dto.peer;
  return {
    userId: p.user_id,
    name: p.name,
    age: p.age,
    community: p.community,
    photoUrl: p.photo_url,
    topics: p.topics,
    prompts: normalizePrompts(p.prompts),
    matchPercent: displayPercent(dto.breakdown),
    pMatch: dto.p_match,
    breakdown: dto.breakdown,
    commonPoints: toCommonPoints(dto.common_points),
    likedTarget: dto.liked_target ?? { kind: "profile", label: "Hồ sơ của bạn" },
    likedAt: dto.liked_at,
  };
}

function toMessage(m: MessageDto): Message {
  return { id: m.id, body: m.body, fromMe: m.from_me, at: m.at, status: "sent" };
}

/* ===========================================================================
 * Bản demo — deterministic để bug tái hiện được.
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
const TOPICS = ["Chạy bộ", "Cà phê", "Đọc sách", "Nghe nhạc", "Du lịch", "Nấu ăn", "Gym", "Chụp ảnh", "Xem phim", "Yoga", "Leo núi", "Đạp xe"];
const LIFESTYLE = ["Dậy sớm", "Không hút thuốc", "Nuôi thú cưng", "Ăn chay"];
const INTENTS = ["Hẹn hò nghiêm túc", "Tìm hiểu từ từ", "Kết bạn trước"];
const PROMPTS = [
  ["Điều nhỏ bé làm mình vui…", "Một ly cà phê ngon, trời mát và không cần nhìn đồng hồ."],
  ["Cuối tuần thường tìm mình ở…", "Một quán mới, đường chạy ven hồ hoặc đang thử nấu món chưa từng làm."],
  ["Cách nhanh nhất để rủ mình đi chơi…", "Đề xuất một nơi cụ thể và đừng nhắn ‘đi đâu cũng được’."],
] as const;

class DemoApi implements Api {
  private readonly rnd = mulberry32(20260814);
  private seq = 0;
  private readonly threads = new Map<string, Message[]>();
  private readonly issued = new Map<string, DeckCard>();
  private readonly matches = new Map<string, MatchSummary>();
  private readonly notifications: NotificationItem[] = [];
  private likesCache: LikesYouItem[] | null = null;

  async requestOtp(): Promise<void> { await sleep(400); }

  async verifyOtp(_phone: string, code: string) {
    await sleep(500);
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
    // Likes You là người kia đã like trước, nên like-back phải match chắc chắn.
    // Deck thường vẫn giữ xác suất demo 22% để thử cả hai nhánh matched/unmatched.
    const inbound = Boolean(this.likesCache?.some((x) => x.userId === toUserId));
    const matched = action !== "pass" && (inbound || this.rnd() < 0.22);
    if (matched) {
      const c = this.issued.get(toUserId) ?? this.likesCache?.find((x) => x.userId === toUserId);
      const at = Date.now();
      this.matches.set(pairKey, {
        matchId: pairKey,
        peerUserId: toUserId,
        peerName: c?.name ?? "Bạn mới",
        peerPhotoUrl: c?.photoUrl ?? "",
        lastMessage: null,
        lastAt: at,
        unread: 0,
        commonPoints: c?.commonPoints ?? [],
      });
      if (inbound && this.likesCache) {
        this.likesCache = this.likesCache.filter((x) => x.userId !== toUserId);
      }
      this.notifications.unshift({
        id: `n_${++this.seq}`,
        kind: "match",
        title: `Bạn và ${c?.name ?? "một người"} đã kết đôi`,
        body: "Gửi lời chào dựa trên điểm chung thay vì chỉ nói ‘hi’ nhé.",
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

  async fetchLikesYou(): Promise<LikesYouItem[]> {
    await sleep(360);
    if (!this.likesCache) {
      this.likesCache = Array.from({ length: 6 }, (_, index) => {
        const c = this.card();
        this.issued.set(c.userId, c);
        const prompt = c.prompts[index % Math.max(1, c.prompts.length)];
        return {
          ...c,
          likedTarget: prompt && index % 2 === 0
            ? { kind: "prompt" as const, label: prompt.answer }
            : { kind: "photo" as const, label: "Ảnh đầu tiên" },
          likedAt: Date.now() - index * 3_600_000,
        };
      });
    }
    return [...this.likesCache];
  }

  async conversationStarters(input: ConversationStarterInput): Promise<string[]> {
    await sleep(420);
    return starterFallback(input);
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
    this.notifications.forEach((n, i) => { this.notifications[i] = { ...n, read: true }; });
  }

  async report(): Promise<void> { await sleep(300); }
  async block(): Promise<void> { await sleep(300); }
  async unmatch(matchId: string): Promise<void> {
    await sleep(300);
    this.matches.delete(matchId);
    this.threads.delete(matchId);
  }
  async setConsent(): Promise<void> { await sleep(120); }

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
    const promptStart = Math.floor(r() * PROMPTS.length);
    const prompts: ProfilePrompt[] = [0, 1].map((offset) => {
      const pair = PROMPTS[(promptStart + offset) % PROMPTS.length] as (typeof PROMPTS)[number];
      return { id: `p_${id}_${offset}`, question: pair[0], answer: pair[1] };
    });
    return {
      userId: id,
      name: pick(NAMES),
      age: 20 + Math.floor(r() * 15),
      community: `${pick(AREAS)} · cách ${1 + Math.floor(r() * 12)} km`,
      photoUrl: `https://picsum.photos/seed/${id}/720/1080`,
      topics,
      prompts,
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

/**
 * Fallback không gọi model trên thiết bị. Khi endpoint AI chưa có, sinh câu mở
 * lời từ tín hiệu thật đã có; tuyệt đối không bịa thông tin cá nhân mới.
 */
export function starterFallback(input: ConversationStarterInput): string[] {
  const name = input.peerName || "bạn";
  const first = input.commonPoints?.[0];
  const second = input.commonPoints?.[1];
  const liked = input.likeContext?.label?.trim();
  const suggestions: string[] = [];

  if (liked) suggestions.push(`Mình thích đoạn “${truncate(liked, 58)}” trong hồ sơ của ${name}. Câu chuyện phía sau nó là gì vậy?`);
  if (first) suggestions.push(`Thấy hai đứa có điểm chung về ${first.label.toLowerCase()}: ${truncate(first.value, 58)}. ${name} bắt đầu thích điều đó từ khi nào?`);
  if (second) suggestions.push(`Nếu chọn một buổi hẹn liên quan tới ${truncate(second.value, 42)}, ${name} sẽ chọn kiểu nào?`);
  suggestions.push(`Chào ${name}! Mình muốn mở lời tử tế hơn một chữ “hi” — tuần này có điều gì làm bạn thấy vui nhất?`);

  return [...new Set(suggestions)].slice(0, 3);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const api: Api = IS_DEMO ? new DemoApi() : new HttpApi(API_BASE);
